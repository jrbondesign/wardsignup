"use client";

import { useState, useEffect } from "react";
import type { CreateFormState } from "@/lib/create-form-state";
import { isGcalSyncUIEnabled } from "@/lib/gcal-feature";

interface Props {
  state: CreateFormState;
  set: (patch: Partial<CreateFormState>) => void;
  organizationId?: string;
}

export default function NotificationsSection({ state, set, organizationId }: Props) {
  const open = state.expanded.notifications ?? false;
  const toggle = () => set({ expanded: { ...state.expanded, notifications: !open } });
  
  const [calendars, setCalendars] = useState<Array<{ id: string; summary: string }>>([]);
  const [hasConnection, setHasConnection] = useState(false);
  const [loadingCalendars, setLoadingCalendars] = useState(false);
  
  const showCalendarSync = isGcalSyncUIEnabled(organizationId) && (state.eventType === "spots" || state.eventType === "rsvp");

  useEffect(() => {
    if (!showCalendarSync || !open || !organizationId) return;
    
    setLoadingCalendars(true);
    fetch(`/api/integrations/google/calendars?org_id=${encodeURIComponent(organizationId)}`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setCalendars(data.calendars || []);
          setHasConnection(true);
        } else {
          setHasConnection(false);
          setCalendars([]);
        }
      })
      .catch(() => {
        setHasConnection(false);
        setCalendars([]);
      })
      .finally(() => setLoadingCalendars(false));
  }, [showCalendarSync, open, organizationId]);

  return (
    <section className="rounded-2xl border-[1.5px] border-[rgba(14,150,176,0.18)] bg-[#F8FCFD] p-4 sm:p-5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex items-center gap-3 w-full text-left"
      >
        <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-[#E6F7FB] text-[#0E96B0] flex items-center justify-center">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-[#0D2B35]">Notifications</span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[#5A8399] bg-white border border-[rgba(14,150,176,0.25)] rounded-full px-2 py-0.5">
              Optional
            </span>
          </span>
          <span className="block text-[12px] text-[#5A8399] leading-snug mt-0.5">
            Get notified when someone signs up.
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`flex-shrink-0 w-4 h-4 text-[#5A8399] transition-transform ${open ? "rotate-90" : ""}`}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <Toggle
            checked={state.organizerInstantNotifyEnabled}
            onChange={(v) => set({ organizerInstantNotifyEnabled: v })}
            label="Email me instantly when someone signs up"
          />
          <Toggle
            checked={state.organizerDigestEnabled}
            onChange={(v) => set({ organizerDigestEnabled: v })}
            label="Send me a daily digest of new signups"
          />
          
          {showCalendarSync && (
            <div className="pt-2 border-t border-[rgba(14,150,176,0.15)]">
              <Toggle
                checked={state.calendarSyncEnabled}
                onChange={(v) => {
                  set({ calendarSyncEnabled: v });
                  if (!v) {
                    set({ calendarId: "", calendarName: "" });
                  }
                }}
                label="Sync signups to Google Calendar"
                help="Member names, contact details, and notes will be written to your selected calendar."
              />
              
              {state.calendarSyncEnabled && (
                <div className="mt-3 ml-6">
                  {!hasConnection && (
                    <p className="text-[12px] text-[#5A8399] mb-2">
                      <a href="/settings" className="text-[#0E96B0] hover:underline">
                        Connect your Google account
                      </a>{" "}
                      first to enable calendar sync.
                    </p>
                  )}
                  
                  {hasConnection && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-[12px] font-medium text-[#2E5566] mb-1.5">
                          Calendar
                        </label>
                        {loadingCalendars ? (
                          <div className="text-[12px] text-[#5A8399]">Loading calendars...</div>
                        ) : (
                          <select
                            value={state.calendarId}
                            onChange={(e) => {
                              const cal = calendars.find(c => c.id === e.target.value);
                              set({ 
                                calendarId: e.target.value,
                                calendarName: cal?.summary || ""
                              });
                            }}
                            className="w-full px-3 py-2 text-[13px] border border-[rgba(14,150,176,0.3)] rounded-lg focus:ring-2 focus:ring-[#0E96B0] focus:border-transparent"
                          >
                            <option value="">Select a calendar...</option>
                            {calendars.map((cal) => (
                              <option key={cal.id} value={cal.id}>
                                {cal.summary}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      
                      <Toggle
                        checked={state.inviteLeader}
                        onChange={(v) => set({ inviteLeader: v })}
                        label="Send Google Calendar invitations to the leader"
                        help="When enabled, the leader will receive Google Calendar invitation emails."
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

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
