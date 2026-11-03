import { createServiceRoleClient } from "@/lib/supabase-admin";

export type QueuedEmailInsert = {
  brand_id: string;
  category: "notification" | "transactional";
  kind: string;
  from_address: string;
  to_address: string;
  subject: string;
  html: string;
  text_body: string | null;
  reply_to: string | null;
  attachments: Array<{ filename: string; content: string }> | null;
  send_after: string;
};

export type QueuedEmailRow = QueuedEmailInsert & {
  id: string;
  status: string;
  attempts: number;
};

/**
 * Insert a queued email. With `dedupe`, an identical email (same brand, kind,
 * recipient and subject) that is already pending or sending is not queued
 * again, so a retried request can't put two copies of a welcome in the queue.
 * Callers keep their own once-only guards (welcome_email_sent, the creator
 * notification log); this is a second net. A failed lookup still queues:
 * losing the email is worse than the small chance of a duplicate.
 */
export async function enqueueEmail(
  row: QueuedEmailInsert,
  opts: { dedupe?: boolean } = {},
): Promise<{ ok: true; deduped?: boolean } | { ok: false; error: string }> {
  try {
    const admin = createServiceRoleClient();
    if (opts.dedupe) {
      const { data: existing, error: findErr } = await admin
        .from("email_queue")
        .select("id")
        .eq("brand_id", row.brand_id)
        .eq("kind", row.kind)
        .eq("to_address", row.to_address)
        .eq("subject", row.subject)
        .in("status", ["pending", "sending"])
        .limit(1);
      if (!findErr && Array.isArray(existing) && existing.length > 0) return { ok: true, deduped: true };
    }
    const { error } = await admin.from("email_queue").insert(row as never);
    if (error) {
      console.error("email_queue insert failed:", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error("email_queue insert threw:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
