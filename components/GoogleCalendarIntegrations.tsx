"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";
import { isConnectionExpired, pickDisplayedConnection } from "@/lib/google-calendar-connection";

interface GoogleCalendarIntegrationsProps {
  organizationId: string;
}

interface Connection {
  id: string;
  google_email: string;
  created_at: string;
  revoked_at: string | null;
  last_error: string | null;
  default_calendar_id: string | null;
  default_calendar_name: string | null;
}

interface Calendar {
  id: string;
  summary: string;
}

async function loadOrgConnection(organizationId: string): Promise<Connection | null> {
  const supabase = createClientComponentClient();
  const { data } = await supabase
    .from("google_calendar_connections_safe" as never)
    .select("*")
    .eq("organization_id", organizationId);

  return pickDisplayedConnection((data as Connection[] | null) ?? []);
}

export default function GoogleCalendarIntegrations({ organizationId }: GoogleCalendarIntegrationsProps) {
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [disconnecting, setDisconnecting] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState(false);
  const show = isGcalSyncUIEnabled(organizationId);

  useEffect(() => {
    if (!show) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setConnection(await loadOrgConnection(organizationId));
      setLoading(false);
    };

    load();
  }, [organizationId, show]);

  // Load calendars when connection is available and not revoked
  useEffect(() => {
    if (!show) return;

    if (!connection || isConnectionExpired(connection)) {
      setCalendars([]);
      return;
    }

    const loadCalendars = async () => {
      setLoadingCalendars(true);
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();

        const res = await fetch(`/api/integrations/google/calendars?org_id=${organizationId}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
        });

        if (res.ok) {
          const data = await res.json();
          setCalendars(data.calendars || []);
        }
      } catch (err) {
        console.error("Failed to load calendars:", err);
      } finally {
        setLoadingCalendars(false);
      }
    };

    loadCalendars();
  }, [connection, organizationId, show]);

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
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data?.error ?? "Failed to connect. Please try again." });
        return;
      }

      const data = await res.json();
      if (data.url) {
        window.location.assign(data.url);
      } else {
        setMessage({ kind: "error", text: "Failed to connect. Please try again." });
      }
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    }
  };

  const handleDisconnect = async () => {
    if (!connection) return;
    if (!confirm("Disconnect Google Calendar? This will stop writing signups to Google Calendar for events in this organization.")) {
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

  const handleSaveDefaultCalendar = async (calendarId: string) => {
    if (!connection) return;

    setSavingCalendar(true);
    setMessage(null);

    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const calendar = calendars.find(c => c.id === calendarId);
      const calendarName = calendar?.summary || "";

      const res = await fetch(`/api/integrations/google/connections/${connection.id}/default-calendar`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          calendar_id: calendarId,
          calendar_name: calendarName,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setMessage({ kind: "error", text: data?.error ?? "Could not save the default Google Calendar." });
        return;
      }

      setConnection(prev => prev ? { ...prev, default_calendar_id: calendarId, default_calendar_name: calendarName } : null);
      setMessage({ kind: "ok", text: "Default Google Calendar saved." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSavingCalendar(false);
    }
  };

  // Check for connection success or error from OAuth callback
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    
    // Handle OAuth callback error
    const error = params.get("error");
    if (error) {
      const errorMessages: Record<string, string> = {
        gcal_disabled: "Google Calendar sync is not available at this time.",
        gcal_oauth_denied: "You denied access to Google Calendar. Please try again and allow access.",
        gcal_missing_params: "The connection failed. Please try again.",
        gcal_invalid_state: "The connection session expired. Please try again.",
        gcal_org_not_enabled: "Google Calendar sync is not enabled for your organization.",
        gcal_no_refresh_token: "Google did not return a lasting sign-in. Click Reconnect and allow access again.",
        gcal_token_revoked: "Your previous Google Calendar access was revoked. Please disconnect your Google account from Google security settings, then try connecting again.",
        gcal_token_exchange_failed: "Could not complete the connection with Google. Please try again.",
        gcal_db_error: "Could not save the connection. Please try again.",
        gcal_internal_error: "An unexpected error occurred. Please try again.",
      };
      
      const message = errorMessages[error] || "Could not connect to Google Calendar. Please try again.";
      setMessage({ kind: "error", text: message });
      
      // Clear the error param
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("error");
      window.history.replaceState({}, "", newUrl.toString());
    }
    
    // Handle OAuth callback success
    if (params.get("gcal_connected") === "1") {
      setMessage({ kind: "ok", text: "Google Calendar connected successfully!" });
      // Clear the param
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.delete("gcal_connected");
      window.history.replaceState({}, "", newUrl.toString());
      
      setLoading(true);
      const load = async () => {
        setConnection(await loadOrgConnection(organizationId));
        setLoading(false);
      };
      load();
    }
  }, [organizationId]);

  if (!show) {
    return null;
  }

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
                Connect a Google account for this organization, then choose the default Google Calendar for new events. Names, phone numbers, emails, and notes from signups are written onto that calendar.
              </p>

              {connection ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    {!isConnectionExpired(connection) ? (
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

                  {isConnectionExpired(connection) && (
                    <div className="text-[12px] text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                      Your Google Calendar connection has expired. Writing signups to Google Calendar is paused until you reconnect.
                    </div>
                  )}
                  
                  {connection.last_error && !connection.last_error.includes("invalid_grant") && (
                    <div className="text-[12px] text-amber-600 bg-amber-50 px-3 py-2 rounded-lg">
                      ⚠️ {connection.last_error}
                    </div>
                  )}

                  {!isConnectionExpired(connection) && (
                    <div className="mt-3 space-y-2">
                      <div>
                        <label className="block text-[12px] font-medium text-[#2E5566] mb-1.5">
                          Default Google Calendar for this organization
                        </label>
                        {loadingCalendars ? (
                          <div className="text-[12px] text-[#5A8399]">Loading Google Calendars</div>
                        ) : (
                          <select
                            value={connection.default_calendar_id || ""}
                            onChange={(e) => handleSaveDefaultCalendar(e.target.value)}
                            disabled={savingCalendar}
                            className="w-full px-3 py-2 text-[13px] border border-[rgba(14,150,176,0.3)] rounded-lg focus:ring-2 focus:ring-[#0E96B0] focus:border-transparent disabled:opacity-50"
                          >
                            <option value="">Choose a Google Calendar</option>
                            {calendars.map((cal) => (
                              <option key={cal.id} value={cal.id}>
                                {cal.summary}
                              </option>
                            ))}
                          </select>
                        )}
                        {!connection.default_calendar_id && !loadingCalendars && calendars.length > 0 && (
                          <p className="text-[11px] text-[#5A8399] mt-1">
                            New events use this calendar unless you pick a different one on the event.
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-3">
                    {isConnectionExpired(connection) && (
                      <button
                        type="button"
                        onClick={handleConnect}
                        className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-[#0E96B0] text-[#0E96B0] hover:bg-[#E6F7FB]"
                      >
                        Reconnect
                      </button>
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
