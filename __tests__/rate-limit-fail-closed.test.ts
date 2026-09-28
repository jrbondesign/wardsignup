import { consumeActionRate } from "@/lib/rate-limit";

describe("consumeActionRate fail-closed", () => {
  const prev = {
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    vercel: process.env.VERCEL_ENV,
    node: process.env.NODE_ENV,
  };

  afterEach(() => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = prev.key;
    process.env.NEXT_PUBLIC_SUPABASE_URL = prev.url;
    process.env.VERCEL_ENV = prev.vercel;
    process.env.NODE_ENV = prev.node;
  });

  it("denies in hosted production when the service role is missing", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.VERCEL_ENV = "production";
    process.env.NODE_ENV = "production";
    const result = await consumeActionRate("magic_link", new Request("https://wardsignup.com/"), 10);
    expect(result).toEqual({ allowed: false, reason: "rate_limited" });
  });

  it("fails open locally without the service role", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.VERCEL_ENV;
    process.env.NODE_ENV = "development";
    const result = await consumeActionRate("magic_link", new Request("http://localhost/"), 10);
    expect(result).toEqual({ allowed: true, reason: "unconfigured" });
  });
});
