/**
 * @jest-environment node
 */
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";

const ORG = "50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7";

afterEach(() => {
  delete process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS;
});

describe("isCoverImageEnabledForOrg", () => {
  it("is off for everyone when the allowlist is unset", () => {
    expect(isCoverImageEnabledForOrg(ORG)).toBe(false);
  });

  it("is on only for allowlisted orgs", () => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = ` ${ORG} , other-org`;
    expect(isCoverImageEnabledForOrg(ORG)).toBe(true);
    expect(isCoverImageEnabledForOrg("someone-else")).toBe(false);
    expect(isCoverImageEnabledForOrg(null)).toBe(false);
  });
});
