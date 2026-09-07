"use client";

import { use, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import QRCode from "qrcode";
import { supabase, getPublicCampaignById } from "@/lib/supabase";
import type { Session, CampaignItemWithSignups } from "@/lib/types";
import { formatTime } from "@/lib/utils";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

interface SessionWithSignups extends Session {
  signups: { id: string; guest_names: string[] }[] | null;
}

export default function FlyerPage({ params }: { params: Promise<{ id: string }> }) {
  const brand = useBrand();
  const { id: eventId } = use(params);
  const [event, setEvent] = useState<any>(null);
  const [eventType, setEventType] = useState<"spots" | "items" | "rsvp">("spots");
  const [showCapacityPublicly, setShowCapacityPublicly] = useState(true);
  const [sessions, setSessions] = useState<SessionWithSignups[]>([]);
  const [items, setItems] = useState<CampaignItemWithSignups[]>([]);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [qrPngDataUrl, setQrPngDataUrl] = useState<string>("");
  const [signupUrl, setSignupUrl] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = `${window.location.origin}/event/${eventId}`;
    setSignupUrl(url);

    (async () => {
      try {
        // Visibility flags + cover/logo come from the public RPC now (SECURITY DEFINER);
        // direct table read against `campaigns` is blocked for anon by org-scoped RLS.
        const pubResult = await getPublicCampaignById(eventId);

        const { data: pubRows, error: eventError } = pubResult;
        const rows = Array.isArray(pubRows) ? pubRows : pubRows ? [pubRows] : [];
        const eventData = rows[0] as Record<string, any> | undefined;
        if (eventError || !eventData) throw eventError ?? new Error("Event not found");

        setEvent(eventData);

        const resolvedType: "spots" | "items" | "rsvp" =
          eventData.event_type === "items" ? "items" : eventData.event_type === "rsvp" ? "rsvp" : "spots";
        setEventType(resolvedType);
        const scp = eventData.show_capacity_publicly;
        setShowCapacityPublicly(scp == null ? true : Boolean(scp));

        if (resolvedType === "items") {
          const { data: itemsData } = await supabase
            .from("campaign_items")
            .select("*, item_signups(id, member_name, member_email, signup_note, quantity)")
            .eq("campaign_id", eventId)
            .order("sort_order")
            .order("created_at");
          setItems((itemsData || []) as CampaignItemWithSignups[]);
        } else {
          const { data: sessionsData } = await supabase
            .from("sessions")
            .select(
              "id, campaign_id, day_of_week, time, end_time, session_date, capacity, location, notes, created_at, updated_at, signups(id, guest_names)"
            )
            .eq("campaign_id", eventId)
            .order("session_date", { ascending: true, nullsFirst: false })
            .order("day_of_week")
            .order("time");
          setSessions((sessionsData || []) as SessionWithSignups[]);
        }

        const svg = await QRCode.toString(url, {
          type: "svg",
          errorCorrectionLevel: "H",
          margin: 1,
          color: { dark: "#0D2B35", light: "#FFFFFF" },
        });
        setQrDataUrl(`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`);

        const png = await QRCode.toDataURL(url, {
          errorCorrectionLevel: "H",
          margin: 2,
          width: 1024,
          color: { dark: "#0D2B35", light: "#FFFFFF" },
        });
        setQrPngDataUrl(png);
      } catch (err) {
        console.error("Error fetching event for flyer:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [eventId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (!event) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center p-8">
        <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(8,100,126,0.10)] p-10 max-w-md w-full text-center">
          <h1 className="font-serif text-2xl text-[#0D2B35] mb-3">Event not found</h1>
          <p className="text-sm text-[#5A8399]">This event may have been removed or the link is incorrect.</p>
        </div>
      </div>
    );
  }

  const displayHost = brand.siteHost.replace(/^www\./, "");
  const sessionHeadcount = (s: SessionWithSignups) => (s.signups ?? []).length;

  // Sort/filter sessions for display: keep future dates first, then fall back to day-of-week recurring
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const visibleSessions = [...sessions].sort((a, b) => {
    const ad = a.session_date ? new Date(a.session_date).getTime() : Infinity;
    const bd = b.session_date ? new Date(b.session_date).getTime() : Infinity;
    if (ad !== bd) return ad - bd;
    if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
    return a.time.localeCompare(b.time);
  });

  return (
    <div className="flyer-root min-h-screen bg-[#F4FAFB]">
      {/* Screen-only toolbar */}
      <div className="no-print bg-white border-b border-[#0E96B0]/10 sticky top-0 z-10">
        <div className="max-w-[8.5in] mx-auto px-6 py-3 flex items-center justify-between gap-3 flex-wrap">
          <Link
            href={`/event/${eventId}`}
            className="flex items-center gap-1.5 text-sm font-medium text-[#5A8399] hover:text-[#0E96B0] transition-colors no-underline"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            Back to event
          </Link>
          <div className="flex items-center gap-2">
            <a
              href={qrPngDataUrl}
              download={`qr-${slugify(event.name)}.png`}
              className="text-sm font-semibold px-4 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline"
            >
              Download QR only
            </a>
            <button
              type="button"
              onClick={() => window.print()}
              className="text-sm font-semibold px-5 py-2 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.30)] hover:-translate-y-0.5 hover:shadow-[0_5px_16px_rgba(14,150,176,0.40)] transition-all"
            >
              Print / Save as PDF
            </button>
          </div>
        </div>
        <div className="max-w-[8.5in] mx-auto px-6 pb-3">
          <p className="text-xs text-[#5A8399] leading-snug">
            Tip: In the print dialog, choose <strong>Save as PDF</strong> to get a file you can email or share — or print directly to hand out in Elders Quorum, post on bulletin boards, etc.
          </p>
        </div>
      </div>

      {/* The flyer — sized to US Letter width */}
      <div className="flyer-page">
        {/* Scan-to-sign-up hero */}
        <div className="flyer-hero">
          <div className="flyer-qr-wrap">
            {qrDataUrl && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={qrDataUrl} alt="Scan to sign up" className="flyer-qr" />
            )}
          </div>
          <div className="flyer-hero-text">
            <div className="flyer-hero-brand">
              <Image src={brand.logoSrc} alt={brand.logoAlt} width={22} height={22} className="rounded-[5px]" />
              <span>{brand.name}</span>
            </div>
            <div className="flyer-hero-label">Scan to sign up</div>
            <div className="flyer-hero-sub">
              Point your phone camera at the code — no app needed.
            </div>
            <div className="flyer-hero-or">— or visit —</div>
            <div className="flyer-hero-host">{displayHost}</div>
            <div className="flyer-hero-url">{signupUrl}</div>
          </div>
        </div>

        {/* Event card */}
        <div className="flyer-event-card">
          <div className="flyer-event-card-band" />
          <div className="flyer-event-card-inner">
            {event.organizer_logo_url && brand.id === "ministrysignup" && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={event.organizer_logo_url}
                alt="Organizer"
                className="flyer-organizer-logo"
              />
            )}
            <h1 className="flyer-title">{event.name}</h1>
            {event.description && (
              <p className="flyer-description">{event.description}</p>
            )}
          </div>
        </div>

        {/* Sessions / items list */}
        {eventType === "items" && (
          <ItemsList items={items} />
        )}

        {(eventType === "spots" || eventType === "rsvp") && visibleSessions.length > 0 && (
          <SessionsList
            sessions={visibleSessions}
            showCapacityPublicly={showCapacityPublicly}
            sessionHeadcount={sessionHeadcount}
            isRsvp={eventType === "rsvp"}
          />
        )}

        {/* Flexible spacer — pushes footer to the bottom of the letter page */}
        <div className="flyer-spacer" />

        <div className="flyer-footer">
          Made with <span style={{ color: "#e11d48" }}>♥</span> from Arizona — {displayHost}
        </div>
      </div>

      <style jsx global>{`
        .flyer-page {
          width: 8.5in;
          min-height: 11in;
          margin: 24px auto;
          background: white;
          box-shadow: 0 10px 40px rgba(8, 100, 126, 0.12);
          border-radius: 6px;
          overflow: hidden;
          padding: 0.55in 0.6in 0.5in;
          display: flex;
          flex-direction: column;
        }
        .flyer-spacer {
          flex: 1 1 auto;
          min-height: 0.4in;
        }
        .flyer-hero {
          display: flex;
          align-items: center;
          gap: 20px;
          padding: 16px 20px;
          background: linear-gradient(135deg, #E6F7FB 0%, #F4FAFB 100%);
          border: 1.5px solid #0D2B35;
          border-radius: 14px;
          margin-bottom: 20px;
        }
        .flyer-qr-wrap {
          width: 1.4in;
          height: 1.4in;
          padding: 6px;
          background: white;
          border-radius: 10px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .flyer-qr {
          width: 100%;
          height: 100%;
        }
        .flyer-hero-text {
          flex: 1;
          min-width: 0;
        }
        .flyer-hero-brand {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: 16px;
          color: #0D2B35;
          margin-bottom: 10px;
          letter-spacing: 0.3px;
        }
        .flyer-hero-label {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: 28px;
          color: #0D2B35;
          line-height: 1.05;
          margin-bottom: 6px;
        }
        .flyer-hero-sub {
          font-size: 14px;
          color: #2E5566;
          line-height: 1.4;
          margin-bottom: 16px;
        }
        .flyer-hero-or {
          font-size: 11px;
          font-weight: 600;
          color: #5A8399;
          letter-spacing: 2px;
          text-transform: uppercase;
          margin-bottom: 4px;
        }
        .flyer-hero-host {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: 20px;
          color: #0E96B0;
          line-height: 1.1;
          margin-bottom: 4px;
        }
        .flyer-hero-url {
          font-size: 10px;
          color: #5A8399;
          word-break: break-all;
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        }

        .flyer-event-card {
          border: 1px solid rgba(14, 150, 176, 0.18);
          border-radius: 16px;
          overflow: hidden;
          margin-bottom: 20px;
        }
        .flyer-event-card-band {
          height: 6px;
          background: linear-gradient(90deg, #22C8D8, #0E96B0, #08647E);
        }
        .flyer-event-card-inner {
          padding: 20px 24px;
        }
        .flyer-organizer-logo {
          width: 48px;
          height: 48px;
          border-radius: 12px;
          border: 1px solid rgba(14, 150, 176, 0.2);
          object-fit: cover;
          margin-bottom: 10px;
        }
        .flyer-title {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: 34px;
          line-height: 1.1;
          color: #0D2B35;
          letter-spacing: -0.3px;
          margin: 0 0 10px;
          word-wrap: break-word;
          overflow-wrap: break-word;
        }
        .flyer-description {
          font-size: 13.5px;
          line-height: 1.5;
          color: #2E5566;
          margin: 0;
          white-space: pre-wrap;
        }

        .flyer-section-header {
          font-family: var(--font-dm-serif), Georgia, serif;
          font-size: 20px;
          color: #0D2B35;
          margin: 24px 0 10px;
        }
        .flyer-session-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 8px;
        }
        .flyer-session {
          border: 1px solid rgba(14, 150, 176, 0.2);
          border-radius: 10px;
          padding: 10px 12px;
          font-size: 12.5px;
          color: #0D2B35;
          line-height: 1.35;
          background: #FAFDFE;
          break-inside: avoid;
        }
        .flyer-session-when {
          font-weight: 600;
          color: #0D2B35;
        }
        .flyer-session-meta {
          font-size: 11.5px;
          color: #5A8399;
          margin-top: 2px;
        }
        .flyer-session-capacity {
          font-size: 11px;
          font-weight: 600;
          color: #1D9E75;
          margin-top: 3px;
        }
        .flyer-session-full {
          color: #dc2626;
        }
        .flyer-session-notes {
          font-size: 11px;
          color: #5A8399;
          margin-top: 3px;
          font-style: italic;
        }

        .flyer-item {
          border: 1px solid rgba(14, 150, 176, 0.2);
          border-radius: 10px;
          padding: 10px 14px;
          margin-bottom: 6px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #FAFDFE;
          font-size: 13px;
          color: #0D2B35;
          break-inside: avoid;
        }
        .flyer-item-label {
          font-weight: 600;
        }
        .flyer-item-meta {
          font-size: 11px;
          color: #5A8399;
        }

        .flyer-footer {
          margin-top: 14px;
          padding-top: 10px;
          border-top: 1px solid rgba(14, 150, 176, 0.15);
          font-size: 10.5px;
          color: #5A8399;
          letter-spacing: 0.3px;
          text-align: center;
        }

        @media print {
          .no-print { display: none !important; }
          html, body { background: white !important; }
          body { margin: 0; }
          .flyer-root { background: white !important; min-height: 0 !important; }
          .flyer-page {
            margin: 0 auto;
            box-shadow: none !important;
            border-radius: 0 !important;
            padding: 0.45in 0.5in !important;
          }
          @page {
            size: letter;
            margin: 0;
          }
          .flyer-session, .flyer-item, .flyer-event-card, .flyer-hero {
            break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "event";
}

function SessionsList({
  sessions,
  showCapacityPublicly,
  sessionHeadcount,
  isRsvp,
}: {
  sessions: SessionWithSignups[];
  showCapacityPublicly: boolean;
  sessionHeadcount: (s: SessionWithSignups) => number;
  isRsvp: boolean;
}) {
  if (sessions.length === 0) return null;

  return (
    <div>
      <h2 className="flyer-section-header">
        {isRsvp ? "Event details" : sessions.length === 1 ? "When" : "Available sessions"}
      </h2>
      <div className={sessions.length > 1 ? "flyer-session-grid" : ""}>
        {sessions.map((s) => {
          const filled = sessionHeadcount(s);
          const isFull = filled >= s.capacity;
          const unlimited = s.capacity >= 999;
          const when = s.session_date
            ? (() => {
                const [y, m, d] = s.session_date!.split("-").map(Number);
                return new Date(y, m - 1, d).toLocaleDateString("en-US", {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                });
              })()
            : DAYS[s.day_of_week];
          const timeStr =
            formatTime(s.time) + (s.end_time ? ` – ${formatTime(s.end_time)}` : "");

          return (
            <div key={s.id} className="flyer-session">
              <div className="flyer-session-when">
                {when} · {timeStr}
              </div>
              {s.location && (
                <div className="flyer-session-meta">{s.location}</div>
              )}
              {s.notes && <div className="flyer-session-notes">{s.notes}</div>}
              {(!unlimited && showCapacityPublicly) && (
                <div className={`flyer-session-capacity ${isFull ? "flyer-session-full" : ""}`}>
                  {isFull ? "Full" : `${s.capacity - filled} of ${s.capacity} spots left`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemsList({ items }: { items: CampaignItemWithSignups[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h2 className="flyer-section-header">Items to bring</h2>
      {items.map((item) => {
        const claimed = (item.item_signups ?? []).reduce((s, r) => s + ((r as { quantity?: number }).quantity ?? 1), 0);
        const limit = item.item_limit;
        const isFull = limit !== null && claimed >= limit;
        return (
          <div key={item.id} className="flyer-item">
            <span className="flyer-item-label">{item.label}</span>
            <span className="flyer-item-meta">
              {isFull
                ? `Full — ${claimed} claimed`
                : limit !== null
                ? `${claimed} of ${limit} claimed`
                : claimed > 0
                ? `${claimed} claimed`
                : "Open"}
            </span>
          </div>
        );
      })}
    </div>
  );
}
