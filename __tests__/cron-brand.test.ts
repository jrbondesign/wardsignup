import { resolveCronBrandId } from "@/lib/cron-brand";

function req(host: string | null, brandEnv?: string) {
  const prev = process.env.NEXT_PUBLIC_BRAND_ID;
  if (brandEnv === undefined) delete process.env.NEXT_PUBLIC_BRAND_ID;
  else process.env.NEXT_PUBLIC_BRAND_ID = brandEnv;
  const headers = {
    get(name: string) {
      const key = name.toLowerCase();
      if (key === "host") return host;
      if (key === "x-forwarded-host") return null;
      return null;
    },
  };
  const out = resolveCronBrandId({ headers } as unknown as Request);
  process.env.NEXT_PUBLIC_BRAND_ID = prev;
  return out;
}

describe("resolveCronBrandId", () => {
  it("resolves known Host regardless of env", () => {
    expect(req("wardsignup.com", "orgsignup")).toBe("wardsignup");
    expect(req("www.wardsignup.com", undefined)).toBe("wardsignup");
  });

  it("falls back to NEXT_PUBLIC_BRAND_ID when Host unknown", () => {
    expect(req("cron.internal", "wardsignup")).toBe("wardsignup");
  });

  it("ignores retired brands in Host and env", () => {
    expect(req("www.orgsignup.com", "orgsignup")).toBe("wardsignup");
    expect(req("ministrysignup.com", "ministrysignup")).toBe("wardsignup");
  });

  it("defaults to wardsignup", () => {
    expect(req("cron.internal", "")).toBe("wardsignup");
    expect(req(null, undefined)).toBe("wardsignup");
  });
});
