import { NextRequest } from "next/server";
import { handleBrevoWebhook, type BrevoWebhookDeps, type BrevoWebhookEffect } from "@/lib/brevo-webhook";
import { suppressEmail } from "@/lib/email-send";
import { createServiceRoleClient } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

/**
 * Brevo transactional webhook. Hard bounces, blocks, invalid addresses, spam
 * complaints, and unsubscribes suppress the address. Soft bounces only move
 * delivery status. Unsigned requests are refused. Replay of the same event id
 * does not apply twice. Preview deployments acknowledge and do not write.
 *
 * Configure in Brevo only after BREVO_WEBHOOK_TOKEN is set, as bearer auth
 * or the X-WardSignup-Webhook-Token header. Do not use the sending API key,
 * the MCP token, or the SMTP password as this token.
 */
function productionDeps(): BrevoWebhookDeps {
  return {
    env: process.env,
    now: () => new Date(),
    recordEvent: async (eventId) => {
      const admin = createServiceRoleClient();
      const { data, error } = await admin.rpc("record_email_webhook_event", {
        p_provider: "brevo",
        p_event_id: eventId,
      } as never);
      if (error) throw new Error(error.message);
      return data === true;
    },
    forgetEvent: async (eventId) => {
      const admin = createServiceRoleClient();
      await admin.rpc("forget_email_webhook_event", {
        p_provider: "brevo",
        p_event_id: eventId,
      } as never);
    },
    suppress: (email, reason, source) => suppressEmail(email, reason, source),
    applyStatus: async (effect: BrevoWebhookEffect) => {
      const admin = createServiceRoleClient();
      const { error } = await admin.rpc("apply_email_provider_event", {
        p_message_id: effect.messageId,
        p_tag: effect.tag,
        p_delivery_status: effect.deliveryStatus,
      } as never);
      if (error) throw new Error(error.message);
    },
  };
}

export async function POST(request: NextRequest) {
  return handleBrevoWebhook(request, productionDeps());
}
