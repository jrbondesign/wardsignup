import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getCurrentOrganization, type CurrentOrg } from "@/lib/organizations";

/**
 * Dashboard data: the active org and its event cards (counts, not signup rows).
 *
 * Fast path: one get_dashboard_events RPC, which can start before getUser()
 * returns because PostgREST verifies the JWT itself and the RPC runs under the
 * caller's RLS. Fallback (RPC missing or failing): the old reads, which need
 * the verified user: getCurrentOrganization, then campaigns with nested ids.
 */

export interface DashboardOrg {
  id: string;
  name: string;
  needs_naming: boolean;
  brand_id?: string;
}

export interface DashboardEvent {
  id: string;
  name: string;
  created_at: string;
  event_type: string | null;
  event_date: string | null;
  event_dates: unknown;
  session_dates: string[];
  total_capacity: number;
  total_signups: number;
  item_count: number;
  item_signups: number;
  unclaimed_items: number;
}

export interface DashboardData {
  org: DashboardOrg | null;
  events: DashboardEvent[];
}

export interface DashboardCardStats {
  isItems: boolean;
  totalCapacity: number;
  totalSignups: number;
  remaining: number;
  fillPct: number;
}

/** Card numbers, same rules the dashboard used on the nested rows. */
export function dashboardCardStats(e: DashboardEvent): DashboardCardStats {
  const isItems = e.event_type === "items";
  const totalCapacity = isItems ? e.item_count : e.total_capacity;
  const totalSignups = isItems ? e.item_signups : e.total_signups;
  const remaining = isItems ? e.unclaimed_items : totalCapacity - totalSignups;
  const fillPct = totalCapacity > 0 ? Math.round((totalSignups / totalCapacity) * 100) : 0;
  return { isItems, totalCapacity, totalSignups, remaining, fillPct };
}

interface NestedCampaign {
  id: string;
  name: string;
  created_at: string;
  event_type?: string | null;
  event_date?: string | null;
  event_dates?: unknown;
  sessions?: { id: string; capacity: number | null; session_date: string | null; signups?: { id: string }[] | null }[] | null;
  campaign_items?: { id: string; item_signups?: { id: string }[] | null }[] | null;
}

/** Turn one nested campaigns row (old query shape) into a card row. */
export function summarizeNestedCampaign(c: NestedCampaign): DashboardEvent {
  const sessions = c.sessions ?? [];
  const items = c.campaign_items ?? [];
  return {
    id: c.id,
    name: c.name,
    created_at: c.created_at,
    event_type: c.event_type ?? null,
    event_date: c.event_date ?? null,
    event_dates: c.event_dates ?? null,
    session_dates: sessions.map((s) => s.session_date).filter((d): d is string => Boolean(d)).sort(),
    total_capacity: sessions.reduce((sum, s) => sum + (s.capacity || 0), 0),
    total_signups: sessions.reduce((sum, s) => sum + (s.signups?.length || 0), 0),
    item_count: items.length,
    item_signups: items.reduce((sum, it) => sum + (it.item_signups?.length || 0), 0),
    unclaimed_items: items.filter((it) => (it.item_signups?.length ?? 0) === 0).length,
  };
}

function toNumber(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Normalize the RPC payload (bigint counts can arrive as numbers or strings). */
export function normalizeDashboardPayload(raw: unknown): DashboardData | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { org?: DashboardOrg | null; events?: Record<string, unknown>[] | null };
  const events = (r.events ?? []).map((e) => ({
    id: String(e.id),
    name: String(e.name ?? ""),
    created_at: String(e.created_at ?? ""),
    event_type: (e.event_type as string | null) ?? null,
    event_date: (e.event_date as string | null) ?? null,
    event_dates: e.event_dates ?? null,
    session_dates: Array.isArray(e.session_dates) ? (e.session_dates as string[]) : [],
    total_capacity: toNumber(e.total_capacity),
    total_signups: toNumber(e.total_signups),
    item_count: toNumber(e.item_count),
    item_signups: toNumber(e.item_signups),
    unclaimed_items: toNumber(e.unclaimed_items),
  }));
  return { org: r.org ?? null, events };
}

/**
 * Start the one call RPC. Resolves to null (never throws) when it is missing,
 * errors, or has no signed in user, so the caller can fall back.
 */
export async function loadDashboardViaRpc(supabase: SupabaseClient, brandId: string): Promise<DashboardData | null> {
  try {
    const { data, error } = await supabase.rpc("get_dashboard_events", { p_brand_id: brandId } as never);
    if (error) return null;
    return normalizeDashboardPayload(data);
  } catch {
    return null;
  }
}

/** Old path. Needs the verified user. Throws when the campaigns read fails. */
export async function loadDashboardLegacy(
  supabase: SupabaseClient,
  user: Pick<User, "id">,
  brandId: string
): Promise<DashboardData> {
  const org: CurrentOrg | null = await getCurrentOrganization(supabase, user, brandId);
  let q = supabase
    .from("campaigns")
    .select(`
      *,
      sessions (
        id,
        capacity,
        session_date,
        signups (id)
      ),
      campaign_items (
        id,
        item_signups (id)
      )
    `)
    .eq("brand_id", brandId)
    .order("created_at", { ascending: false });
  if (org) q = q.eq("organization_id", org.id);
  const { data, error } = await q;
  if (error) throw error;
  return {
    org: (org as DashboardOrg | null) ?? null,
    events: ((data ?? []) as NestedCampaign[]).map(summarizeNestedCampaign),
  };
}
