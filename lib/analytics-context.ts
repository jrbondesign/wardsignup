/**
 * Ward-level context for PostHog events. Never throws: analytics enrichment
 * must not fail or slow a signup beyond a couple of indexed lookups.
 */

import { isTestOrgId, isTestOwnerEmail } from "@/lib/test-orgs";

type QueryResult = PromiseLike<{ data: unknown; error: unknown }>;
type MinimalAdmin = {
  from: (table: string) => {
    select: (cols: string) => {
      eq: (col: string, val: string) => {
        maybeSingle: () => QueryResult;
      };
    };
  };
  auth?: {
    admin?: {
      getUserById: (id: string) => PromiseLike<{ data: { user?: { email?: string | null } | null } | null; error: unknown }>;
    };
  };
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AnalyticsContext {
  /** Ward (organization) id, or null when unknown. */
  orgId: string | null;
  /** True for a test ward, false for a real one, null when the lookup failed. */
  isTestOrg: boolean | null;
}

const UNKNOWN: AnalyticsContext = { orgId: null, isTestOrg: null };

/** Owner email for a user id; undefined means the lookup itself failed. */
async function emailForUser(admin: MinimalAdmin, userId: string): Promise<string | null | undefined> {
  const getUserById = admin.auth?.admin?.getUserById;
  if (!getUserById) return undefined;
  try {
    const { data, error } = await getUserById.call(admin.auth!.admin, userId);
    if (error) return undefined;
    return data?.user?.email ?? null;
  } catch {
    return undefined;
  }
}

/**
 * org_id and is_test_org for a campaign. is_test_org is null whenever any
 * lookup needed to decide it fails (it is never guessed as false).
 */
export async function analyticsContextForCampaign(
  admin: unknown,
  campaignId: string | null | undefined,
): Promise<AnalyticsContext> {
  if (!admin || !campaignId) return UNKNOWN;
  const db = admin as MinimalAdmin;
  try {
    const { data, error } = await db
      .from("campaigns")
      .select("organization_id, user_email, created_by")
      .eq("id", campaignId)
      .maybeSingle();
    if (error || !data) return UNKNOWN;
    const row = data as { organization_id?: unknown; user_email?: unknown; created_by?: unknown };
    const orgId = typeof row.organization_id === "string" && UUID_RE.test(row.organization_id) ? row.organization_id : null;

    if (isTestOrgId(orgId)) return { orgId, isTestOrg: true };
    if (isTestOwnerEmail(typeof row.user_email === "string" ? row.user_email : null)) return { orgId, isTestOrg: true };

    const userIds: string[] = [];
    if (typeof row.created_by === "string") userIds.push(row.created_by);
    if (orgId) {
      const org = await db.from("organizations").select("created_by").eq("id", orgId).maybeSingle();
      if (org.error) return { orgId, isTestOrg: null };
      const owner = (org.data as { created_by?: unknown } | null)?.created_by;
      if (typeof owner === "string" && !userIds.includes(owner)) userIds.push(owner);
    }

    let failed = false;
    for (const id of userIds) {
      const email = await emailForUser(db, id);
      if (email === undefined) failed = true;
      else if (isTestOwnerEmail(email)) return { orgId, isTestOrg: true };
    }
    return { orgId, isTestOrg: failed ? null : false };
  } catch {
    return UNKNOWN;
  }
}

/** The campaign's organization (ward) id, or null when unknown or on any error. */
export async function orgIdForCampaign(
  admin: unknown,
  campaignId: string | null | undefined,
): Promise<string | null> {
  if (!admin || !campaignId) return null;
  try {
    const { data, error } = await (admin as MinimalAdmin)
      .from("campaigns")
      .select("organization_id")
      .eq("id", campaignId)
      .maybeSingle();
    if (error || !data) return null;
    const orgId = (data as { organization_id?: unknown }).organization_id;
    return typeof orgId === "string" && UUID_RE.test(orgId) ? orgId : null;
  } catch {
    return null;
  }
}
