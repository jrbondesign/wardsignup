// Merging before the cutover migration must not call RPCs that only exist after it.
const rpc = jest.fn();
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({ rpc }) }));

import { consumeOwnedEmailSlot, releaseOwnedEmailSlot } from "@/lib/email-send";

const bucket = new Date("2026-11-10T12:00:00Z");

describe("owned dedupe slot gate", () => {
  beforeEach(() => {
    rpc.mockReset();
    delete process.env.EMAIL_PROVIDER_CUTOVER;
  });
  afterAll(() => {
    delete process.env.EMAIL_PROVIDER_CUTOVER;
  });

  it("gate off uses the live limiter, never try_consume_owned_slot", async () => {
    rpc.mockResolvedValue({ data: true, error: null });
    expect(await consumeOwnedEmailSlot("magic_link_dedupe", "k", 1, bucket, "h")).toBe(true);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc.mock.calls[0][0]).toBe("try_consume_action_rate");
  });

  it("gate off: a limiter error keeps the old fail-closed answer, not a 503", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await consumeOwnedEmailSlot("magic_link_dedupe", "k", 1, bucket, "h")).toBe(false);
  });

  it("gate off release is a no-op", async () => {
    expect(await releaseOwnedEmailSlot("magic_link_dedupe", "k", bucket, "h")).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("gate on uses the owned slot RPCs", async () => {
    process.env.EMAIL_PROVIDER_CUTOVER = "brevo";
    rpc.mockResolvedValue({ data: true, error: null });
    await consumeOwnedEmailSlot("magic_link_dedupe", "k", 1, bucket, "h");
    await releaseOwnedEmailSlot("magic_link_dedupe", "k", bucket, "h");
    expect(rpc.mock.calls.map((c) => c[0])).toEqual(["try_consume_owned_slot", "release_owned_slot"]);
  });
});
