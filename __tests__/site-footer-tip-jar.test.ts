import { getDefaultPublicBrand } from "@/lib/brand";
import { buildOrganizerEmailFooterHtml, buildParticipantEmailFooterHtml } from "@/lib/site-footer";

describe("email footers", () => {
  const prevEnabled = process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;

  afterEach(() => {
    if (prevEnabled === undefined) delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    else process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = prevEnabled;
  });

  it("organizer footer includes soft tip jar line when enabled", () => {
    delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    const html = buildOrganizerEmailFooterHtml(getDefaultPublicBrand());
    expect(html).toContain("/support-the-project");
    expect(html).toContain("utm_source=organizer_email");
    expect(html).toContain("optional hosting support");
    expect(html).toContain("Know someone who could use this?");
  });

  it("organizer footer omits tip line when tip jar disabled", () => {
    process.env.NEXT_PUBLIC_TIP_JAR_ENABLED = "0";
    const html = buildOrganizerEmailFooterHtml(getDefaultPublicBrand());
    expect(html).not.toContain("optional hosting support");
    expect(html).toContain("Know someone who could use this?");
  });

  it("participant footer never asks for donations", () => {
    delete process.env.NEXT_PUBLIC_TIP_JAR_ENABLED;
    const html = buildParticipantEmailFooterHtml(getDefaultPublicBrand());
    expect(html).not.toContain("/support-the-project");
    expect(html).not.toContain("hosting support");
    expect(html).toContain("Create a free signup");
  });
});
