jest.mock("@/lib/email-send", () => ({
  consumeEmailKeyRate: jest.fn(),
  sendGuardedEmail: jest.fn().mockResolvedValue({ ok: true }),
}));
jest.mock("@/lib/resend-for-brand", () => ({
  hasResendConfiguredForBrand: () => true,
}));

import { consumeEmailKeyRate, sendGuardedEmail } from "@/lib/email-send";
import { sendLeaderSignupNotification } from "@/lib/leader-email";

const campaign = {
  id: "c1",
  name: "Tithing Declaration",
  brand_id: null,
  public_host: null,
  event_timezone: "America/Denver",
  event_end_date: null,
  leader_name: "Bishop",
  leader_email: "lead@example.com",
  leader_signup_email_enabled: true,
} as never;

const consume = consumeEmailKeyRate as jest.Mock;
const send = sendGuardedEmail as jest.Mock;

beforeEach(() => {
  consume.mockReset();
  send.mockClear();
});

it("skips all per-signup leader emails (now covered by digest)", async () => {
  const r = await sendLeaderSignupNotification({
    campaign,
    sessions: [],
    memberName: "Pat",
  });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("digest");
  expect(consume).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("skips even when organizer alerts cover the leader", async () => {
  const r = await sendLeaderSignupNotification({
    campaign: {
      ...(campaign as object),
      user_email: "LEAD@example.com",
      organizer_instant_notify_enabled: true,
    } as never,
    sessions: [],
    memberName: "Pat",
  });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("digest");
  expect(consume).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("skips even with leader_signup_email_enabled true", async () => {
  consume.mockResolvedValue(true);
  const r = await sendLeaderSignupNotification({
    campaign: { ...(campaign as object), leader_signup_email_enabled: true } as never,
    sessions: [],
    memberName: "Pat",
  });
  expect(r.ok).toBe(false);
  expect(r.error).toContain("digest");
  expect(consume).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});
