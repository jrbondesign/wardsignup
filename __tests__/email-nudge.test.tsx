/**
 * Email nudge experiment (flag email-capture-next). Spec locked by Priya
 * Oct 18, 2026. Control = the #89 form, unchanged. Fails closed.
 */
import { readFileSync } from "fs";
import { join } from "path";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import EmailNudgePrompt from "@/components/EmailNudgePrompt";
import {
  EMAIL_NUDGE_COPY,
  EMAIL_NUDGE_EVENTS,
  EMAIL_NUDGE_FLAG,
  EMAIL_NUDGE_SKIP_STORAGE_KEY,
  EMAIL_NUDGE_TIMING,
  hasSkippedEmailNudge,
  isEmailNudgeEligibleSheet,
  readEmailNudgeVariant,
  rememberEmailNudgeSkip,
  shouldShowEmailNudge,
} from "@/lib/email-nudge";

const flagClient = (value: unknown, loaded = true) => ({
  getFeatureFlag: jest.fn(() => value as string | boolean | undefined),
  featureFlags: { hasLoadedFlags: loaded },
});

describe("flag", () => {
  it("uses the spec key and events", () => {
    expect(EMAIL_NUDGE_FLAG).toBe("email-capture-next");
    expect(EMAIL_NUDGE_EVENTS).toEqual({ shown: "email_nudge_shown", add: "email_nudge_add", skip: "email_nudge_skip" });
  });

  it("only 'test' turns the nudge on", () => {
    expect(readEmailNudgeVariant(flagClient("test"))).toBe("test");
    expect(readEmailNudgeVariant(flagClient("control"))).toBe("control");
    expect(readEmailNudgeVariant(flagClient(true))).toBe("control");
    expect(readEmailNudgeVariant(flagClient(false))).toBe("control");
    expect(readEmailNudgeVariant(flagClient("something-else"))).toBe("control");
  });

  it("flag off / no value: null (control, no exposure)", () => {
    expect(readEmailNudgeVariant(flagClient(undefined))).toBeNull();
    expect(readEmailNudgeVariant(flagClient(null))).toBeNull();
  });

  it("flags not loaded: never calls getFeatureFlag, so no exposure is logged", () => {
    const c = flagClient("test", false);
    expect(readEmailNudgeVariant(c)).toBeNull();
    expect(c.getFeatureFlag).not.toHaveBeenCalled();
  });

  it("PostHog error or no PostHog: null", () => {
    const throws = { getFeatureFlag: () => { throw new Error("boom"); }, featureFlags: { hasLoadedFlags: true } };
    expect(readEmailNudgeVariant(throws)).toBeNull();
    expect(readEmailNudgeVariant(null)).toBeNull();
    expect(readEmailNudgeVariant(undefined)).toBeNull();
    expect(readEmailNudgeVariant({} as never)).toBeNull();
  });
});

describe("shouldShowEmailNudge", () => {
  const dated = { id: "d1", session_date: "2026-11-01" };
  const undated = { id: "u1", session_date: null };
  const base = {
    variant: "test" as const,
    sheetType: "spots",
    email: "",
    sessions: [dated, undated],
    selectedIds: ["d1"],
    shownThisSignup: 0,
    skippedBefore: false,
  };

  it("shows for the test arm, a dated slot and no email", () => {
    expect(shouldShowEmailNudge(base)).toBe(true);
    expect(shouldShowEmailNudge({ ...base, sheetType: "rsvp" })).toBe(true);
    expect(shouldShowEmailNudge({ ...base, email: "   " })).toBe(true);
  });

  it("never for control, flag off or a flag error", () => {
    expect(shouldShowEmailNudge({ ...base, variant: "control" })).toBe(false);
    expect(shouldShowEmailNudge({ ...base, variant: null })).toBe(false);
  });

  it("never on items sheets, undated slots, or when an email is there", () => {
    expect(isEmailNudgeEligibleSheet("items")).toBe(false);
    expect(shouldShowEmailNudge({ ...base, sheetType: "items" })).toBe(false);
    expect(shouldShowEmailNudge({ ...base, selectedIds: ["u1"] })).toBe(false);
    expect(shouldShowEmailNudge({ ...base, selectedIds: [] })).toBe(false);
    expect(shouldShowEmailNudge({ ...base, email: "a@b.co" })).toBe(false);
  });

  it("once per signup, and never again after Skip", () => {
    expect(EMAIL_NUDGE_TIMING.maxPerSignup).toBe(1);
    expect(shouldShowEmailNudge({ ...base, shownThisSignup: 1 })).toBe(false);
    expect(shouldShowEmailNudge({ ...base, skippedBefore: true })).toBe(false);
  });
});

