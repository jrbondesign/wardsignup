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
  /** Present only after the cutover migration, and only when a business key exists. */
  idempotency_key?: string;
};

export type QueuedEmailRow = QueuedEmailInsert & {
  id: string;
  status: string;
  attempts: number;
};

/**
 * Insert a queued email. A row with an operation key is stored once for that
 * key, including after it has been sent. A different key with the same subject
 * is a different email. With `dedupe` and no key, an identical pending email
 * (same brand, kind, recipient and subject) is not queued again. Callers keep
 * their own once-only guards. A failed lookup on that unkeyed path still queues.
 */
export async function enqueueEmail(
  row: QueuedEmailInsert,
  opts: { dedupe?: boolean } = {},
): Promise<{ ok: true; deduped?: boolean; status?: string } | { ok: false; error: string }> {
  try {
    const admin = createServiceRoleClient();
    const operationKey = row.idempotency_key?.trim();
    if (operationKey) {
      const { data, error } = await admin.rpc("email_queue_enqueue", {
        p_brand_id: row.brand_id,
        p_category: row.category,
        p_kind: row.kind,
        p_from_address: row.from_address,
        p_to_address: row.to_address,
        p_subject: row.subject,
        p_html: row.html,
        p_text_body: row.text_body,
        p_reply_to: row.reply_to,
        p_attachments: row.attachments,
        p_send_after: row.send_after,
        p_idempotency_key: operationKey,
      } as never);
      if (error) {
        console.error("email_queue keyed insert failed:", error);
        return { ok: false, error: error.message };
      }
      const status = data as string | null;
      if (status === "inserted") return { ok: true, status: "pending" };
      if (status && status !== "refused") {
        return { ok: true, deduped: true, status };
      }
      return { ok: false, error: "email queue did not accept this operation key" };
    }
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
