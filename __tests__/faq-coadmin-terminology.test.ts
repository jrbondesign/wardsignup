/**
 * Test that FAQ uses correct "Co-admin" terminology
 */

import { describe, it, expect } from "@jest/globals";

describe("FAQ Co-admin terminology", () => {
  it("uses 'Co-admin' or 'Co-admins' instead of bare 'admin'/'admins'", () => {
    // The FAQ answer about co-admins
    const faqAnswer = "Yes. The organization owner can invite other leaders (for example counselors or clerks) as Co-admins. Co-admins can edit and delete events, manage signups, and view analytics. Only the owner can invite more Co-admins, delete the organization, rename the organization, or transfer ownership. Ward members signing up still need no account.";
    
    // Should use "Co-admin" or "Co-admins" (with capital C and hyphen)
    expect(faqAnswer).toContain("Co-admin");
    
    // Should not use bare "admins" or "admin" when referring to the role
    // (excluding "co-admin" itself)
    const withoutCoAdmin = faqAnswer.replace(/Co-admin/g, "");
    expect(withoutCoAdmin.toLowerCase()).not.toMatch(/\badmins?\b/);
  });

  it("does not use punctuation dashes", () => {
    const faqAnswer = "Yes. The organization owner can invite other leaders (for example counselors or clerks) as Co-admins. Co-admins can edit and delete events, manage signups, and view analytics. Only the owner can invite more Co-admins, delete the organization, rename the organization, or transfer ownership. Ward members signing up still need no account.";
    
    // Should not contain em dash, en dash, or " - "
    expect(faqAnswer).not.toContain("—");
    expect(faqAnswer).not.toContain("–");
    expect(faqAnswer).not.toContain(" - ");
  });
});
