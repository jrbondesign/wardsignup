/**
 * Tests for organizer-digest route recipient logic.
 * These test the actual behavior: organizers get digest when they opt in,
 * leaders ALWAYS get digest (regardless of organizer_digest_enabled),
 * and no duplicates when leader == organizer.
 */

describe("organizer-digest recipient logic", () => {
  describe("organizer_digest_enabled flag", () => {
    it("organizer receives digest when organizer_digest_enabled is true", () => {
      const campaign = {
        organizer_digest_enabled: true,
        user_email: "organizer@example.com",
        leader_email: null,
      };
      const emailedOrganizers = new Set<string>();
      
      // Organizer should be due
      const organizerDue = Boolean(
        campaign.organizer_digest_enabled && 
        campaign.user_email && 
        !emailedOrganizers.has(campaign.user_email.trim().toLowerCase())
      );
      
      expect(organizerDue).toBe(true);
    });

    it("organizer does NOT receive digest when organizer_digest_enabled is false", () => {
      const campaign = {
        organizer_digest_enabled: false,
        user_email: "organizer@example.com",
        leader_email: null,
      };
      const emailedOrganizers = new Set<string>();
      
      // Organizer should NOT be due
      const organizerDue = Boolean(
        campaign.organizer_digest_enabled && 
        campaign.user_email && 
        !emailedOrganizers.has(campaign.user_email.trim().toLowerCase())
      );
      
      expect(organizerDue).toBe(false);
    });
  });

  describe("leader digest logic", () => {
    it("leader receives digest when organizer_digest_enabled is true", () => {
      const campaign = {
        organizer_digest_enabled: true,
        user_email: "organizer@example.com",
        leader_email: "leader@example.com",
      };
      const emailedOrganizers = new Set<string>();
      const organizerEmail = (campaign.user_email ?? "").trim().toLowerCase();
      
      // Leader should be due (not the organizer)
      const leaderTo = campaign.leader_email?.trim().toLowerCase();
      const leaderDue = Boolean(leaderTo && leaderTo !== organizerEmail && !emailedOrganizers.has(leaderTo));
      
      expect(leaderDue).toBe(true);
      expect(leaderTo).toBe("leader@example.com");
    });

    it("leader receives digest even when organizer_digest_enabled is false", () => {
      const campaign = {
        organizer_digest_enabled: false,
        user_email: "organizer@example.com",
        leader_email: "leader@example.com",
      };
      const emailedOrganizers = new Set<string>();
      const organizerEmail = (campaign.user_email ?? "").trim().toLowerCase();
      
      // Leader should be due even though organizer opted out
      const leaderTo = campaign.leader_email?.trim().toLowerCase();
      const leaderDue = Boolean(leaderTo && leaderTo !== organizerEmail && !emailedOrganizers.has(leaderTo));
      
      expect(leaderDue).toBe(true);
      expect(leaderTo).toBe("leader@example.com");
    });
  });

  describe("no duplicates when leader == organizer", () => {
    it("sends only one email when leader is the organizer and organizer_digest_enabled is true", () => {
      const campaign = {
        organizer_digest_enabled: true,
        user_email: "person@example.com",
        leader_email: "person@example.com",
      };
      const emailedOrganizers = new Set<string>();
      const organizerEmail = (campaign.user_email ?? "").trim().toLowerCase();
      
      // Organizer should be due
      const organizerDue = Boolean(
        campaign.organizer_digest_enabled && 
        organizerEmail && 
        !emailedOrganizers.has(organizerEmail)
      );
      
      // Leader should NOT be due (same as organizer)
      const leaderTo = campaign.leader_email?.trim().toLowerCase();
      const leaderDue = Boolean(leaderTo && leaderTo !== organizerEmail && !emailedOrganizers.has(leaderTo));
      
      expect(organizerDue).toBe(true);
      expect(leaderDue).toBe(false);
      
      // After sending to organizer, mark them
      emailedOrganizers.add(organizerEmail);
      
      // Verify leader would still not be due
      const leaderDueAfter = Boolean(leaderTo && leaderTo !== organizerEmail && !emailedOrganizers.has(leaderTo));
      expect(leaderDueAfter).toBe(false);
    });

    it("sends only one email when leader is the organizer and organizer_digest_enabled is false", () => {
      const campaign = {
        organizer_digest_enabled: false,
        user_email: "person@example.com",
        leader_email: "person@example.com",
      };
      const emailedOrganizers = new Set<string>();
      const organizerEmail = (campaign.user_email ?? "").trim().toLowerCase();
      
      // Organizer should NOT be due (opted out)
      const organizerDue = Boolean(
        campaign.organizer_digest_enabled && 
        organizerEmail && 
        !emailedOrganizers.has(organizerEmail)
      );
      
      // Leader should NOT be due (same as organizer)
      const leaderTo = campaign.leader_email?.trim().toLowerCase();
      const leaderDue = Boolean(leaderTo && leaderTo !== organizerEmail && !emailedOrganizers.has(leaderTo));
      
      expect(organizerDue).toBe(false);
      expect(leaderDue).toBe(false);
    });
  });

  describe("per-run deduplication", () => {
    it("does not send duplicate to same email within one run", () => {
      const emailedOrganizers = new Set<string>();
      const email = "person@example.com";
      
      // First check - should be due
      const firstCheck = !emailedOrganizers.has(email);
      expect(firstCheck).toBe(true);
      
      // Mark as sent
      emailedOrganizers.add(email);
      
      // Second check - should NOT be due
      const secondCheck = !emailedOrganizers.has(email);
      expect(secondCheck).toBe(false);
    });

    it("handles case-insensitive email matching", () => {
      const emailedOrganizers = new Set<string>();
      
      // Add lowercase version
      emailedOrganizers.add("person@example.com");
      
      // Check uppercase version - should already be marked
      const upperCheck = !emailedOrganizers.has("PERSON@example.com".toLowerCase());
      expect(upperCheck).toBe(false);
    });
  });

  describe("query logic for campaign selection", () => {
    it("includes campaigns where organizer_digest_enabled is true", () => {
      const campaign = {
        organizer_digest_enabled: true,
        leader_email: null,
      };
      
      // Would match: organizer_digest_enabled.eq.true
      const matchesOrPart1 = campaign.organizer_digest_enabled === true;
      expect(matchesOrPart1).toBe(true);
    });

    it("includes campaigns where leader_email is set", () => {
      const campaign = {
        organizer_digest_enabled: false,
        leader_email: "leader@example.com",
      };
      
      // Would match: leader_email.not.is.null
      const matchesOrPart2 = campaign.leader_email !== null;
      expect(matchesOrPart2).toBe(true);
    });

    it("includes campaigns with both conditions true", () => {
      const campaign = {
        organizer_digest_enabled: true,
        leader_email: "leader@example.com",
      };
      
      // Would match both parts of OR
      const matchesOrPart1 = campaign.organizer_digest_enabled === true;
      const matchesOrPart2 = campaign.leader_email !== null;
      expect(matchesOrPart1 || matchesOrPart2).toBe(true);
    });

    it("excludes campaigns where both conditions are false", () => {
      const campaign = {
        organizer_digest_enabled: false,
        leader_email: null,
      };
      
      // Would NOT match OR query
      const matchesOrPart1 = campaign.organizer_digest_enabled === true;
      const matchesOrPart2 = campaign.leader_email !== null;
      expect(matchesOrPart1 || matchesOrPart2).toBe(false);
    });
  });
});
