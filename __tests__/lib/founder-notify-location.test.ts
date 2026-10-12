const sendGuardedEmail = jest.fn().mockResolvedValue({ ok: true });
jest.mock("@/lib/email-send", () => ({ sendGuardedEmail: (...a: unknown[]) => sendGuardedEmail(...a) }));
jest.mock("@/lib/resend-for-brand", () => ({ getResendForBrand: () => ({}) }));
jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: () => ({
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () =>
        table === "organizations"
          ? { maybeSingle: async () => ({ data: { owner_id: "u1" } }) }
          : Promise.resolve({ count: 1 });
      return chain;
    },
    rpc: async () => ({ data: true }),
  }),
}));

import { notifyFounderIfFirstEvent } from "@/lib/founder-notify";
import { getBrandDefinition, toPublicBrand } from "@/lib/brand/brands";

const base = {
  user: { id: "u1", email: "creator@example.com", user_metadata: { full_name: "Pat" } } as never,
  orgId: "o1",
  orgName: "Mesa 4th Ward",
  eventId: "e1",
  eventName: "Tithing Declaration",
  brand: toPublicBrand(getBrandDefinition("wardsignup")),
};

beforeEach(() => sendGuardedEmail.mockClear());

it("includes the creator location", async () => {
  await notifyFounderIfFirstEvent({ ...base, location: "Mesa, AZ" });
  const html = sendGuardedEmail.mock.calls[0][0].html as string;
  expect(html).toContain("Location: Mesa, AZ");
  expect(html).toContain("approximate, based on IP");
});

it("falls back to Location unknown", async () => {
  await notifyFounderIfFirstEvent({ ...base, location: null });
  const html = sendGuardedEmail.mock.calls[0][0].html as string;
  expect(html).toContain("Location unknown");
  expect(html).not.toContain("based on IP");
});
