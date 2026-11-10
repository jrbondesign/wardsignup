/**
 * @jest-environment node
 */
const sendGuardedEmail = jest.fn();
jest.mock("@/lib/email-send", () => ({ sendGuardedEmail: (...a: unknown[]) => sendGuardedEmail(...a) }));

import { sendFeedbackAskEmail, sendFeedbackResponseNotification } from "@/lib/feedback-email";
import { BRAND_DEFINITIONS } from "@/lib/brand/brands";
import { readFileSync } from "fs";
import { join } from "path";

const brand = { ...BRAND_DEFINITIONS.wardsignup, siteHost: "wardsignup.com" } as never;
const saved = { ...process.env };

beforeEach(() => {
  sendGuardedEmail.mockReset().mockResolvedValue({ ok: true });
  process.env = { ...saved };
  for (const k of ["FEEDBACK_EMAIL_FROM", "WELCOME_EMAIL_FROM"]) delete process.env[k];
  process.env.WELCOME_REPLY_TO = "jonathan@wardsignup.com"; // no longer read
});
afterAll(() => {
  process.env = saved;
});

it("feedback ask comes from noreply@ with no Reply-To and no 'reply' copy", async () => {
  await sendFeedbackAskEmail({ brand, to: "leader@example.com", firstName: "Ann", formUrl: "https://wardsignup.com/feedback/abc" });
  const p = sendGuardedEmail.mock.calls[0][0];
  expect(p.from).toBe("Ward Signup <noreply@wardsignup.com>");
  expect(p.replyTo).toBeUndefined();
  expect(p.text).not.toMatch(/reply/i);
  expect(p.html).not.toMatch(/reply/i);
  expect(p.text).toContain("Can't click the link? Copy this into your browser: https://wardsignup.com/feedback/abc");
  expect(p.text).not.toMatch(/[\u2013\u2014]/);
});

it("feedback response goes to jonathan@wardsignup.com, Reply-To the creator", async () => {
  await sendFeedbackResponseNotification({
    brand,
    creatorEmail: "leader@example.com",
    pmf: "very",
    retention: null,
    value: null,
    blocker: null,
    respondedAt: "2026-11-10T16:00:00Z",
  });
  const p = sendGuardedEmail.mock.calls[0][0];
  expect(p.to).toBe("jonathan@wardsignup.com");
  expect(p.to).not.toContain("gmail");
  expect(p.replyTo).toBe("leader@example.com");
  expect(p.from).toBe("Ward Signup <noreply@wardsignup.com>");
});

it("welcome route sends with no Reply-To", () => {
  const src = readFileSync(join(process.cwd(), "app/api/welcome/route.ts"), "utf8");
  expect(src).not.toMatch(/WELCOME_REPLY_TO/);
  expect(src).not.toMatch(/replyTo\s*:/);
});
