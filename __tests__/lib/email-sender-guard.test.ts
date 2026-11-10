/**
 * @jest-environment node
 */
import { allowedEnvSender, checkSender, isAllowedSenderAddress } from "@/lib/email-sender-guard";
import { BRAND_DEFINITIONS } from "@/lib/brand/brands";
import {
  creatorNotifyEmailFrom,
  feedbackEmailFrom,
  inviteEmailFrom,
  leaderEmailFrom,
  magicLinkEmailFrom,
  organizerEmailFrom,
  participantEmailFrom,
  welcomeEmailFrom,
} from "@/lib/brand/email-from";

const saved = { ...process.env };
beforeEach(() => {
  process.env = { ...saved };
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterAll(() => {
  process.env = saved;
});

describe("sender allowlist", () => {
  it("accepts wardsignup.com senders", () => {
    expect(isAllowedSenderAddress("noreply@wardsignup.com")).toBe(true);
    expect(isAllowedSenderAddress("NoReply@WardSignup.com")).toBe(true);
    expect(isAllowedSenderAddress("jonathan@wardsignup.com")).toBe(true);
    expect(checkSender("Ward Signup <noreply@wardsignup.com>")).toEqual({
      ok: true,
      name: "Ward Signup",
      email: "noreply@wardsignup.com",
    });
  });

  it("refuses gmail and every other domain, lookalikes and junk", () => {
    for (const e of [
      "bondesign@gmail.com",
      "PFS <bondesign@gmail.com>",
      "noreply@wardsignup.com.evil.com",
      "noreply@mail.wardsignup.com",
      "noreply@evilwardsignup.com",
      "a@b@wardsignup.com",
      "noreply@pemly.app",
      "",
      "wardsignup.com",
    ]) {
      const r = checkSender(e);
      expect(r.ok).toBe(false);
    }
    expect(isAllowedSenderAddress(null)).toBe(false);
  });

  it("edge cases: whitespace, display-name tricks, header injection, lists", () => {
    expect(checkSender("  Ward Signup <  noreply@wardsignup.com  >  ").ok).toBe(true);
    expect(checkSender("JONATHAN@WARDSIGNUP.COM").ok).toBe(true);
    // A gmail address in the display name is not the sender; the angle address is.
    expect(checkSender('"bondesign@gmail.com" <noreply@wardsignup.com>')).toEqual({
      ok: true,
      name: "bondesign@gmail.com",
      email: "noreply@wardsignup.com",
    });
    for (const e of [
      "noreply@wardsignup.com <bondesign@gmail.com>",
      "Ward <noreply@wardsignup.com>, bondesign@gmail.com",
      "noreply@wardsignup.com, bondesign@gmail.com",
      "noreply@wardsignup.com\r\nBcc: bondesign@gmail.com",
      "Ward <noreply@wardsignup.com>\r\nBcc: x@gmail.com",
      "noreply@wardsignup.com.",
      "x@foo.wardsignup.com",
      "<noreply@wardsignup.com",
    ]) {
      expect(checkSender(e).ok).toBe(false);
    }
  });

  it("refusal logs the domain only, never the full address", () => {
    const err = console.error as jest.Mock;
    const r = checkSender("PFS <bondesign@gmail.com>", "welcome");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("gmail.com") });
    if (!r.ok) expect(r.error).not.toContain("bondesign");
    expect(err.mock.calls.flat().join(" ")).not.toContain("bondesign");
    expect(err.mock.calls.flat().join(" ")).toContain("kind=welcome");
  });

  it("env overrides must be wardsignup.com", () => {
    expect(allowedEnvSender("X", "Ward Signup <noreply@wardsignup.com>")).toBe("Ward Signup <noreply@wardsignup.com>");
    expect(allowedEnvSender("X", "bondesign@gmail.com")).toBeUndefined();
    expect(allowedEnvSender("X", "  ")).toBeUndefined();
  });
});

describe("brand From defaults", () => {
  const brand = { ...BRAND_DEFINITIONS.wardsignup, siteHost: "wardsignup.com" } as never;
  const keys = [
    "ORGANIZER_EMAIL_FROM",
    "INVITES_EMAIL_FROM",
    "WELCOME_EMAIL_FROM",
    "CREATOR_NOTIFY_FROM",
    "FEEDBACK_EMAIL_FROM",
    "MAGIC_LINK_EMAIL_FROM",
    "PARTICIPANT_EMAIL_FROM",
    "LEADER_EMAIL_FROM",
  ];

  const JONATHAN = "Jonathan <jonathan@wardsignup.com>";
  const NOREPLY = "Ward Signup <noreply@wardsignup.com>";

  it("welcome and feedback ask default to Jonathan <jonathan@wardsignup.com>; all others default to noreply@", () => {
    for (const k of keys) delete process.env[k];
    expect(welcomeEmailFrom(brand)).toBe(JONATHAN);
    expect(feedbackEmailFrom(brand)).toBe(JONATHAN);
    for (const fn of [organizerEmailFrom, inviteEmailFrom, creatorNotifyEmailFrom, magicLinkEmailFrom, participantEmailFrom, leaderEmailFrom]) {
      expect(fn(brand)).toBe(NOREPLY);
    }
  });

  it("a non wardsignup.com override is ignored for every From", () => {
    for (const k of keys) process.env[k] = "PFS <bondesign@gmail.com>";
    expect(welcomeEmailFrom(brand)).toBe(JONATHAN);
    expect(feedbackEmailFrom(brand)).toBe(JONATHAN);
    for (const fn of [organizerEmailFrom, inviteEmailFrom, creatorNotifyEmailFrom, magicLinkEmailFrom, participantEmailFrom, leaderEmailFrom]) {
      expect(fn(brand)).toBe(NOREPLY);
    }
  });

  it("a wardsignup.com override still works", () => {
    process.env.WELCOME_EMAIL_FROM = "Ward Signup <noreply@wardsignup.com>";
    expect(welcomeEmailFrom(brand)).toBe(NOREPLY);
    expect(feedbackEmailFrom(brand)).toBe(NOREPLY);
    process.env.FEEDBACK_EMAIL_FROM = JONATHAN;
    expect(feedbackEmailFrom(brand)).toBe(JONATHAN);
    expect(welcomeEmailFrom(brand)).toBe(NOREPLY);
  });
});
