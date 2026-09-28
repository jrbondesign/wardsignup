/**
 * @jest-environment node
 */

import { getAuthFromRequest } from "@/lib/auth";
import { createServiceRoleClient } from "@/lib/supabase-admin";

jest.mock("@/lib/claude-mcp", () => ({
  ...jest.requireActual("@/lib/claude-mcp"),
  CLAUDE_MCP_ENABLED: true,
}));

jest.mock("@/lib/supabase-admin", () => ({
  createServiceRoleClient: jest.fn(),
}));

const generateLink = jest.fn();
const getUserById = jest.fn();
const verifyOtp = jest.fn();
const getUser = jest.fn();

jest.mock("@supabase/supabase-js", () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: (...args: unknown[]) => getUser(...args),
      verifyOtp: (...args: unknown[]) => verifyOtp(...args),
    },
  })),
}));

const mockAdmin = createServiceRoleClient as jest.MockedFunction<typeof createServiceRoleClient>;

describe("getAuthFromRequest MCP keys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
    mockAdmin.mockReturnValue({
      from: () => ({
        select: () => ({
          eq: () => ({
            single: () => Promise.resolve({ data: { user_id: "user-1" }, error: null }),
          }),
        }),
        update: () => ({
          eq: () => Promise.resolve({ error: null }),
        }),
      }),
      auth: {
        admin: {
          getUserById,
          generateLink,
        },
      },
    } as any);
    getUserById.mockResolvedValue({
      data: { user: { id: "user-1", email: "org@example.com" } },
      error: null,
    });
    generateLink.mockResolvedValue({
      data: { properties: { hashed_token: "hashed" } },
      error: null,
    });
    verifyOtp.mockResolvedValue({
      data: { session: { access_token: "user-jwt" } },
      error: null,
    });
  });

  it("returns a user-scoped client instead of the service-role client", async () => {
    const request = new Request("http://localhost/api/events", {
      headers: { Authorization: "Bearer wsu_live_abc" },
    });
    const result = await getAuthFromRequest(request);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.id).toBe("user-1");
    expect(result.supabase).not.toBe(mockAdmin.mock.results[0]?.value);
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email: "org@example.com" });
    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "hashed", type: "email" });
  });
});
