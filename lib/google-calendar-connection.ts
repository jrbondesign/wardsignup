/**
 * Persist and display helpers for org Google Calendar connections.
 *
 * Unique in the DB is (user_id, organization_id, google_email). Reconnect with a
 * different casing or Google identity used to INSERT a second row while the
 * expired row stayed put. Settings then used maybeSingle() on organization_id,
 * which fails when two rows exist, so the UI kept showing Connection Expired.
 */

export const CONNECTION_DISCONNECTED_ERROR = "Connection was disconnected";

export type ConnectionRow = {
  id: string;
  google_email: string;
  revoked_at: string | null;
  last_error?: string | null;
};

export type PersistConnectionInput = {
  userId: string;
  organizationId: string;
  googleEmail: string;
  refreshTokenEnc: string;
  scopes: string;
};

/** Minimal Supabase-like client used by persistGoogleCalendarConnection. */
export type ConnectionAdmin = {
  from: (table: string) => any;
};

export function isConnectionExpired(connection: {
  revoked_at: string | null;
  last_error?: string | null;
}): boolean {
  return Boolean(connection.revoked_at) || Boolean(connection.last_error?.includes("invalid_grant"));
}

export function pickDisplayedConnection<T extends { revoked_at: string | null; last_error?: string | null }>(
  rows: T[] | null | undefined,
): T | null {
  if (!rows?.length) return null;
  return rows.find((row) => !isConnectionExpired(row)) ?? rows[0];
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function persistGoogleCalendarConnection(
  admin: ConnectionAdmin,
  input: PersistConnectionInput,
): Promise<{ error: { message: string } | null; connectionId?: string }> {
  const googleEmail = input.googleEmail.trim();

  const existingResult = await admin
    .from("google_calendar_connections" as never)
    .select("id, google_email, revoked_at, last_error")
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId);

  if (existingResult.error) {
    return { error: existingResult.error };
  }

  const rows = (existingResult.data ?? []) as ConnectionRow[];
  const normalized = normalizeEmail(googleEmail);
  const keep =
    rows.find((row) => normalizeEmail(row.google_email) === normalized) ?? rows[0];

  const payload = {
    user_id: input.userId,
    organization_id: input.organizationId,
    google_email: googleEmail,
    refresh_token_enc: input.refreshTokenEnc,
    scopes: input.scopes,
    revoked_at: null,
    last_error: null,
  };

  if (!keep) {
    const insertResult = await admin.from("google_calendar_connections" as never).insert(payload as never);
    return { error: insertResult.error };
  }

  const updateResult = await admin
    .from("google_calendar_connections" as never)
    .update(payload as never)
    .eq("id", keep.id);

  if (updateResult.error) {
    return { error: updateResult.error };
  }

  const extraIds = rows.filter((row) => row.id !== keep.id).map((row) => row.id);
  if (extraIds.length > 0) {
    await admin
      .from("campaign_calendar_sync" as never)
      .update({ connection_id: keep.id } as never)
      .in("connection_id", extraIds);
    await admin.from("google_calendar_connections" as never).delete().in("id", extraIds);
  }

  await admin
    .from("campaign_calendar_sync" as never)
    .update({ enabled: true, last_error: null } as never)
    .eq("connection_id", keep.id)
    .eq("last_error", CONNECTION_DISCONNECTED_ERROR);

  return { error: null, connectionId: keep.id };
}
