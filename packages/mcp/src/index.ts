#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { eventTools } from "./tools/events.js";
import { sessionTools } from "./tools/sessions.js";
import { itemTools } from "./tools/items.js";
import { signupTools } from "./tools/signups.js";
import { inviteTools } from "./tools/invites.js";
import { aiTools } from "./tools/ai.js";
import { brandId, apiUrl } from "./client.js";

const allTools = [
  ...aiTools,
  ...eventTools,
  ...sessionTools,
  ...itemTools,
  ...signupTools,
  ...inviteTools,
] as const;

const server = new McpServer({
  name: `${brandId}-mcp`,
  version: "0.1.0",
});

for (const tool of allTools) {
  server.tool(
    tool.name,
    tool.description,
    tool.inputSchema.shape ?? tool.inputSchema,
    async (input: Record<string, unknown>) => {
      try {
        const result = await (tool as { handler: (i: Record<string, unknown>) => Promise<string> }).handler(input);
        return { content: [{ type: "text" as const, text: result }] };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return { content: [{ type: "text" as const, text: `Error: ${msg}` }], isError: true };
      }
    },
  );
}

// Resource: event by ID
server.resource(
  "event",
  "event://{id}",
  { description: "A sign-up event's details, sessions/items, and share URL" },
  async (uri: URL) => {
    const id = uri.pathname.replace(/^\//, "");
    const { apiCall } = await import("./client.js");
    try {
      const data = await apiCall<{ event: unknown }>(`/api/events/${id}`);
      return {
        contents: [{
          uri: uri.toString(),
          text: JSON.stringify(data, null, 2),
          mimeType: "application/json",
        }],
      };
    } catch (err) {
      return {
        contents: [{
          uri: uri.toString(),
          text: `Error fetching event: ${err instanceof Error ? err.message : String(err)}`,
          mimeType: "text/plain",
        }],
      };
    }
  },
);

// Prompt: help the user get started
server.prompt(
  "create_event",
  "Generate a prompt to help create a new sign-up event from a description",
  { description: z.string().describe("What the event is about") },
  ({ description }: { description: string }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please create a sign-up event using the create_event_from_description tool with this description:\n\n${description}\n\nAfter creating it, show me the shareable URL.`,
      },
    }],
  }),
);

async function main() {
  console.error(`[${brandId}-mcp] Starting MCP server...`);
  console.error(`[${brandId}-mcp] Connected to: ${apiUrl}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`[${brandId}-mcp] Ready.`);
}

main().catch((err) => {
  console.error("[wardsignup-mcp] Fatal error:", err);
  process.exit(1);
});