describe("skip memory", () => {
  beforeEach(() => window.localStorage.clear());

  it("stores the skip in this browser", () => {
    expect(hasSkippedEmailNudge()).toBe(false);
    rememberEmailNudgeSkip();
    expect(window.localStorage.getItem(EMAIL_NUDGE_SKIP_STORAGE_KEY)).toBe("1");
    expect(hasSkippedEmailNudge()).toBe(true);
  });

  it("storage errors don't throw", () => {
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(hasSkippedEmailNudge(broken)).toBe(false);
    expect(() => rememberEmailNudgeSkip(broken)).not.toThrow();
  });
});

describe("copy", () => {
  it("is the spec copy", () => {
    expect(EMAIL_NUDGE_COPY).toEqual({
      title: "Want a reminder before your time?",
      body: "Add your email and we'll send one. We never share or sell your info.",
      addButton: "Add email",
      skipButton: "Skip",
    });
  });
  it("has no dashes", () => {
    for (const line of Object.values(EMAIL_NUDGE_COPY)) expect(line).not.toMatch(/[\u2012\u2013\u2014\u2015-]/);
  });
});

describe("EmailNudgePrompt", () => {
  it("renders the copy and wires Add email and Skip", () => {
    const onAdd = jest.fn();
    const onSkip = jest.fn();
    render(<EmailNudgePrompt onAdd={onAdd} onSkip={onSkip} />);
    expect(screen.getByText(EMAIL_NUDGE_COPY.title)).toBeInTheDocument();
    expect(screen.getByText(EMAIL_NUDGE_COPY.body)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add email" }));
    fireEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);
    // buttons are type=button so they never submit the form by themselves
    for (const b of screen.getAllByRole("button")) expect(b).toHaveAttribute("type", "button");
  });
});

describe("public event page wiring", () => {
  // The public page is split into hooks and sections (EventPageClient):
  // the flag read lives in useSignupFunnel, the submit check and the nudge
  // handlers in deriveEventPageView, and the two slot forms are
  // SingleSessionSignup (inline) and SignupFormModal.
  const read = (f: string) => readFileSync(join(process.cwd(), f), "utf8");
  const funnelSrc = read("components/event/hooks/useSignupFunnel.ts");
  const viewSrc = read("components/event/hooks/deriveEventPageView.tsx");
  const formSrcs = [
    read("components/event/sections/SingleSessionSignup.tsx"),
    read("components/event/sections/SignupFormModal.tsx"),
  ];
  const allSrc = [funnelSrc, viewSrc, read("components/event/hooks/useEmailNudge.ts"), ...formSrcs].join("\n");

  it("reads the flag only on signup_form_started, on spots / rsvp sheets", () => {
    expect(funnelSrc).toContain("const started = funnel.formStarted(funnelCtx, form, trigger);");
    expect(funnelSrc).toContain('if (started && form === "slots" && isEmailNudgeEligibleSheet(eventType)) {');
    expect(allSrc.match(/readEmailNudgeVariant\(/g)).toHaveLength(1);
  });

  it("checks the nudge on submit, before the signup request, and Skip submits right away", () => {
    const nudgeIdx = viewSrc.indexOf("shouldShowEmailNudge({");
    const fetchIdx = viewSrc.indexOf('fetch("/api/signups/bulk"');
    expect(nudgeIdx).toBeGreaterThan(-1);
    expect(nudgeIdx).toBeLessThan(fetchIdx);
    expect(viewSrc).toContain("void handleSignup(undefined, { skipNudge: true });");
    expect(viewSrc).toContain("rememberEmailNudgeSkip();");
  });

  it("Add email focuses the email field in either form", () => {
    expect(viewSrc).toContain("emailInputRef.current?.focus();");
    for (const src of formSrcs) {
      expect(src.match(/ref=\{emailInputRef\}/g)).toHaveLength(1);
      expect(src.match(/\{nudgeOpen && <EmailNudgePrompt /g)).toHaveLength(1);
    }
  });

  it("nudge events carry org_id, campaign_id and the variant, never the email", () => {
    expect(funnelSrc).toContain('buildFunnelProps(funnelCtx, { variant: nudgeVariant() ?? "control", form: "slots" })');
    const block = funnelSrc.slice(funnelSrc.indexOf("const captureNudge"), funnelSrc.indexOf("const trackFormStarted"));
    expect(block).not.toMatch(/formData|email:/);
  });

  it("keeps the #89 hint unchanged in both forms (control)", () => {
    for (const src of formSrcs) {
      expect(src.match(/\{signerEmailHint\(sessions, signupSessionIds\)\}/g)).toHaveLength(1);
    }
  });
});
