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
  const all = [
    organizerEmailFrom,
    inviteEmailFrom,
    welcomeEmailFrom,
    creatorNotifyEmailFrom,
    feedbackEmailFrom,
    magicLinkEmailFrom,
    participantEmailFrom,
    leaderEmailFrom,
  ];
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

  it("every automated email defaults to Ward Signup <noreply@wardsignup.com>", () => {
    for (const k of keys) delete process.env[k];
    for (const fn of all) expect(fn(brand)).toBe("Ward Signup <noreply@wardsignup.com>");
  });

  it("a non wardsignup.com override is ignored for every From", () => {
    for (const k of keys) process.env[k] = "PFS <bondesign@gmail.com>";
    for (const fn of all) expect(fn(brand)).toBe("Ward Signup <noreply@wardsignup.com>");
  });

  it("a wardsignup.com override still works", () => {
    process.env.WELCOME_EMAIL_FROM = "Jonathan <jonathan@wardsignup.com>";
    expect(welcomeEmailFrom(brand)).toBe("Jonathan <jonathan@wardsignup.com>");
  });
});
