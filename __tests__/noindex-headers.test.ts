/**
 * @jest-environment node
 */
import { metadata as wardMetadata } from "@/app/w/[slug]/layout";

const nextConfig = require("../next.config.js");

type Rule = { source: string; headers: { key: string; value: string }[] };

function robotsHeaderFor(rules: Rule[], path: string): string | undefined {
  let value: string | undefined;
  for (const r of rules) {
    const src = r.source.replace("/:path*", "(?:/.*)?");
    if (new RegExp(`^${src}$`).test(path)) {
      for (const h of r.headers) if (h.key === "X-Robots-Tag") value = h.value;
    }
  }
  return value;
}

describe("user-created pages stay out of search", () => {
  let rules: Rule[];
  beforeAll(async () => {
    rules = await nextConfig.headers();
  });

  it.each(["/w/rockford1stward", "/w/some-ward", "/event/abc", "/event/abc/flyer"])(
    "%s sends X-Robots-Tag noindex, nofollow",
    (path) => {
      expect(robotsHeaderFor(rules, path)).toBe("noindex, nofollow");
    }
  );

  it.each(["/", "/about", "/faq", "/privacy", "/terms", "/compare/signupgenius", "/wards"])(
    "%s is not noindexed",
    (path) => {
      expect(robotsHeaderFor(rules, path)).toBeUndefined();
    }
  );

  it("ward layout sets robots noindex meta", () => {
    expect(wardMetadata.robots).toEqual({ index: false, follow: false });
  });
});
