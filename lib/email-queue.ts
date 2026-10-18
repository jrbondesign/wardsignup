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

export async function enqueueEmail(
  row: QueuedEmailInsert,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const admin = createServiceRoleClient();
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
