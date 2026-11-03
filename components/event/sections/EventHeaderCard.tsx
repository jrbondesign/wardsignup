"use client";

import Image from "next/image";
import { type EventPageView } from "@/components/event/hooks/deriveEventPageView";

/** Cover, title, description and date/time summary. */
export default function EventHeaderCard({ ctx }: { ctx: EventPageView }) {
  const {
    event,
    eventType,
    isSingleSession,
    publicCover,
  } = ctx;

  return (
    <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] overflow-hidden mb-6">
      {publicCover && (
        <div className="relative w-full aspect-[2/1] bg-[#F4FAFB]">
          <Image
            src={publicCover.url}
            alt=""
            fill
            priority
            sizes="(max-width: 896px) 100vw, 896px"
            className="object-cover"
            style={{ objectPosition: publicCover.position }}
          />
        </div>
      )}
      {/* Gradient strip */}
      <div className="h-1.5 bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E]" />
      <div className="p-7">
        <div className="flex items-start gap-3 mb-2">
          {/* Future: Org logo support */}
          <h1 className="font-serif text-[clamp(22px,4vw,34px)] text-[#0D2B35] tracking-[-0.4px] leading-tight">
            {event.name}
          </h1>
        </div>
        {event.description && (
          <p className="text-sm text-[#5A8399] leading-relaxed whitespace-pre-wrap mt-2">
            {event.description}
          </p>
        )}
        {(() => {
          const ev = event as unknown as {
            event_date?: string | null;
            event_dates?: string[] | null;
            event_start_time?: string | null;
            event_end_time?: string | null;
            event_times?: { label: string; time: string }[];
            event_locations?: { label: string; address: string }[];
          };
          const fmtDate = (d: string) => {
            const [y, m, dd] = d.split("-").map(Number);
            return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
          };
          const fmtTime = (t: string) => /^\d{2}:\d{2}/.test(t) ? new Date(`1970-01-01T${t.length === 5 ? t + ":00" : t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : t;
          // Multi-date items events: render the set as a group ("Thursdays ·
          // Jun 26, Jul 2, Jul 9") instead of the single event_date row.
          const multiDates = (ev.event_dates ?? []).filter(Boolean);
          const hasMultiDates = multiDates.length > 1;
          const timeSuffix =
            ev.event_start_time || ev.event_end_time
              ? ` · ${ev.event_start_time ? fmtTime(ev.event_start_time) : ""}${ev.event_end_time ? ` – ${fmtTime(ev.event_end_time)}` : ""}`
              : "";
          const weekdaysOf = (dates: string[]) => {
            const set = new Set(
              dates.map((d) => {
                const [y, m, dd] = d.split("-").map(Number);
                return new Date(y, m - 1, dd).getDay();
              })
            );
            if (set.size !== 1) return "";
            const [y, m, dd] = dates[0].split("-").map(Number);
            return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long" }) + "s";
          };
          const fmtShort = (d: string) => {
            const [y, m, dd] = d.split("-").map(Number);
            return new Date(y, m - 1, dd).toLocaleDateString("en-US", { month: "short", day: "numeric" });
          };
          const hasInfo = ev.event_date || hasMultiDates || ev.event_start_time || ev.event_end_time || (ev.event_times?.length ?? 0) > 0 || (ev.event_locations?.length ?? 0) > 0;
          if (!hasInfo) return null;
          return (
            <div className="mt-3 pt-3 border-t border-[#0E96B0]/8 space-y-1.5 text-sm text-[#2E5566]">
              {hasMultiDates ? (
                <div className="flex items-start gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                  <span>
                    {weekdaysOf(multiDates) && (
                      <span className="font-medium">{weekdaysOf(multiDates)} · </span>
                    )}
                    <span className="font-medium">{multiDates.map(fmtShort).join(", ")}</span>
                    {timeSuffix && <span className="text-[#5A8399]">{timeSuffix}</span>}
                  </span>
                </div>
              ) : (
                ev.event_date && (
                  <div className="flex items-center gap-2">
                    <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                    <span className="font-medium">{fmtDate(ev.event_date)}</span>
                    {(ev.event_start_time || ev.event_end_time) && (
                      <span className="text-[#5A8399]">
                        · {ev.event_start_time ? fmtTime(ev.event_start_time) : ""}
                        {ev.event_end_time ? ` – ${fmtTime(ev.event_end_time)}` : ""}
                      </span>
                    )}
                  </div>
                )
              )}
              {(ev.event_times ?? []).map((t, i) => (
                <div key={`t${i}`} className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                    <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                  </svg>
                  {t.label && <span className="font-medium">{t.label}:</span>}
                  <span className="text-[#5A8399]">{t.time ? fmtTime(t.time) : ""}</span>
                </div>
              ))}
              {(ev.event_locations ?? []).map((l, i) => (
                <div key={`l${i}`} className="flex items-start gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0 mt-0.5">
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                  </svg>
                  {l.label && <span className="font-medium">{l.label}:</span>}
                  <span className="text-[#5A8399]">{l.address}</span>
                </div>
              ))}
            </div>
          );
        })()}
        <div className="mt-4 pt-4 border-t border-[#0E96B0]/8 text-xs text-[#5A8399] flex items-center gap-1.5">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5 text-[#0E96B0]">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          {eventType === "items"
            ? "Claim an item below to sign up"
            : isSingleSession
            ? "Fill in your information below to register"
            : "Select slots below, then complete your sign up"}
        </div>
      </div>
    </div>
  );
}
