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

it("feedback ask comes from jonathan@ with no Reply-To, and keeps the copy-into-browser line", async () => {
  await sendFeedbackAskEmail({ brand, to: "leader@example.com", firstName: "Ann", formUrl: "https://wardsignup.com/feedback/abc" });
  const p = sendGuardedEmail.mock.calls[0][0];
  expect(p.from).toBe("Jonathan <jonathan@wardsignup.com>");
  expect(p.replyTo).toBeUndefined();
  expect(p.text).not.toMatch(/support@wardsignup\.com/);
  expect(p.html).not.toMatch(/support@wardsignup\.com/);
  expect(p.text).toContain("Can't click the link? Copy this into your browser: https://wardsignup.com/feedback/abc");
  expect(p.text).toContain("Or just reply to this email.");
  expect(p.html).toContain("Or just reply to this email.");
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

it("welcome and feedback-ask routes send with no Reply-To and do not read WELCOME_REPLY_TO", () => {
  const welcome = readFileSync(join(process.cwd(), "app/api/welcome/route.ts"), "utf8");
  const ask = readFileSync(join(process.cwd(), "lib/feedback-email.ts"), "utf8");
  expect(welcome).not.toMatch(/WELCOME_REPLY_TO/);
  expect(ask).not.toMatch(/WELCOME_REPLY_TO/);
  expect(welcome).not.toMatch(/replyTo\s*:/);
  const askSend = ask.slice(0, ask.indexOf("sendFeedbackResponseNotification"));
  expect(askSend).not.toMatch(/replyTo\s*:/);
  expect(welcome + ask).not.toMatch(/bondesign@gmail\.com/);
});
