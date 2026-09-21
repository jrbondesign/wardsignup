import {
  DEFAULT_TIP_JAR_URL,
  isTipJarEnabled,
  resolveTipJarUrl,
  supportPageOutboundUrl,
  supportPagePath,
  tipJarOutboundUrl,
} from "@/lib/tip-jar";

describe("tip jar helpers", () => {
  const prevEnabled = process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
  const prevUrl = process.env.NEXT_PUBLIC_TIP_JAR_URL;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    else process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = prevEnabled;
    if (prevUrl === undefined) delete process.env.NEXT_PUBLIC_TIP_JAR_URL;
    else process.env.NEXT_PUBLIC_TIP_JAR_URL = prevUrl;
  });

  it("defaults to GitHub Sponsors URL", () => {
    delete process.env.NEXT_PUBLIC_TIP_JAR_URL;
    delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    expect(resolveTipJarUrl()).toBe(DEFAULT_TIP_JAR_URL);
    expect(isTipJarEnabled()).toBe(true);
  });

  it("prefers brand tipJarUrl over default", () => {
    delete process.env.NEXT_PUBLIC_TIP_JAR_URL;
    expect(resolveTipJarUrl({ tipJarUrl: "https://example.com/tip" })).toBe(
      "https://example.com/tip",
    );
  });

  it("env URL overrides brand", () => {
    process.env.NEXT_PUBLIC_TIP_JAR_URL = "https://example.com/env-tip";
    expect(
      resolveTipJarUrl({ tipJarUrl: "https://example.com/brand-tip" }),
    ).toBe("https://example.com/env-tip");
  });

  it("can be disabled via env", () => {
    process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = "0";
    expect(isTipJarEnabled({ tipJarUrl: DEFAULT_TIP_JAR_URL })).toBe(false);
  });

  it("support page path is stable", () => {
    expect(supportPagePath()).toBe("/support-the-project");
  });

  it("adds UTM to outbound URLs", () => {
    delete process.env.NEXT_PUBLIC_TIP_JAR_URL;
    const sponsors = tipJarOutboundUrl(undefined, {
      utm_source: "organizer_email",
      utm_medium: "email",
      utm_campaign: "tip_jar",
    });
    expect(sponsors).toContain("utm_source=organizer_email");
    expect(sponsors).toContain("github.com/sponsors");

    const support = supportPageOutboundUrl(
      { siteUrl: "https://wardsignup.com" },
      { utm_source: "organizer_email", utm_medium: "email", utm_campaign: "tip_jar" },
    );
    expect(support).toBe(
      "https://wardsignup.com/support-the-project?utm_source=organizer_email&utm_medium=email&utm_campaign=tip_jar",
    );
  });
});
