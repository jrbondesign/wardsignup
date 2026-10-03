"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";

export type EventGoogleCalendarFields = {
  enabled: boolean;
  calendarId: string;
  calendarName: string;
  inviteLeader: boolean;
};

type CalendarOption = { id: string; summary: string };

type OrgConnection = {
  default_calendar_id: string | null;
  default_calendar_name: string | null;
};

type Props = {
  organizationId?: string | null;
  eventType: string;
  value: EventGoogleCalendarFields;
  onChange: (patch: Partial<EventGoogleCalendarFields>) => void;
  /** When set, changes are saved to this event immediately. */
  eventId?: string;
  showUpdateNow?: boolean;
  lastSyncedAt?: string | null;
  lastError?: string | null;
  onSyncResult?: (result: { lastSyncedAt?: string | null; lastError?: string | null }) => void;
  layout?: "stack" | "card";
};

function Toggle({
  checked,
  onChange,
  label,
  help,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded border-[rgba(14,150,176,0.4)] text-[#0E96B0] focus:ring-[#0E96B0]"
      />
      <span className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-[#2E5566]">{label}</span>
        {help && <span className="text-[12px] text-[#5A8399]">{help}</span>}
      </span>
    </label>
  );
}

export default function EventGoogleCalendarControls({
  organizationId,
  eventType,
  value,
  onChange,
  eventId,
  showUpdateNow = false,
  lastSyncedAt,
  lastError,
  onSyncResult,
  layout = "stack",
}: Props) {
  const show =
    isGcalSyncUIEnabled(organizationId ?? undefined) &&
    (eventType === "spots" || eventType === "rsvp");

  const [calendars, setCalendars] = useState<CalendarOption[]>([]);
  const [hasConnection, setHasConnection] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  const [orgConnection, setOrgConnection] = useState<OrgConnection | null>(null);
  const [updating, setUpdating] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!show || !organizationId) return;

    let cancelled = false;
    const load = async () => {
      setLoadingCalendars(true);
      const supabase = createClientComponentClient();

      const { data: connData } = await supabase
        .from("google_calendar_connections_safe" as never)
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (!cancelled && connData) {
        const conn = connData as {
          default_calendar_id?: string | null;
          default_calendar_name?: string | null;
        };
        setOrgConnection({
          default_calendar_id: conn.default_calendar_id || null,
          default_calendar_name: conn.default_calendar_name || null,
        });
      }

      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch(
          `/api/integrations/google/calendars?org_id=${encodeURIComponent(organizationId)}`,
          {
            headers: {
              Authorization: `Bearer ${session?.access_token ?? ""}`,
            },
          },
        );
        if (cancelled) return;
        if (res.ok) {
          const data = await res.json();
          setCalendars(data.calendars || []);
          setHasConnection(true);
        } else {
          setHasConnection(false);
          setCalendars([]);
        }
      } catch {
        if (!cancelled) {
          setHasConnection(false);
          setCalendars([]);
        }
      } finally {
        if (!cancelled) setLoadingCalendars(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [show, organizationId]);

  if (!show) return null;

  const persist = async (patch: Partial<EventGoogleCalendarFields>) => {
    onChange(patch);
    if (!eventId) return;

    const updates: Record<string, unknown> = {};
    if ("enabled" in patch) updates.enabled = patch.enabled;
    if ("calendarId" in patch) updates.calendar_id = patch.calendarId;
    if ("calendarName" in patch) updates.calendar_name = patch.calendarName;
    if ("inviteLeader" in patch) updates.invite_leader = patch.inviteLeader;
    if (Object.keys(updates).length === 0) return;

    setSaving(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/events/${eventId}/calendar-sync`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify(updates),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not save Google Calendar settings.");
      }
      if (data.last_error) {
        onSyncResult?.({ lastError: data.last_error });
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not save Google Calendar settings.");
    } finally {
      setSaving(false);
    }
  };

  const handleEnabled = (next: boolean) => {
    if (next && !value.calendarId && orgConnection?.default_calendar_id) {
      persist({
        enabled: true,
        calendarId: orgConnection.default_calendar_id,
        calendarName: orgConnection.default_calendar_name || "",
      });
      return;
    }
    if (!next) {
      persist({ enabled: false, calendarId: "", calendarName: "" });
      return;
    }
    persist({ enabled: next });
  };

  const handleUpdateNow = async () => {
    if (!eventId) return;
    setUpdating(true);
    onSyncResult?.({ lastError: null });
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/events/${eventId}/calendar-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not update Google Calendar for this event.");
      }
      onSyncResult?.({
        lastSyncedAt: data.last_synced_at ?? null,
        lastError: data.last_error ?? null,
      });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not update Google Calendar for this event.";
      onSyncResult?.({ lastError: message });
      alert(message);
    } finally {
      setUpdating(false);
    }
  };

  const controls = (
    <div className="space-y-3">
      <Toggle
        checked={value.enabled}
        onChange={handleEnabled}
        label="Write this event's signups onto Google Calendar"
        help="Each filled time slot becomes a Google Calendar event. Names, phone numbers, emails, and notes are included."
      />

      {value.enabled && (
        <div className="ml-6 space-y-3">
          {!hasConnection && !loadingCalendars && (
            <p className="text-[12px] text-[#5A8399]">
              <a href="/settings/organization" className="text-[#0E96B0] hover:underline">
                Connect Google Calendar in organization settings
              </a>{" "}
              first. Then you can choose a calendar for this event.
            </p>
          )}

          {hasConnection && (
            <>
              <div>
                <label className="block text-[12px] font-medium text-[#2E5566] mb-1.5">
                  Google Calendar for this event
                </label>
                {loadingCalendars ? (
                  <div className="text-[12px] text-[#5A8399]">Loading Google Calendars</div>
                ) : (
                  <>
                    <select
                      value={value.calendarId}
                      disabled={saving}
                      onChange={(e) => {
                        const cal = calendars.find((c) => c.id === e.target.value);
                        persist({
                          calendarId: e.target.value,
                          calendarName: cal?.summary || "",
                        });
                      }}
                      className="w-full px-3 py-2 text-[13px] border border-[rgba(14,150,176,0.3)] rounded-lg focus:ring-2 focus:ring-[#0E96B0] focus:border-transparent disabled:opacity-50"
                    >
                      <option value="">Choose a Google Calendar</option>
                      {calendars.map((cal) => (
                        <option key={cal.id} value={cal.id}>
                          {cal.summary}
                        </option>
                      ))}
                    </select>
                    {!value.calendarId && orgConnection?.default_calendar_name && (
                      <p className="text-[11px] text-[#5A8399] mt-1">
                        This organization defaults to {orgConnection.default_calendar_name}. You can pick a different Google Calendar for this event.
                      </p>
                    )}
                  </>
                )}
              </div>

              <Toggle
                checked={value.inviteLeader}
                onChange={(v) => persist({ inviteLeader: v })}
                label="Email a Google Calendar invitation to the event leader"
                help="Uses the leader email saved on this event."
              />
            </>
          )}
        </div>
      )}

      {showUpdateNow && value.enabled && hasConnection && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pt-1">
          <div className="min-w-0">
            {lastSyncedAt && (
              <p className="text-[12px] text-[#5A8399]">
                Last written to Google Calendar {new Date(lastSyncedAt).toLocaleString()}
              </p>
            )}
            {lastError && (
              <p className="text-[12px] text-red-600 mt-1">
                {lastError.includes("invalid_grant")
                  ? "Your Google Calendar connection expired. Reconnect it in organization settings."
                  : lastError}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={updating || saving}
            className="flex-shrink-0 px-3 py-1.5 text-[12px] font-semibold text-[#0E96B0] hover:text-white hover:bg-[#0E96B0] border border-[#0E96B0] rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {updating ? "Updating Google Calendar" : "Update Google Calendar now"}
          </button>
        </div>
      )}
    </div>
  );

  if (layout === "card") {
    return (
      <div className="mb-4 rounded-xl border border-[#0E96B0]/18 bg-[#F8FCFD] px-4 py-3">
        <h3 className="text-sm font-semibold text-[#0D2B35] mb-1">Google Calendar</h3>
        <p className="text-[11px] text-[#5A8399] leading-snug mb-2.5">
          Filled time slots on this event can appear on a Google Calendar. Connect Google Calendar and set a default in organization settings.
        </p>
        {controls}
      </div>
    );
  }

  return controls;
}
