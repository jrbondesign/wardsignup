"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { CONNECTION_BROKEN_ERROR, isConnectionBroken } from "@/lib/google-calendar-connection";

type Props = {
  campaignId: string;
  organizationId?: string | null;
  /** campaign_calendar_sync.last_error, if already loaded by the page. */
  lastError?: string | null;
};

export const RECONNECT_BANNER_TITLE = "Google Calendar is disconnected";
export const RECONNECT_BANNER_BODY =
  "Google stopped accepting this connection, so new signups are not reaching your calendar. Reconnect and we will catch it up automatically.";
export const RECONNECT_BANNER_BUTTON = "Reconnect Google";

/**
 * Shown on the event admin page when the event's Google Calendar connection is
 * broken (invalid_grant, revoked, or 401 after refresh). Starts the existing OAuth
 * connect flow and returns here.
 */
export default function ReconnectGoogleBanner({ campaignId, organizationId, lastError }: Props) {
  const [broken, setBroken] = useState(lastError === CONNECTION_BROKEN_ERROR);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastError === CONNECTION_BROKEN_ERROR) setBroken(true);
  }, [lastError]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClientComponentClient();
      const { data: sync } = await supabase
        .from("campaign_calendar_sync")
        .select("connection_id, enabled, last_error")
        .eq("campaign_id", campaignId)
        .maybeSingle();
      const row = sync as { connection_id?: string; enabled?: boolean; last_error?: string | null } | null;
      if (!row?.connection_id || row.enabled === false) return;
      if (row.last_error === CONNECTION_BROKEN_ERROR) {
        if (!cancelled) setBroken(true);
        return;
      }
      const { data: conn } = await supabase
        .from("google_calendar_connections_safe" as never)
        .select("*")
        .eq("id", row.connection_id)
        .maybeSingle();
      if (!cancelled && isConnectionBroken(conn as never)) setBroken(true);
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  if (!broken || !organizationId) return null;

  const reconnect = async () => {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError("Please sign in again to reconnect Google.");
        return;
      }
      const returnPath = `/admin/${campaignId}`;
      const res = await fetch(
        `/api/integrations/google/connect?org_id=${encodeURIComponent(organizationId)}&return_path=${encodeURIComponent(returnPath)}`,
        { headers: { Authorization: `Bearer ${session.access_token}` } },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && data?.url) {
        window.location.assign(data.url);
        return;
      }
      setError(data?.error ?? "Could not start reconnect. Please try again.");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div role="alert" className="mb-5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-amber-900">{RECONNECT_BANNER_TITLE}</p>
        <p className="text-[13px] text-amber-800 mt-0.5 leading-relaxed">{RECONNECT_BANNER_BODY}</p>
        {error && <p className="text-[12px] text-red-600 mt-1">{error}</p>}
      </div>
      <button
        type="button"
        onClick={reconnect}
        disabled={busy}
        className="flex-shrink-0 px-4 py-2 text-sm font-semibold text-white bg-[#0E96B0] hover:bg-[#08647E] rounded-lg transition-colors disabled:opacity-50"
      >
        {busy ? "Opening Google" : RECONNECT_BANNER_BUTTON}
      </button>
    </div>
  );
}
