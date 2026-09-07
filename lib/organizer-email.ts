import type { SupabaseClient } from "@supabase/supabase-js";
import {
  organizerEmailFrom,
  publicSiteOriginAndBrandForCampaign,
  type PublicBrand,
} from "@/lib/brand";
import { buildOrganizerEmailFooterHtml } from "@/lib/site-footer";
import { escapeHtml } from "@/lib/html-escape";
import { formatTimeRange } from "@/lib/utils";
import { hasResendConfiguredForBrand } from "@/lib/resend-for-brand";
import { sendGuardedEmail } from "@/lib/email-send";
import { formatInTimeZone } from "date-fns-tz";
import {
  resolveEffectiveEventTimezone,
  sessionStartUtc,
} from "@/lib/event-timezone";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Shown in UI copy; Vercel cron runs `/api/cron/organizer-faster` every 30 minutes. */
export const FASTER_ALERT_SCHEDULE_LABEL = "about every 30 minutes";

export async function resolveOrganizerEmail(
  admin: SupabaseClient,
  campaign: { user_email: string | null; created_by: string | null },
): Promise<string | null> {
  const direct = campaign.user_email?.trim();
  if (direct) return direct;
  if (!campaign.created_by) return null;
  const { data, error } = await admin.auth.admin.getUserById(campaign.created_by);
  if (error || !data.user?.email) return null;
  return data.user.email;
}

type SignupRow = {
  member_name: string;
  member_email: string | null;
  member_phone: string | null;
  signed_up_at?: string | null;
};

type SessionRow = {
  id: string;
  day_of_week: number;
  time: string;
  end_time: string | null;
  session_date: string | null;
  location: string | null;
  notes: string | null;
  capacity: number;
  signups: SignupRow[] | null;
};

export type FasterNewSignupRow = {
  name: string;
  sessionLabel: string;
  signedAtIso: string | null;
};

function formatSignedUpAt(
  iso: string | null | undefined,
  eventTimezone?: string | null,
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  // Without an explicit zone the server's zone leaks in (UTC on Vercel), so
  // organizers would see "Signed up" times shifted by several hours.
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
    timeZone: resolveEffectiveEventTimezone(eventTimezone ?? null),
  });
}

