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
} as never;

const consume = consumeEmailKeyRate as jest.Mock;
const send = sendGuardedEmail as jest.Mock;

beforeEach(() => {
  consume.mockReset();
  send.mockClear();
});

it("skips the leader email when organizer alerts already cover the leader", async () => {
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
  expect(consume).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("sends the first leader email of the hour with a cap of 1", async () => {
  consume.mockResolvedValue(true);
  const r = await sendLeaderSignupNotification({ campaign, sessions: [], memberName: "Pat" });
  expect(r.ok).toBe(true);
  expect(consume).toHaveBeenCalledWith("leader_notify", "leader:c1", 1);
  expect(send).toHaveBeenCalledTimes(1);
});

it("does not send once the hourly cap is used", async () => {
  consume.mockResolvedValue(false);
  const r = await sendLeaderSignupNotification({ campaign, sessions: [], memberName: "Pat" });
  expect(r.ok).toBe(false);
  expect(send).not.toHaveBeenCalled();
});
