const getResendForBrand = jest.fn();
jest.mock("@/lib/resend-for-brand", () => ({ getResendForBrand: (...a: unknown[]) => getResendForBrand(...a) }));
jest.mock("@/lib/supabase-admin", () => ({ createServiceRoleClient: () => ({ rpc: jest.fn() }) }));
jest.mock("@/lib/posthog-server", () => ({ getPostHogClient: () => ({ capture: jest.fn() }) }));

import { hasEmailProviderConfigured } from "@/lib/email-deliver";

const brand = { id: "wardsignup" as const };
const saved = { ...process.env };
afterEach(() => {
  process.env = { ...saved };
});

it("is true with only Resend, only Brevo, or both; false with neither", () => {
  for (const k of ["EMAIL_FALLBACK_PROVIDER", "BREVO_API_KEY", "BREVO_SENDER_EMAIL"]) delete process.env[k];
  getResendForBrand.mockReturnValue(null);
  expect(hasEmailProviderConfigured(brand)).toBe(false);
  getResendForBrand.mockReturnValue({});
  expect(hasEmailProviderConfigured(brand)).toBe(true);
  getResendForBrand.mockReturnValue(null);
  Object.assign(process.env, { EMAIL_FALLBACK_PROVIDER: "brevo", BREVO_API_KEY: "k", BREVO_SENDER_EMAIL: "noreply@wardsignup.com" });
  expect(hasEmailProviderConfigured(brand)).toBe(true);
});
