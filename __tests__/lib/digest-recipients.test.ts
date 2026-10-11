import { campaignNeedsDigest, leaderDigestRecipient } from "@/lib/digest-recipients";

describe("leaderDigestRecipient", () => {
  it("sends the digest to a leader who is not the organizer", () => {
    expect(leaderDigestRecipient({ leader_email: " Lead@X.com " }, "org@x.com")).toBe("lead@x.com");
  });
  it("skips a leader who is the organizer", () => {
    expect(leaderDigestRecipient({ leader_email: "ORG@x.com" }, "org@x.com")).toBeNull();
  });
  it("skips a leader who opted in to per signup emails", () => {
    expect(
      leaderDigestRecipient({ leader_email: "lead@x.com", leader_signup_email_enabled: true }, "org@x.com"),
    ).toBeNull();
  });
  it("skips events with no leader", () => {
    expect(leaderDigestRecipient({ leader_email: null }, "org@x.com")).toBeNull();
  });
});

function fakeAdmin(counts: { signups: number; item_signups: number; sessions: number }) {
  const calls: Array<{ table: string; since: string }> = [];
  const admin = {
    from(table: "signups" | "item_signups" | "sessions") {
      const chain = {
        select: () => chain,
        eq: () => chain,
        gt: (_col: string, since: string) => {
          calls.push({ table, since });
          if (table === "sessions") {
            return { limit: async () => ({ data: counts.sessions ? [{ id: "s" }] : [] }) };
          }
          return Promise.resolve({ count: counts[table] });
        },
      };
      return chain;
    },
  };
  return { admin: admin as never, calls };
}

describe("campaignNeedsDigest", () => {
  const now = new Date("2026-10-12T00:05:00Z");

  it("skips an event with no new activity", async () => {
    const { admin } = fakeAdmin({ signups: 0, item_signups: 0, sessions: 0 });
    expect(await campaignNeedsDigest(admin, { id: "c", organizer_last_digest_sent_at: "2026-10-11T00:05:00Z" }, now)).toBe(false);
  });

  it("no longer sends a first digest without activity; looks back 24 hours", async () => {
    const { admin, calls } = fakeAdmin({ signups: 0, item_signups: 0, sessions: 0 });
    expect(await campaignNeedsDigest(admin, { id: "c", organizer_last_digest_sent_at: null }, now)).toBe(false);
    expect(calls[0].since).toBe("2026-10-11T00:05:00.000Z");
  });

  it("sends when there are new signups or item signups", async () => {
    expect(
      await campaignNeedsDigest(fakeAdmin({ signups: 3, item_signups: 0, sessions: 0 }).admin, { id: "c", organizer_last_digest_sent_at: null }, now),
    ).toBe(true);
    expect(
      await campaignNeedsDigest(fakeAdmin({ signups: 0, item_signups: 1, sessions: 0 }).admin, { id: "c", organizer_last_digest_sent_at: null }, now),
    ).toBe(true);
  });
});
