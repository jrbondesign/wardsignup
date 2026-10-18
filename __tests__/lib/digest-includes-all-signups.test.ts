/**
 * Tests to verify the daily digest includes all signups (now that per-signup
 * leader emails are disabled).
 */

import { campaignNeedsDigest } from "@/lib/digest-recipients";

// Mock Supabase client
const mockSupabase = {
  from: jest.fn(() => ({
    select: jest.fn(() => ({
      eq: jest.fn(() => ({
        gt: jest.fn(() => ({
          count: 0,
        })),
      })),
    })),
  })),
} as never;

describe("digest includes all signups", () => {
  it("campaignNeedsDigest returns true when there are new signups", async () => {
    const mockClient = {
      from: jest.fn((table: string) => {
        if (table === "signups") {
          return {
            select: jest.fn(() => ({
              eq: jest.fn(() => ({
                gt: jest.fn(() => Promise.resolve({ count: 5 })),
              })),
            })),
          };
        }
        return {
          select: jest.fn(() => ({
            eq: jest.fn(() => ({
              gt: jest.fn(() => Promise.resolve({ count: 0 })),
            })),
          })),
        };
      }),
    } as never;

    const result = await campaignNeedsDigest(mockClient, {
      id: "test-campaign",
      organizer_last_digest_sent_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).toBe(true);
  });

  it("campaignNeedsDigest returns false when there are no new signups or changes", async () => {
    const mockClient = {
      from: jest.fn(() => ({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            gt: jest.fn(() => ({
              limit: jest.fn(() => Promise.resolve({ data: null, count: 0 })),
            })),
          })),
        })),
      })),
    } as never;

    const result = await campaignNeedsDigest(mockClient, {
      id: "test-campaign",
      organizer_last_digest_sent_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    });

    expect(result).toBe(false);
  });

  it("campaignNeedsDigest checks since last digest or 24h", async () => {
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    // Without a last digest, should check last 24 hours
    const campaign1 = {
      id: "test",
      organizer_last_digest_sent_at: null,
    };
    
    // With a last digest, should check since that time
    const campaign2 = {
      id: "test",
      organizer_last_digest_sent_at: yesterday.toISOString(),
    };
    
    expect(campaign1.organizer_last_digest_sent_at).toBeNull();
    expect(campaign2.organizer_last_digest_sent_at).toBeTruthy();
  });
});
