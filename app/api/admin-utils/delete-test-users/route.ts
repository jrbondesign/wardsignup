import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getAuthFromRequest } from "@/lib/auth";
import { isMetricsAdminEmail } from "@/lib/metrics-admin";
import { parseDeletableTestEmails } from "@/lib/deletable-test-emails";

export const maxDuration = 60;

async function findUserIdByEmail(
  admin: SupabaseClient,
  emailLower: string,
): Promise<string | null> {
  let page = 1;
  const perPage = 1000;
  const maxPages = 100;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users ?? [];
    const u = batch.find((x) => x.email?.toLowerCase() === emailLower);
    if (u) return u.id;
    if (batch.length < perPage) break;
    page += 1;
    if (page > maxPages) break;
  }
  return null;
}

/**
 * Deletes allowlisted test auth users (metrics admin only).
 * Body optional: `{ "emails": ["a@b.com"] }` — must be subset of allowlist; omit to delete all allowlisted.
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthFromRequest(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.message }, { status: auth.status });
  }
  if (!isMetricsAdminEmail(auth.user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRole) {
    return NextResponse.json(
      { error: "Server missing Supabase configuration" },
      { status: 500 },
    );
  }

  const allowlist = new Set(parseDeletableTestEmails());
  if (allowlist.size === 0) {
    return NextResponse.json(
      { error: "DELETABLE_TEST_USER_EMAILS is empty" },
      { status: 400 },
    );
  }

  let body: { emails?: string[] } = {};
  try {
    body = (await request.json()) as { emails?: string[] };
  } catch {
    /* empty body */
  }

  const requested = (body.emails?.length
    ? body.emails
    : [...allowlist]
  ).map((e) => e.trim().toLowerCase());

  const toDelete = requested.filter((e) => allowlist.has(e));
  const rejected = requested.filter((e) => !allowlist.has(e));

  if (toDelete.length === 0) {
    return NextResponse.json(
      {
        error: "No deletable emails (must be in DELETABLE_TEST_USER_EMAILS allowlist)",
        rejected,
      },
      { status: 400 },
    );
  }

  const admin = createClient(url, serviceRole);
  const deleted: { email: string; id: string }[] = [];
  const notFound: string[] = [];
  const errors: { email: string; message: string }[] = [];

  for (const email of toDelete) {
    try {
      const id = await findUserIdByEmail(admin, email);
      if (!id) {
        notFound.push(email);
        continue;
      }
      await admin.from("welcome_email_sent").delete().eq("user_id", id);
      const { error: delErr } = await admin.auth.admin.deleteUser(id);
      if (delErr) {
        errors.push({ email, message: delErr.message });
      } else {
        deleted.push({ email, id });
      }
    } catch (e) {
      errors.push({
        email,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    deleted,
    notFound,
    errors,
    rejected: rejected.length > 0 ? rejected : undefined,
  });
}
