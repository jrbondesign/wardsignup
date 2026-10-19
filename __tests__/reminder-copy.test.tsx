/**
 * Reminder visibility copy: the signer email hint switch (dated vs undated
 * events) and the creator only reminder note on the Manage page.
 */
import { existsSync, readdirSync, readFileSync } from "fs";
import { join } from "path";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import CreatorRemindersNote from "@/components/CreatorRemindersNote";
import {
  CREATOR_REMINDERS_NOTE,
  SIGNER_EMAIL_HINT_DATED,
  SIGNER_EMAIL_HINT_UNDATED,
  WELCOME_REMINDERS_LINE,
  signerEmailHint,
} from "@/lib/reminder-copy";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/** A page route plus the hooks/sections it was split into under components/<area>/. */
const readPage = (page: string, area: string) => {
  const parts = [`components/${area}/hooks`, `components/${area}/sections`]
    .filter((d) => existsSync(join(process.cwd(), d)))
    .flatMap((d) => readdirSync(join(process.cwd(), d)).sort().map((f) => `${d}/${f}`));
  return [page, ...parts].map(read).join("\n");
};

describe("reminder copy text", () => {
  it("matches the agreed wording", () => {
    expect(WELCOME_REMINDERS_LINE).toBe(
      "Reminders are automatic. People who add their email when they sign up get a reminder about a day before their time.",
    );
    expect(CREATOR_REMINDERS_NOTE).toBe("Reminders go out automatically, about a day before, to people who add an email.");
    expect(SIGNER_EMAIL_HINT_DATED).toBe("Add your email to get a reminder before your time. We never share or sell your info.");
    expect(SIGNER_EMAIL_HINT_UNDATED).toBe("Optional. For updates from the organizer. We never share or sell your info.");
  });

  it("lines contain no dashes", () => {
    for (const line of [WELCOME_REMINDERS_LINE, CREATOR_REMINDERS_NOTE, SIGNER_EMAIL_HINT_DATED, SIGNER_EMAIL_HINT_UNDATED]) {
      expect(line).not.toMatch(/[\u2012\u2013\u2014\u2015-]/);
    }
  });
});

describe("signerEmailHint", () => {
  const dated = { id: "d1", session_date: "2026-11-01" };
  const dated2 = { id: "d2", session_date: "2026-11-08" };
  const undated = { id: "u1", session_date: null };
  const undated2 = { id: "u2" };

  it("uses the reminder hint on fully dated events", () => {
    expect(signerEmailHint([dated, dated2])).toBe(SIGNER_EMAIL_HINT_DATED);
    expect(signerEmailHint([dated, dated2], ["d2"])).toBe(SIGNER_EMAIL_HINT_DATED);
  });

  it("keeps the undated hint for undated or recurring events", () => {
    expect(signerEmailHint([undated, undated2])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint([undated, undated2], ["u1", "u2"])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint([])).toBe(SIGNER_EMAIL_HINT_UNDATED);
  });

  it("on mixed events follows the selected slots", () => {
    const mixed = [dated, undated, undated2];
    expect(signerEmailHint(mixed, ["u1"])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint(mixed, ["u1", "u2"])).toBe(SIGNER_EMAIL_HINT_UNDATED);
    expect(signerEmailHint(mixed, ["d1"])).toBe(SIGNER_EMAIL_HINT_DATED);
    expect(signerEmailHint(mixed, ["u1", "d1"])).toBe(SIGNER_EMAIL_HINT_DATED);
    // nothing selected yet: falls back to whether the event has any dated slot
    expect(signerEmailHint(mixed, [])).toBe(SIGNER_EMAIL_HINT_DATED);
  });

  it("is what the public event page renders in both signup forms, for the slots being submitted", () => {
    const src = readPage("app/event/[id]/page.tsx", "event");
    expect(src.match(/\{signerEmailHint\(sessions, signupSessionIds\)\}/g)).toHaveLength(2);
    expect(src).toContain("const signupSessionIds = isSingleSession ? [sessions[0].id] : selectedSessions;");
    expect(src).not.toContain("reminder the day before");
  });
});

describe("CreatorRemindersNote", () => {
  it("shows to a confirmed creator or manager on slot events", () => {
    const { rerender } = render(<CreatorRemindersNote viewerCanManage eventType="spots" />);
    expect(screen.getByText(CREATOR_REMINDERS_NOTE)).toBeInTheDocument();
    rerender(<CreatorRemindersNote viewerCanManage eventType="rsvp" />);
    expect(screen.getByText(CREATOR_REMINDERS_NOTE)).toBeInTheDocument();
  });

  it("renders nothing for a viewer who cannot manage the event", () => {
    const { container } = render(<CreatorRemindersNote viewerCanManage={false} eventType="spots" />);
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText(CREATOR_REMINDERS_NOTE)).not.toBeInTheDocument();
  });

  it("renders nothing on items events, which get no reminders", () => {
    const { container } = render(<CreatorRemindersNote viewerCanManage eventType="items" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("is only wired into the Manage page, behind the access check", () => {
    const manage = readPage("app/admin/[id]/page.tsx", "admin");
    expect(manage).toContain("<CreatorRemindersNote viewerCanManage={viewerCanManage} eventType={eventType} />");
    const accessIdx = manage.indexOf("if (!hasAccess)");
    const grantIdx = manage.indexOf("setViewerCanManage(true)");
    expect(accessIdx).toBeGreaterThan(-1);
    expect(grantIdx).toBeGreaterThan(accessIdx);

    const publicPage = readPage("app/event/[id]/page.tsx", "event");
    expect(publicPage).not.toContain("CreatorRemindersNote");
    expect(publicPage).not.toContain(CREATOR_REMINDERS_NOTE);
  });
});
