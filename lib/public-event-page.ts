import type { CampaignItemWithSignups, Session } from "@/lib/types";
import type { SessionWithSignups } from "@/components/event/event-page-shared";

/**
 * Public event page data: the event, its sessions or items, and public signups.
 *
 * One round trip through get_public_event_page when that RPC exists. If it is
 * missing (migration not applied yet) or errors, falls back to the old path:
 * get_public_campaign, then sessions + signups_public (or campaign_items +
 * item_signups_public) in parallel. Both paths read only public safe fields.
 *
 * No "use client": the server render can call this with its own anon client.
 */

export type PublicEventType = "spots" | "items" | "rsvp";

export interface PublicEventRow {
  id: string;
  name: string;
  description: string | null;
  event_type?: string | null;
  show_signups_publicly?: boolean | null;
  allow_guests?: boolean | null;
  show_capacity_publicly?: boolean | null;
  [key: string]: unknown;
}

export interface PublicCustomSignup {
  id: string;
  member_name: string;
  custom_label: string | null;
  signup_note: string | null;
  quantity: number;
}

export interface PublicEventPageData {
  event: PublicEventRow;
  eventType: PublicEventType;
  sessions: SessionWithSignups[];
  items: CampaignItemWithSignups[];
  customSignups: PublicCustomSignup[];
}

interface SignupRow {
  id: string;
  session_id: string;
  member_name: string;
  signup_note: string | null;
  guest_names: string[] | null;
}

interface ItemSignupRow {
  id: string;
  item_id: string | null;
  member_name: string;
  custom_label: string | null;
  signup_note: string | null;
  quantity: number;
}

export interface PublicEventPagePayload {
  event: PublicEventRow | null;
  sessions?: Session[] | null;
  signups?: SignupRow[] | null;
  items?: CampaignItemWithSignups[] | null;
  item_signups?: ItemSignupRow[] | null;
}

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;

/** Just the client surface used here, so tests can pass a small fake. */
export interface PublicEventClient {
  rpc(fn: string, args: Record<string, unknown>): QueryResult;
  from(table: string): any;
}

export function resolveEventType(t: string | null | undefined): PublicEventType {
  return t === "items" ? "items" : t === "rsvp" ? "rsvp" : "spots";
}

/** Merge parent rows with public signup rows (pure; shared by both paths). */
export function buildPublicEventPage(payload: PublicEventPagePayload): PublicEventPageData | null {
  const event = payload.event;
  if (!event) return null;
  const eventType = resolveEventType(event.event_type);

  if (eventType === "items") {
    const byItemId = new Map<string, CampaignItemWithSignups["item_signups"]>();
    const customSignups: PublicCustomSignup[] = [];
    for (const r of payload.item_signups ?? []) {
      if (r.item_id == null) {
        customSignups.push({
          id: r.id,
          member_name: r.member_name,
          custom_label: r.custom_label,
          signup_note: r.signup_note,
          quantity: r.quantity,
        });
        continue;
      }
      const list = byItemId.get(r.item_id) ?? [];
      list.push({
        id: r.id,
        member_name: r.member_name,
        signup_note: r.signup_note,
        quantity: r.quantity,
      } as never);
      byItemId.set(r.item_id, list);
    }
    const items = (payload.items ?? []).map((item) => ({
      ...item,
      item_signups: byItemId.get(item.id) ?? [],
    }));
    return { event, eventType, sessions: [], items, customSignups };
  }

  const bySessionId = new Map<string, NonNullable<SessionWithSignups["signups"]>>();
  for (const r of payload.signups ?? []) {
    const list = bySessionId.get(r.session_id) ?? [];
    list.push({
      id: r.id,
      member_name: r.member_name,
      signup_note: r.signup_note,
      guest_names: r.guest_names ?? [],
    });
    bySessionId.set(r.session_id, list);
  }
  const sessions = (payload.sessions ?? []).map((session) => ({
    ...session,
    signups: bySessionId.get(session.id) ?? [],
  })) as SessionWithSignups[];
  return { event, eventType, sessions, items: [], customSignups: [] };
}

async function loadLegacy(client: PublicEventClient, eventId: string): Promise<PublicEventPageData | null> {
  const { data: pubRows, error: eventError } = await client.rpc("get_public_campaign", { campaign_id: eventId });
  if (eventError) throw eventError;
  const rows = Array.isArray(pubRows) ? pubRows : pubRows ? [pubRows] : [];
  const event = (rows[0] as PublicEventRow | undefined) ?? null;
  if (!event) return null;

  if (resolveEventType(event.event_type) === "items") {
    const [{ data: items, error: itemsError }, { data: itemSignups, error: itemSignupsError }] = await Promise.all([
      client.from("campaign_items").select("*").eq("campaign_id", eventId).order("sort_order").order("created_at"),
      client
        .from("item_signups_public")
        .select("id, item_id, member_name, custom_label, signup_note, quantity")
        .eq("campaign_id", eventId)
        .order("signed_up_at"),
    ]);
    if (itemsError) throw itemsError;
    if (itemSignupsError) throw itemSignupsError;
    return buildPublicEventPage({ event, items, item_signups: itemSignups });
  }

  // Select * (not an explicit list) so sort_order is included when present.
  const [{ data: sessions, error: sessionsError }, { data: signups, error: signupsError }] = await Promise.all([
    client
      .from("sessions")
      .select("*")
      .eq("campaign_id", eventId)
      .order("session_date", { nullsFirst: false })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
    client.from("signups_public").select("id, session_id, member_name, signup_note, guest_names").eq("campaign_id", eventId),
  ]);
  if (sessionsError) throw sessionsError;
  if (signupsError) throw signupsError;
  return buildPublicEventPage({ event, sessions, signups });
}

// Set when PostgREST says the RPC does not exist, so a not yet migrated
// database costs one extra request now and then, not one per load. Expires
// so a long lived server instance picks the RPC up once it is applied.
const RPC_MISSING_RETRY_MS = 5 * 60 * 1000;
let rpcMissingUntil = 0;

function isMissingFunction(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === "PGRST202" || code === "42883";
}

/** Test hook: forget a remembered missing RPC. */
export function resetPublicEventPageRpcCache(): void {
  rpcMissingUntil = 0;
}

/** Load the public event page. Returns null when the event does not exist; throws on load failure. */
export async function loadPublicEventPage(
  client: PublicEventClient,
  eventId: string
): Promise<PublicEventPageData | null> {
  if (Date.now() >= rpcMissingUntil) {
    const { data, error } = await client.rpc("get_public_event_page", { campaign_id: eventId });
    if (!error) {
      if (data == null) return null;
      return buildPublicEventPage(data as PublicEventPagePayload);
    }
    if (isMissingFunction(error)) rpcMissingUntil = Date.now() + RPC_MISSING_RETRY_MS;
  }
  // Missing function (not migrated yet) or any RPC failure: use the old path.
  return loadLegacy(client, eventId);
}
