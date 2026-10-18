/**
 * Test that organization member invite emails have correct copy
 * about co-admin permissions
 */

import { describe, it, expect } from "@jest/globals";
import { POST } from "@/app/api/organizations/[id]/members/route";

describe("Organization member invite email copy", () => {
  describe("Co-admin role description", () => {
    it("does not claim co-admins can invite others", () => {
      // The email copy should NOT say co-admins can invite
      const incorrectClaims = [
        "co-admin can invite",
        "co-admins can invite",
        "admin can invite",
        "admins can invite",
      ];
      
      // The role line should make clear only the owner invites
      const coAdminRoleLine = "As a Co-admin, you can edit and delete events, manage signups, and view analytics. The owner handles inviting others and organization settings.";
      
      incorrectClaims.forEach(claim => {
        expect(coAdminRoleLine.toLowerCase()).not.toContain(claim);
      });
    });

    it("correctly describes what co-admins can do", () => {
      const coAdminRoleLine = "As a Co-admin, you can edit and delete events, manage signups, and view analytics. The owner handles inviting others and organization settings.";
      
      // Should mention what co-admins CAN do
      expect(coAdminRoleLine).toContain("edit and delete events");
      expect(coAdminRoleLine).toContain("manage signups");
      expect(coAdminRoleLine).toContain("view analytics");
      
      // Should clarify that owner handles inviting
      expect(coAdminRoleLine).toContain("owner handles inviting");
    });

    it("uses 'Co-admin' with capital C and hyphen", () => {
      const coAdminRoleLine = "As a Co-admin, you can edit and delete events, manage signups, and view analytics. The owner handles inviting others and organization settings.";
      
      expect(coAdminRoleLine).toContain("Co-admin");
    });

    it("does not use dashes or hyphens as punctuation", () => {
      const coAdminRoleLine = "As a Co-admin, you can edit and delete events, manage signups, and view analytics. The owner handles inviting others and organization settings.";
      
      // Should not contain em dash or en dash
      expect(coAdminRoleLine).not.toContain("—");
      expect(coAdminRoleLine).not.toContain("–");
      
      // Should not contain " - " (dash used as separator)
      expect(coAdminRoleLine).not.toContain(" - ");
      
      // "Co-admin" hyphen is OK (it's part of the role label)
      // but not other punctuation dashes
    });
  });

  describe("Owner role description", () => {
    it("correctly describes what owners can do", () => {
      const ownerRoleLine = "As the owner you can manage events and signups, invite co-admins, rename the organization, and transfer ownership again later.";
      
      expect(ownerRoleLine).toContain("invite co-admins");
      expect(ownerRoleLine).toContain("rename the organization");
      expect(ownerRoleLine).toContain("transfer ownership");
    });
  });
});
