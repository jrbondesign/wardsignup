"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";

interface GoogleCalendarIntegrationsProps {
  organizationId: string;
}

interface Connection {
  id: string;
  google_email: string;
  created_at: string;
  revoked_at: string | null;
  last_error: string | null;
}

export default function GoogleCalendarIntegrations({ organizationId }: GoogleCalendarIntegrationsProps) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // Don't show the section if feature flag is off or org not in allowlist
  if (!isGcalSyncUIEnabled(organizationId)) {
    return null;
  }

  useEffect(() => {
    const load = async () => {
      const supabase = createClientComponentClient();
      
      // Fetch connection via safe view (including revoked ones to show reconnect option)
      const { data, error } = await supabase
        .from("google_calendar_connections_safe" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!error && data) {
        setConnection(data as Connection);
      }

      setLoading(false);
    };

    load();
  }, [organizationId]);

  const handleConnect = async () => {
    setMessage(null);

    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      if (!session?.access_token) {
        setMessage({ kind: "error", text: "Please sign in again to connect Google Calendar." });
        return;
      }

      const returnPath = window.location.pathname;
      const url = `/api/integrations/google/connect?org_id=${organizationId}&return_path=${encodeURIComponent(returnPath)}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        redirect: "manual",
      });

      // The endpoint returns a 307 redirect to Google's OAuth consent URL
      const location = res.headers.get("location");
      if (location) {
        window.location.assign(location);
      } else {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data?.error ?? "Failed to connect. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    if (!confirm("Disconnect Google Calendar? This will disable calendar sync for all events in this organization.")) {
      return;
    }

    setDisconnecting(true);
    setMessage(null);

    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/integrations/google/connections/${connection.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data?.error ?? "Failed to disconnect." });
        setDisconnecting(false);
        return;
      }

      setConnection(null);
      setMessage({ kind: "ok", text: "Google Calendar disconnected." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setDisconnecting(false);
    }
  };

  // Check for connection success from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("gcal_connected") === "1") {
      setMessage({ kind: "ok", text: "Google Calendar connected successfully!" });
      // Clear the param
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("gcal_connected");
      window.history.replaceState({}, "", newUrl.toString());
      
      // Reload connection
      setLoading(true);
      const load = async () => {
        const supabase = createClientComponentClient();
        const { data } = await supabase
          .from("google_calendar_connections_safe" as never)
          .select("*")
          .eq("organization_id", organizationId)
          .maybeSingle();

        if (data) {
          setConnection(data as Connection);
        }
        setLoading(false);
      };
      load();
    }
  }, [organizationId]);

  if (loading) {
    return (
      <section className="mt-6 bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
        <h2 className="font-serif text-[22px] text-[#0D2B35] mb-1">Integrations</h2>
        <p className="text-[13px] text-[#5A8399]">Loading...</p>
      </section>
    );
  }

  return (
    <section className="mt-6 bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
      <h2 className="font-serif text-[22px] text-[#0D2B35] mb-1">Integrations</h2>
      <p className="text-[13px] text-[#5A8399] mb-5">
        Connect third-party services to enhance your events.
      </p>

      <div className="space-y-4">
        <div className="border border-[#0E96B0]/20 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <h3 className="text-[15px] font-semibold text-[#0D2B35] mb-1">
                Google Calendar
              </h3>
              <p className="text-[12px] text-[#5A8399] mb-3">
                Sync signups to your Google Calendar automatically. Member names, contact details, and notes will be visible in calendar events.
              </p>

              {connection ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {!connection.revoked_at && !connection.last_error?.includes("invalid_grant") ? (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-[#0F6E56] bg-[#E7F5ED] px-2.5 py-1 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                        </svg>
                        Connected
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-100 px-2.5 py-1 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        Connection Expired
                      </span>
                    )}
                    <span className="text-[12px] text-[#5A8399]">
                      {connection.google_email}
                    </span>
                  </div>

                  {(connection.revoked_at || connection.last_error?.includes("invalid_grant")) && (
                    <div className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                      Your Google Calendar connection has expired. Calendar sync is paused until you reconnect.
                    </div>
                  )}
                  
                  {connection.last_error && !connection.last_error.includes("invalid_grant") && (
                    <div className="text-[12px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      ⚠️ {connection.last_error}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {(connection.revoked_at || connection.last_error?.includes("invalid_grant")) ? (
                      <button
                        type="button"
                        onClick={handleConnect}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#0E96B0] text-[#0E96B0] hover:bg-[#E6F7FB]"
                      >
                        Reconnect
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleDisconnect}
                        disabled={disconnecting}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                      >
                        {disconnecting ? "Disconnecting..." : "Disconnect"}
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConnect}
                  className="text-[13px] font-semibold px-4 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all"
                >
                  Connect Google Calendar
                </button>
              )}
            </div>
          </div>
        </div>

        {message && (
          <p className={`text-[13px] ${message.kind === "ok" ? "text-[#0F6E56]" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
      </div>
    </section>
  );
}
