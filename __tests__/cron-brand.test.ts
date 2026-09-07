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
  it("prefers known Host over wrong env", () => {
    expect(req("www.orgsignup.com", "wardsignup")).toBe("orgsignup");
    expect(req("ministrysignup.com", "wardsignup")).toBe("ministrysignup");
    expect(req("wardsignup.com", "orgsignup")).toBe("wardsignup");
  });

  it("falls back to NEXT_PUBLIC_BRAND_ID when Host unknown", () => {
    expect(req("cron.internal", "orgsignup")).toBe("orgsignup");
    expect(req("cron.internal", "ministrysignup")).toBe("ministrysignup");
  });

  it("defaults to wardsignup", () => {
    expect(req("cron.internal", "")).toBe("wardsignup");
    expect(req(null, undefined)).toBe("wardsignup");
  });
});
