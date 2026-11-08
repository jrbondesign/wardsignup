import { z } from "zod";
import { apiCall } from "../client.js";

export const inviteTools = [
  {
    name: "send_invite",
    description: "Send an email invitation to someone asking them to sign up for an event.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
      invitee_email: z.string().email().describe("Recipient email address"),
      invitee_name: z.string().min(1).describe("Recipient's name"),
      message: z.string().optional().describe("Optional personal message to include in the email"),
    }),
    async handler(input: { event_id: string; invitee_email: string; invitee_name: string; message?: string }) {
      const data = await apiCall<{ delivery?: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify(input),
      });
      const who = `${input.invitee_name} (${input.invitee_email})`;
      if (data.delivery === "queued") {
        return `Invite queued for ${who} for event ${input.event_id}. It has not been sent yet.`;
      }
      if (data.delivery === "unconfirmed") {
        return `Invite to ${who} for event ${input.event_id} may already be on its way. Delivery was not confirmed.`;
      }
      return `Invite sent to ${who} for event ${input.event_id}.`;
    },
  },

  {
    name: "list_invites",
    description: "List all invitations sent for an event.",
    inputSchema: z.object({
      event_id: z.string().uuid().describe("Event ID"),
    }),
    async handler(input: { event_id: string }) {
      const { invites } = await apiCall<{
        invites: { id: string; invitee_name: string; invitee_email: string; sent_at: string }[];
      }>(`/api/invites?event_id=${input.event_id}`);

      if (!invites.length) return "No invites sent yet for this event.";
      return invites
        .map((inv) => `• ${inv.invitee_name} <${inv.invitee_email}> — sent ${inv.sent_at.slice(0, 10)}`)
        .join("\n");
    },
  },
] as const;