function signupTimeMs(u: SignupRow): number {
  const t = u.signed_up_at ? new Date(u.signed_up_at).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

function buildNewSignupsBannerHtml(
  rows: FasterNewSignupRow[],
  eventTimezone?: string | null,
): string {
  if (rows.length === 0) return "";

  const tableRows = rows
    .map(
      (r) => `<tr>
    <td style="border-top:1px solid #e6f0f3;padding:8px 6px;">${escapeHtml(r.name)}</td>
    <td style="border-top:1px solid #e6f0f3;padding:8px 6px;font-size:12px;color:#2E5566;">${escapeHtml(r.sessionLabel)}</td>
    <td style="border-top:1px solid #e6f0f3;padding:8px 6px;white-space:nowrap;font-size:12px;color:#054F64;">${escapeHtml(formatSignedUpAt(r.signedAtIso, eventTimezone))}</td>
  </tr>`,
    )
    .join("");

  return `
    <div style="margin:0 0 24px;padding:16px;background:#FFF8E6;border:1px solid #F5D78A;border-radius:12px;">
      <div style="font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#b45309;margin:0 0 10px;">New signups since last notice</div>
      <p style="font-size:12px;color:#5A8399;margin:0 0 10px;line-height:1.5;">Newest first — only signups that arrived after your previous faster alert.</p>
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:13px;">
        <tr style="background:rgba(255,255,255,0.65);">
          <th align="left" style="padding:6px;color:#2E5566;">Name</th>
          <th align="left" style="padding:6px;color:#2E5566;">Slot</th>
          <th align="left" style="padding:6px;color:#2E5566;">Signed up</th>
        </tr>
        ${tableRows}
      </table>
    </div>
  `;
}

/**
 * Slot label for emails (digest, faster alerts, participant confirmation/reminders).
 * Pass `eventTimezone` for dated slots so the calendar line matches the organizer’s zone
 * (server default timezone is wrong on Vercel).
 */
export function formatSessionSlotLabel(
  sess: {
    day_of_week: number;
    time: string;
    end_time: string | null;
    session_date: string | null;
  },
  options?: { eventTimezone?: string | null },
): string {
  if (sess.session_date) {
    if (options !== undefined) {
      const tz = resolveEffectiveEventTimezone(options.eventTimezone);
      try {
        const start = sessionStartUtc(sess.session_date, sess.time, tz);
        const dateStr = formatInTimeZone(start, tz, "EEE, MMM d, yyyy");
        return `${dateStr} · ${formatTimeRange(sess.time, sess.end_time)}`;
      } catch {
        /* fall through to legacy */
      }
    }
    const [y, m, d] = sess.session_date.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    const dateStr = dt.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    return `${dateStr} · ${formatTimeRange(sess.time, sess.end_time)}`;
  }
  return `${DAYS[sess.day_of_week] ?? "Day"} · ${formatTimeRange(sess.time, sess.end_time)}`;
}

function formatSessionWhen(s: SessionRow, eventTimezone?: string | null): string {
  return formatSessionSlotLabel(s, { eventTimezone: eventTimezone ?? null });
}

/**
 * Chronological sort key. Dated sessions sort by calendar date then start time;
 * weekly (undated) sessions sort after them by day-of-week then time.
 */
function sessionChronoKey(s: SessionRow): string {
  if (s.session_date) return `0|${s.session_date}|${s.time}`;
  return `1|${s.day_of_week}|${s.time}`;
}

/**
 * Split a session's "when" into a date heading (shared by all slots that day)
 * and a time label, so the email can group same-day slots together.
 */
function sessionDateAndTimeLabels(
  s: SessionRow,
  eventTimezone?: string | null,
): { dateLabel: string; timeLabel: string } {
  const timeLabel = formatTimeRange(s.time, s.end_time);
  if (s.session_date) {
    const tz = resolveEffectiveEventTimezone(eventTimezone ?? null);
    try {
      const start = sessionStartUtc(s.session_date, s.time, tz);
      return { dateLabel: formatInTimeZone(start, tz, "EEEE, MMM d, yyyy"), timeLabel };
    } catch {
      const [y, m, d] = s.session_date.split("-").map(Number);
      const dt = new Date(y, m - 1, d);
      return {
        dateLabel: dt.toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
        timeLabel,
      };
    }
  }
  return { dateLabel: `Every ${DAYS[s.day_of_week] ?? "week"}`, timeLabel };
}

function sessionFieldsToRow(sess: {
  day_of_week: number;
  time: string;
  end_time: string | null;
  session_date: string | null;
  location?: string | null;
}): SessionRow {
  return {
    id: "",
    day_of_week: sess.day_of_week,
    time: sess.time,
    end_time: sess.end_time,
    session_date: sess.session_date,
    location: sess.location ?? null,
    notes: null,
    capacity: 0,
    signups: null,
  };
}

function buildSessionsTableHtml(
  sessions: SessionRow[],
  options?: { rosterStyle?: "default" | "faster"; eventTimezone?: string | null },
): string {
  if (sessions.length === 0) {
    return `<p style="color:#5A8399;font-size:14px;">No slots yet.</p>`;
  }

  const rosterStyle = options?.rosterStyle ?? "default";
  const showSignedUpCol = rosterStyle === "faster";

  const sorted = [...sessions].sort((a, b) =>
    sessionChronoKey(a) < sessionChronoKey(b) ? -1 : sessionChronoKey(a) > sessionChronoKey(b) ? 1 : 0,
  );

  const rows: string[] = [];
  let lastDateLabel: string | null = null;
  for (const s of sorted) {
    const { dateLabel, timeLabel } = sessionDateAndTimeLabels(s, options?.eventTimezone);
    if (dateLabel !== lastDateLabel) {
      rows.push(`
      <div style="margin:${lastDateLabel === null ? "0" : "28px"} 0 12px;padding:8px 12px;background:#E6F7FB;border-radius:8px;font-weight:700;color:#054F64;font-size:14px;">${escapeHtml(dateLabel)}</div>
    `);
      lastDateLabel = dateLabel;
    }
    const when = escapeHtml(timeLabel);
    const loc = s.location?.trim()
      ? `<div style="font-size:12px;color:#5A8399;margin-top:4px;">${escapeHtml(s.location)}</div>`
      : "";
    const notes = s.notes?.trim()
      ? `<div style="font-size:12px;color:#5A8399;margin-top:2px;">${escapeHtml(s.notes)}</div>`
      : "";
    let su = (s.signups && Array.isArray(s.signups) ? [...s.signups] : []) as SignupRow[];
    if (showSignedUpCol && su.length > 1) {
      su.sort((a, b) => signupTimeMs(b) - signupTimeMs(a));
    }
    const filled = su.length;
    const cap = s.capacity;
    const roster =
      su.length === 0
        ? `<span style="color:#5A8399;font-size:13px;">No signups yet</span>`
        : `<table role="presentation" cellpadding="6" cellspacing="0" style="border-collapse:collapse;width:100%;font-size:13px;">
            <tr style="background:#F4FAFB;">
              <th align="left" style="color:#2E5566;">Name</th>
              <th align="left" style="color:#2E5566;">Email</th>
              <th align="left" style="color:#2E5566;">Phone</th>
              ${
                showSignedUpCol
                  ? `<th align="left" style="color:#2E5566;white-space:nowrap;">Signed up</th>`
                  : ""
              }
            </tr>
            ${su
              .map(
                (u) => `<tr>
              <td style="border-top:1px solid #e6f0f3;">${escapeHtml(u.member_name)}</td>
              <td style="border-top:1px solid #e6f0f3;">${u.member_email ? escapeHtml(u.member_email) : "—"}</td>
              <td style="border-top:1px solid #e6f0f3;">${u.member_phone ? escapeHtml(u.member_phone) : "—"}</td>
              ${
                showSignedUpCol
                  ? `<td style="border-top:1px solid #e6f0f3;font-size:12px;color:#054F64;white-space:nowrap;">${escapeHtml(formatSignedUpAt(u.signed_up_at, options?.eventTimezone))}</td>`
                  : ""
              }
            </tr>`,
              )
              .join("")}
          </table>`;

    rows.push(`
      <div style="margin-bottom:20px;padding-bottom:16px;border-bottom:1px solid rgba(14,150,176,0.15);">
        <div style="font-weight:600;color:#0D2B35;font-size:14px;">${when}</div>
        ${loc}
        ${notes}
        <div style="margin-top:8px;font-size:12px;color:#2E5566;"><strong>${filled}</strong> / ${cap} spots filled${
          showSignedUpCol ? " · <span style=\"color:#b45309;\">newest first</span>" : ""
        }</div>
        <div style="margin-top:10px;">${roster}</div>
      </div>
    `);
  }
  return rows.join("");
}

type ItemRow = {
  id: string;
  label: string;
  item_limit: number | null;
  item_signups: { id: string; member_name: string; quantity: number; custom_label?: string | null }[] | null;
};

type CustomItemSignupRow = {
  id: string;
  member_name: string;
  custom_label: string | null;
  quantity: number;
};

/** Items-type events don't have sessions — render the items list instead. */
function buildOrganizerItemsEmailHtml(params: {
  brand: PublicBrand;
  campaignName: string;
  eventUrl: string;
  adminUrl: string;
  items: ItemRow[];
  customSignups: CustomItemSignupRow[];
  headline: string;
}): string {
  const { brand, campaignName, eventUrl, adminUrl, items, customSignups, headline } = params;
  const itemClaimed = (it: ItemRow) =>
    (it.item_signups ?? []).reduce((s, r) => s + (r.quantity ?? 1), 0);

  const totalItems = items.length;
  const totalClaimed = items.reduce((sum, it) => sum + itemClaimed(it), 0) + customSignups.reduce((s, r) => s + (r.quantity ?? 1), 0);
  const unclaimedCount = items.filter((it) => itemClaimed(it) === 0).length;

  const itemsTable = items.length === 0
    ? `<p style="color:#5A8399;font-size:13px;margin:0;">No items added yet.</p>`
    : items.map((item) => {
        const claimed = itemClaimed(item);
        const limit = item.item_limit;
        const cap = limit !== null ? `${claimed} / ${limit}` : `${claimed}`;
        const roster = (item.item_signups ?? []).length === 0
          ? `<div style="font-size:12px;color:#5A8399;font-style:italic;">No one yet</div>`
          : (item.item_signups ?? [])
              .map((sig) => {
                const qty = (sig.quantity ?? 1) > 1 ? ` ×${sig.quantity}` : "";
                return `<div style="font-size:13px;color:#0D2B35;">${escapeHtml(sig.member_name)}${qty}</div>`;
              })
              .join("");
        return `
        <div style="margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid rgba(14,150,176,0.15);">
          <div style="display:flex;justify-content:space-between;align-items:baseline;gap:12px;margin-bottom:6px;">
            <strong style="color:#0D2B35;font-size:14px;">${escapeHtml(item.label)}</strong>
            <span style="color:#0E96B0;font-size:12px;font-weight:600;white-space:nowrap;">${cap} claimed</span>
          </div>
          ${roster}
        </div>`;
      }).join("");

  const customBlock = customSignups.length === 0 ? "" : `
    <h2 style="font-size:15px;color:#2E5566;margin:24px 0 12px;">Also bringing (write-ins)</h2>
    ${customSignups.map((sig) => `
      <div style="font-size:13px;color:#0D2B35;margin-bottom:6px;">
        <strong>${escapeHtml(sig.custom_label || "(unnamed)")}</strong>
        <span style="color:#5A8399;"> · ${escapeHtml(sig.member_name)}${(sig.quantity ?? 1) > 1 ? ` ×${sig.quantity}` : ""}</span>
      </div>`).join("")}
  `;

  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;min-width:0;width:100%;box-sizing:border-box;margin:0 auto;padding:24px;color:#0D2B35;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">${escapeHtml(headline)}</p>
    <h1 style="font-size:22px;margin:0 0 16px;color:#054F64;">${escapeHtml(campaignName)}</h1>
    <p style="font-size:14px;margin:0 0 20px;">
      <a href="${eventUrl}" style="color:#0E96B0;font-weight:600;text-decoration:none;">Open signup page</a>
      &nbsp;·&nbsp;
      <a href="${adminUrl}" style="color:#0E96B0;font-weight:600;text-decoration:none;">Manage event</a>
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;background:#E6F7FB;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;text-align:center;width:33%;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#0E96B0;">Items</div>
          <div style="font-size:26px;font-weight:600;color:#054F64;">${totalItems}</div>
        </td>
        <td style="padding:16px;text-align:center;width:33%;background:#edfaf4;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#1D9E75;">Claimed</div>
          <div style="font-size:26px;font-weight:600;color:#0F6E56;">${totalClaimed}</div>
        </td>
        <td style="padding:16px;text-align:center;width:33%;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#d97706;">Unclaimed</div>
          <div style="font-size:26px;font-weight:600;color:#b45309;">${unclaimedCount}</div>
        </td>
      </tr>
    </table>

    <h2 style="font-size:15px;color:#2E5566;margin:0 0 12px;">Items & signups</h2>
    ${itemsTable}
    ${customBlock}

    ${buildOrganizerEmailFooterHtml(brand)}
  </div>
  `;
}

export function buildOrganizerMetricsEmailHtml(params: {
  brand: PublicBrand;
  campaignName: string;
  eventUrl: string;
  adminUrl: string;
  totalCapacity: number;
  totalSignups: number;
  remaining: number;
  fillPct: number;
  sessions: SessionRow[];
  headline: string;
  kind?: "digest" | "manual" | "faster";
  fasterNewSignups?: FasterNewSignupRow[];
  eventTimezone?: string | null;
}): string {
  const {
    brand,
    campaignName,
    eventUrl,
    adminUrl,
    totalCapacity,
    totalSignups,
    remaining,
    fillPct,
    sessions,
    headline,
    kind = "digest",
    fasterNewSignups = [],
    eventTimezone = null,
  } = params;

  const isFaster = kind === "faster";
  const fasterBanner =
    isFaster && fasterNewSignups.length > 0
      ? buildNewSignupsBannerHtml(fasterNewSignups, eventTimezone)
      : "";

  return `
  <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;min-width:0;width:100%;box-sizing:border-box;margin:0 auto;padding:24px;color:#0D2B35;word-wrap:break-word;word-break:break-word;overflow-wrap:break-word;">
    <p style="font-size:16px;line-height:1.6;margin:0 0 12px;">${escapeHtml(headline)}</p>
    <h1 style="font-size:22px;margin:0 0 16px;color:#054F64;">${escapeHtml(campaignName)}</h1>
    <p style="font-size:14px;margin:0 0 20px;">
      <a href="${eventUrl}" style="color:#0E96B0;font-weight:600;text-decoration:none;">Open signup page</a>
      &nbsp;·&nbsp;
      <a href="${adminUrl}" style="color:#0E96B0;font-weight:600;text-decoration:none;">Manage event</a>
    </p>

    <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:24px;background:#E6F7FB;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:16px;text-align:center;width:33%;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#0E96B0;">Total spots</div>
          <div style="font-size:26px;font-weight:600;color:#054F64;">${totalCapacity}</div>
        </td>
        <td style="padding:16px;text-align:center;width:33%;background:#edfaf4;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#1D9E75;">Signed up</div>
          <div style="font-size:26px;font-weight:600;color:#0F6E56;">${totalSignups}</div>
        </td>
        <td style="padding:16px;text-align:center;width:33%;">
          <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#d97706;">Remaining</div>
          <div style="font-size:26px;font-weight:600;color:#b45309;">${remaining}</div>
        </td>
      </tr>
    </table>
    <p style="font-size:13px;color:#5A8399;margin:-8px 0 20px;">${fillPct}% filled</p>

    ${fasterBanner}

    <h2 style="font-size:15px;color:#2E5566;margin:0 0 12px;">Slots & signups</h2>
    ${buildSessionsTableHtml(sessions, { rosterStyle: isFaster ? "faster" : "default", eventTimezone })}

    ${buildOrganizerEmailFooterHtml(brand)}
  </div>
  `;
}

function subjectForKind(
  brand: PublicBrand,
  kind: "digest" | "manual" | "faster",
  eventName: string,
  newCount?: number,
): string {
  const label = brand.shortName;
  const n = eventName.trim() || "Your event";
  if (kind === "manual") return `${label} · ${n} — your report`;
  if (kind === "faster") {
    const c = typeof newCount === "number" ? newCount : 0;
    return `${label} · ${n} — ${c} new signup${c === 1 ? "" : "s"}`;
  }
  return `${label} · ${n} — daily summary`;
}

function headlineForKind(kind: "digest" | "manual" | "faster"): string {
  if (kind === "manual") return "Here is your current signup report.";
  if (kind === "faster")
    return `New signups since your last faster alert — full roster below.`;
  return "Here is your signup summary.";
}

export async function sendOrganizerMetricsEmail(
  admin: SupabaseClient,
  campaignId: string,
  kind: "digest" | "manual",
): Promise<{
  ok: boolean;
  skipped?: string;
  error?: string;
  resendId?: string;
  /** Recipient when send succeeded (helps debug “wrong inbox”). */
  sentTo?: string;
}> {
  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .select("*")
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    return { ok: false, error: "Campaign not found" };
  }

  const c = campaign as Record<string, unknown>;
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: c.brand_id as string | null | undefined,
    public_host: c.public_host as string | null | undefined,
  });

  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend API key not configured for this brand" };
  }

  const to = await resolveOrganizerEmail(admin, {
    user_email: (c.user_email as string | null) ?? null,
    created_by: (c.created_by as string | null) ?? null,
  });
  if (!to) {
    return { ok: false, skipped: "no_organizer_email" };
  }

  const eventType = String(c.event_type ?? "spots");
  const name = String(c.name ?? "Event");
  const eventUrl = `${siteOrigin}/event/${campaignId}`;
  const adminUrl = `${siteOrigin}/admin/${campaignId}`;

  let html: string;

  if (eventType === "items") {
    // Items-type events have no sessions; summarize the items list instead.
    const { data: itemRows, error: iErr } = await admin
      .from("campaign_items")
      .select("id, label, item_limit, item_signups(id, member_name, quantity)")
      .eq("campaign_id", campaignId)
      .order("sort_order")
      .order("created_at");
    if (iErr) {
      return { ok: false, error: iErr.message };
    }
    const { data: customRows, error: cuErr } = await admin
      .from("item_signups")
      .select("id, member_name, custom_label, quantity")
      .eq("campaign_id", campaignId)
      .is("item_id", null)
      .order("signed_up_at");
    if (cuErr) {
      return { ok: false, error: cuErr.message };
    }
    html = buildOrganizerItemsEmailHtml({
      brand,
      campaignName: name,
      eventUrl,
      adminUrl,
      items: (itemRows ?? []) as unknown as ItemRow[],
      customSignups: (customRows ?? []) as unknown as CustomItemSignupRow[],
      headline: headlineForKind(kind),
    });
  } else {
    const { data: sessionRows, error: sErr } = await admin
      .from("sessions")
      .select("*, signups(*)")
      .eq("campaign_id", campaignId)
      .order("day_of_week", { ascending: true })
      .order("time", { ascending: true });

    if (sErr) {
      return { ok: false, error: sErr.message };
    }

    const sessions = (sessionRows || []) as unknown as SessionRow[];
    const totalCapacity = sessions.reduce((sum, s) => sum + (s.capacity || 0), 0);
    const totalSignups = sessions.reduce(
      (sum, s) => sum + (Array.isArray(s.signups) ? s.signups.length : 0),
      0,
    );
    const remaining = Math.max(0, totalCapacity - totalSignups);
    const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;

    html = buildOrganizerMetricsEmailHtml({
      brand,
      campaignName: name,
      eventUrl,
      adminUrl,
      totalCapacity,
      totalSignups,
      remaining,
      fillPct,
      sessions,
      headline: headlineForKind(kind),
      kind,
      eventTimezone: (c.event_timezone as string | null) ?? null,
    });
  }

  try {
    const send = await sendGuardedEmail({
      brand,
      category: "notification",
      from: organizerEmailFrom(brand),
      to,
      subject: subjectForKind(brand, kind, name),
      html,
    });
    if (!send.ok) {
      console.error("organizer email send blocked/failed:", send.error || send.skipped);
      return { ok: false, error: send.error || send.skipped };
    }
    return { ok: true, sentTo: to };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Resend organizer email error:", e);
    return { ok: false, error: msg };
  }
}

type SignupWithSessionJoin = {
  member_name: string;
  signed_up_at: string | null;
  sessions:
    | {
        day_of_week: number;
        time: string;
        end_time: string | null;
        session_date: string | null;
        location: string | null;
      }
    | null
    | Array<{
        day_of_week: number;
        time: string;
        end_time: string | null;
        session_date: string | null;
        location: string | null;
      }>;
};

/**
 * Cron-only: send faster alert if there are signups with signed_up_at after organizer_last_instant_notify_at.
 * On success, advances organizer_last_instant_notify_at.
 */
export async function sendOrganizerFasterAlertEmail(
  admin: SupabaseClient,
  campaignId: string,
): Promise<{
  ok: boolean;
  skipped?: "disabled" | "no_new_signups" | "no_organizer_email";
  error?: string;
  resendId?: string;
  sentTo?: string;
}> {
  const { data: campaign, error: cErr } = await admin
    .from("campaigns")
    .select(
      "id, name, user_email, created_by, organizer_instant_notify_enabled, organizer_last_instant_notify_at, brand_id, public_host, event_timezone",
    )
    .eq("id", campaignId)
    .single();

  if (cErr || !campaign) {
    return { ok: false, error: "Campaign not found" };
  }

  const c = campaign as Record<string, unknown>;
  const { siteOrigin, brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: c.brand_id as string | null | undefined,
    public_host: c.public_host as string | null | undefined,
  });

  if (!hasResendConfiguredForBrand(brand)) {
    return { ok: false, error: "Resend API key not configured for this brand" };
  }

  if (!c.organizer_instant_notify_enabled) {
    return { ok: false, skipped: "disabled" };
  }

  const since = (c.organizer_last_instant_notify_at as string | null) ?? null;

  // Legacy rows (enabled before watermark existed): establish a baseline without emailing the full history.
  if (!since) {
    await admin
      .from("campaigns")
      .update({ organizer_last_instant_notify_at: new Date().toISOString() } as never)
      .eq("id", campaignId);
    return { ok: false, skipped: "no_new_signups" };
  }

  let newQuery = admin
    .from("signups")
    .select(
      `
      member_name,
      signed_up_at,
      sessions (
        day_of_week,
        time,
        end_time,
        session_date,
        location
      )
    `,
    )
    .eq("campaign_id", campaignId)
    .order("signed_up_at", { ascending: false })
    .gt("signed_up_at", since);

  const { data: newRowsRaw, error: nErr } = await newQuery;

  if (nErr) {
    console.error("sendOrganizerFasterAlertEmail signups query:", nErr);
    return { ok: false, error: nErr.message };
  }

  const newRows = (newRowsRaw || []) as SignupWithSessionJoin[];
  if (newRows.length === 0) {
    return { ok: false, skipped: "no_new_signups" };
  }

  const fasterNewSignups: FasterNewSignupRow[] = newRows.map((row) => {
    const sessRaw = row.sessions;
    const sess = Array.isArray(sessRaw) ? sessRaw[0] : sessRaw;
    const label = sess
      ? formatSessionWhen(sessionFieldsToRow(sess), (c.event_timezone as string | null) ?? null)
      : "Slot";
    return {
      name: row.member_name,
      sessionLabel: label,
      signedAtIso: row.signed_up_at ?? null,
    };
  });

  const to = await resolveOrganizerEmail(admin, {
    user_email: (c.user_email as string | null) ?? null,
    created_by: (c.created_by as string | null) ?? null,
  });
  if (!to) {
    return { ok: false, skipped: "no_organizer_email" };
  }

  const { data: sessionRows, error: sErr } = await admin
    .from("sessions")
    .select("*, signups(*)")
    .eq("campaign_id", campaignId)
    .order("day_of_week", { ascending: true })
    .order("time", { ascending: true });

  if (sErr) {
    return { ok: false, error: sErr.message };
  }

  const sessions = (sessionRows || []) as unknown as SessionRow[];
  const totalCapacity = sessions.reduce((sum, s) => sum + (s.capacity || 0), 0);
  const totalSignups = sessions.reduce(
    (sum, s) => sum + (Array.isArray(s.signups) ? s.signups.length : 0),
    0,
  );
  const remaining = Math.max(0, totalCapacity - totalSignups);
  const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;

  const name = String(c.name ?? "Event");
  const eventUrl = `${siteOrigin}/event/${campaignId}`;
  const adminUrl = `${siteOrigin}/admin/${campaignId}`;
  const newCount = fasterNewSignups.length;

  const html = buildOrganizerMetricsEmailHtml({
    brand,
    campaignName: name,
    eventUrl,
    adminUrl,
    totalCapacity,
    totalSignups,
    remaining,
    fillPct,
    sessions,
    headline: headlineForKind("faster"),
    kind: "faster",
    fasterNewSignups,
    eventTimezone: (c.event_timezone as string | null) ?? null,
  });

  try {
    // Advance the watermark BEFORE sending (at-most-once). The old order
    // (send, then mark) meant a failed mark re-sent the same signup list every
    // hour forever. Failing the mark now skips this alert — the signups appear
    // in the next one instead, which is the safe direction for email.
    const sentAt = new Date().toISOString();
    const { error: uErr } = await admin
      .from("campaigns")
      .update({ organizer_last_instant_notify_at: sentAt } as never)
      .eq("id", campaignId);
    if (uErr) {
      console.error("organizer_last_instant_notify_at claim failed, skipping send:", uErr);
      return { ok: false, error: uErr.message };
    }

    const send = await sendGuardedEmail({
      brand,
      category: "notification",
      from: organizerEmailFrom(brand),
      to,
      subject: subjectForKind(brand, "faster", name, newCount),
      html,
    });
    if (!send.ok) {
      console.error("organizer faster send blocked/failed:", send.error || send.skipped);
      return { ok: false, error: send.error || send.skipped };
    }

    return { ok: true, sentTo: to };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("Resend organizer faster email error:", e);
    return { ok: false, error: msg };
  }
}
