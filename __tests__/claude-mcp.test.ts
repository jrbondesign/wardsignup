import { CLAUDE_MCP_ENABLED } from "@/lib/claude-mcp";

describe("Claude MCP feature flag", () => {
  it("stays off so the dashboard card and API keys stay disabled", () => {
    expect(CLAUDE_MCP_ENABLED).toBe(false);
  });
});
