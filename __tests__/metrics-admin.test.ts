import { parseMetricsAdminEmails, isMetricsAdminEmail } from "@/lib/metrics-admin";

describe("parseMetricsAdminEmails", () => {
  const prev = {
    emails: process.env.METRICS_ADMIN_EMAILS,
    email: process.env.METRICS_ADMIN_EMAIL,
    node: process.env.NODE_ENV,
    vercel: process.env.VERCEL_ENV,
  };

  afterEach(() => {
    process.env.METRICS_ADMIN_EMAILS = prev.emails;
    process.env.METRICS_ADMIN_EMAIL = prev.email;
    process.env.NODE_ENV = prev.node;
    process.env.VERCEL_ENV = prev.vercel;
  });

  it("uses env allowlist when set", () => {
    process.env.METRICS_ADMIN_EMAILS = "a@example.com, B@Example.com";
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    expect(parseMetricsAdminEmails()).toEqual(["a@example.com", "b@example.com"]);
    expect(isMetricsAdminEmail("A@example.com")).toBe(true);
  });

  it("denies everyone when env is empty in production", () => {
    delete process.env.METRICS_ADMIN_EMAILS;
    delete process.env.METRICS_ADMIN_EMAIL;
    process.env.NODE_ENV = "production";
    process.env.VERCEL_ENV = "production";
    expect(parseMetricsAdminEmails()).toEqual([]);
    expect(isMetricsAdminEmail("bondesign@gmail.com")).toBe(false);
  });

  it("keeps a local default only in development", () => {
    delete process.env.METRICS_ADMIN_EMAILS;
    delete process.env.METRICS_ADMIN_EMAIL;
    process.env.NODE_ENV = "development";
    delete process.env.VERCEL_ENV;
    expect(parseMetricsAdminEmails()).toEqual(["bondesign@gmail.com"]);
  });
});
