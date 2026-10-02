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

  // Don't show the section if feature flag is off
  if (!isGcalSyncUIEnabled()) {
    return null;
  }

  useEffect(() => {
    const load = async () => {
      const supabase = createClientComponentClient();
      
      // Fetch connection via safe view
      const { data, error } = await supabase
        .from("google_calendar_connections_safe" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .is("revoked_at", null)
        .maybeSingle();

      if (!error && data) {
        setConnection(data as Connection);
      }

      setLoading(false);
    };

    load();
  }, [organizationId]);

  const handleConnect = () => {
    const returnPath = window.location.pathname;
    const url = `/api/integrations/google/connect?org_id=${organizationId}&return_path=${encodeURIComponent(returnPath)}`;
    window.location.href = url;
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
          .is("revoked_at", null)
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
                    <span className="inline-flex items-center gap-1.5 text-[12px] text-[#0F6E56] bg-[#E7F5ED] px-2.5 py-1 rounded-full">
                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                      Connected
                    </span>
                    <span className="text-[12px] text-[#5A8399]">
                      {connection.google_email}
                    </span>
                  </div>

                  {connection.last_error && (
                    <div className="text-[12px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      ⚠️ {connection.last_error}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {disconnecting ? "Disconnecting..." : "Disconnect"}
                  </button>
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
