import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { posthogWeeklyEventCounts } from "@/lib/posthog-query";
import { isMetricsAdminEmail } from "@/lib/metrics-admin";
import { posthogCoreWeekly } from "@/lib/posthog-query";
import { founderNotifySkipEmails } from "@/lib/founder-notify";
import {
  computeEmailCaptureRate,
  emailCaptureWindowStart,
  type CaptureSignupRow,
} from "@/lib/email-capture-rate";
import { isTeamEmail, teamSheetIds } from "@/lib/team-accounts";
import {
  addMonths,
  addWeeks,
  phoenixMonthKey,
  phoenixWeekKey,
  formatWeekRange,
  phoenixWeekKeyToUtc,
} from "@/lib/metrics-weeks";
import { buildCoreWeekly, lastWeekKeys } from "@/lib/core-metrics";
import { fetchAllRows } from "@/lib/supabase-paging";
import { computeWardFirstEvents, type OrgWithAttribution, type WardCampaign } from "@/lib/new-wards";

/** Every week on the founder metrics page is Monday to Sunday in Phoenix time. */
const toWeekKey = phoenixWeekKey;

/** Weeks charted in the core strip trend charts (this week included). */
const CORE_TREND_WEEKS = 12;

const MS_DAY = 24 * 60 * 60 * 1000;

/**
 * When a creator actually joined: first confirmed sign-in, not auth row creation.
 * Magic-link requests create the auth row immediately, so an account requested weeks
 * ago and first clicked today must count today (matches the founder notify email).
 */
function joinedAt(u: User): string {
  return u.email_confirmed_at ?? u.confirmed_at ?? u.created_at;
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

type RecentSignupJoined = {
  member_name: string;
  signed_up_at: string;
  campaigns: { name: string } | { name: string }[] | null;
};

type SlimCampaign = {
  id: string;
  created_at: string;
  created_by: string | null;
  user_email: string | null;
};

type CreatorBreakdownRow = {
  organizer_email: string;
  event_count: number | string;
  session_count: number | string;
  signup_count: number | string;
};

/** Paginate through all auth users (Supabase default page size is 1000). */
async function listAllAuthUsers(
  admin: SupabaseClient,
): Promise<{ users: User[]; complete: boolean }> {
  const all: User[] = [];
  let page = 1;
  const perPage = 1000;
  const maxPages = 100;
  let complete = true;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const batch = data.users ?? [];
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
    if (page > maxPages) {
      console.warn(
        `metrics: listUsers stopped at ${maxPages * perPage} accounts (safety cap)`,
      );
      complete = false;
      break;
    }
  }
  return { users: all, complete };
}

function num(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return Number(v) || 0;
  return 0;
}

export const maxDuration = 60;

const VALID_BRANDS = new Set(["wardsignup"]);

export async function GET(request: NextRequest) {
  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const anonClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${token}` } } },
  );
  const {
    data: { user },
    error: authError,
  } = await anonClient.auth.getUser();
  if (authError || !user || !isMetricsAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Service role key not configured" },
      { status: 500 },
    );
  }

  const brandParam = request.nextUrl.searchParams.get("brand");
  const brandFilter: string | null =
    brandParam && VALID_BRANDS.has(brandParam) ? brandParam : null;

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  // History runs from launch (week of the first event ever created) to the current week.
  const { data: firstCampaign } = await admin
    .from("campaigns")
    .select("created_at")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const launchIso =
    (firstCampaign as { created_at: string } | null)?.created_at ?? new Date().toISOString();
  const weeks: string[] = [];
  const currentWeek = toWeekKey(new Date().toISOString());
  for (let w = toWeekKey(launchIso); w <= currentWeek; w = addWeeks(w, 1)) {
    weeks.push(w);
  }
  const oldestWeekStart = weeks[0]!;
  const oldestIso = phoenixWeekKeyToUtc(oldestWeekStart).toISOString();

  // When filtering by brand, fetch campaign IDs first so we can filter dependent tables.
  let brandCampaignIds: string[] | null = null;
  let brandUserIds: string[] | null = null;
  if (brandFilter) {
    const [brandCampaigns, brandProfiles] = await Promise.all([
      fetchAllRows<{ id: string }>(
        () => admin.from("campaigns").select("id").eq("brand_id", brandFilter),
        { label: "brand campaigns" },
      ),
      fetchAllRows<{ user_id: string }>(
        () => admin.from("organizer_profiles").select("user_id").eq("brand_id", brandFilter),
        { label: "brand organizer_profiles", orderBy: ["user_id"] },
      ),
    ]);
    brandCampaignIds = brandCampaigns.map((r) => r.id);
    brandUserIds = brandProfiles.map((r) => r.user_id);
  } else {
    // For the "all" tab, scope users to those with any organizer_profile — same methodology
    // as brand tabs — so the numbers are additive rather than inflated by bare auth accounts
    // that have no brand affiliation yet.
    const allProfiles = await fetchAllRows<{ user_id: string }>(
      () => admin.from("organizer_profiles").select("user_id"),
      { label: "organizer_profiles", orderBy: ["user_id"] },
    );
    const profileUserIdSet = new Set(allProfiles.map((r) => r.user_id));
    // Keep brandUserIds as a de-duped array of all profiled user IDs
    brandUserIds = [...profileUserIdSet];
  }

  // Creators = organization owners. Co-admins (invited into someone else's org) and
  // signed-in users who never set up an org are reported separately, not as creators.
  const memberRows = await fetchAllRows<unknown>(
    () =>
      admin
        .from("organization_members")
        .select("user_id, role, status, organizations!inner(brand_id)")
        .eq("status", "accepted"),
    { label: "organization_members" },
  );
  const ownerIds = new Set<string>();
  const memberIds = new Set<string>();
  for (const r of memberRows as {
    user_id: string;
    role: string;
    organizations: { brand_id: string } | { brand_id: string }[];
  }[]) {
    const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
    if (brandFilter && org?.brand_id !== brandFilter) continue;
    memberIds.add(r.user_id);
    if (r.role === "owner") ownerIds.add(r.user_id);
  }
  const profiledUserIds = brandUserIds!;
  const coAdminOnlyIds = new Set(
    profiledUserIds.filter((id) => memberIds.has(id) && !ownerIds.has(id)),
  );
  const noOrgIds = new Set(profiledUserIds.filter((id) => !memberIds.has(id)));
  brandUserIds = profiledUserIds.filter((id) => ownerIds.has(id));

  const [
    { count: totalEvents },
    { count: totalSessions },
    { count: totalSignups },
    { count: totalInvites },
    { data: capRaw, error: capErr },
    { data: creatorRpc, error: creatorErr },
    growthCampaigns,
    growthSignups,
    { data: recentSignupsRaw },
    listUsersResult,
    { count: signupsWithEmail },
    { count: signupsWithPhone },
    inviteEmailsRaw,
    signupEmailsRaw,
    campaignsSlim,
    sessionCampaignRows,
    signupCampaignRows,
    inviteInviterRows,
  ] = await Promise.all([
    brandCampaignIds !== null
      ? admin.from("campaigns").select("id", { count: "exact", head: true }).in("id", brandCampaignIds)
      : admin.from("campaigns").select("id", { count: "exact", head: true }),
    brandCampaignIds !== null
      ? admin.from("sessions").select("id", { count: "exact", head: true }).in("campaign_id", brandCampaignIds)
      : admin.from("sessions").select("id", { count: "exact", head: true }),
    brandCampaignIds !== null
      ? admin.from("signups").select("id", { count: "exact", head: true }).in("campaign_id", brandCampaignIds)
      : admin.from("signups").select("id", { count: "exact", head: true }),
    brandCampaignIds !== null
      ? admin.from("event_invites").select("id", { count: "exact", head: true }).in("campaign_id", brandCampaignIds)
      : admin.from("event_invites").select("id", { count: "exact", head: true }),
    admin.rpc("metrics_total_capacity", { p_brand_id: brandFilter }),
    admin.rpc("metrics_creator_breakdown", { p_brand_id: brandFilter }),
    fetchAllRows<{ created_at: string }>(
      () => {
        const q = admin.from("campaigns").select("created_at").gte("created_at", oldestIso);
        return brandCampaignIds !== null ? q.in("id", brandCampaignIds) : q;
      },
      { label: "growth campaigns" },
    ),
    fetchAllRows<{ signed_up_at: string }>(
      () => {
        const q = admin.from("signups").select("signed_up_at").gte("signed_up_at", oldestIso);
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "growth signups" },
    ),
    brandCampaignIds !== null
      ? admin.from("signups").select("member_name, signed_up_at, campaigns(name)").in("campaign_id", brandCampaignIds).order("signed_up_at", { ascending: false }).limit(10)
      : admin.from("signups").select("member_name, signed_up_at, campaigns(name)").order("signed_up_at", { ascending: false }).limit(10),
    listAllAuthUsers(admin),
    brandCampaignIds !== null
      ? admin.from("signups").select("id", { count: "exact", head: true }).in("campaign_id", brandCampaignIds).not("member_email", "is", null)
      : admin.from("signups").select("id", { count: "exact", head: true }).not("member_email", "is", null),
    brandCampaignIds !== null
      ? admin.from("signups").select("id", { count: "exact", head: true }).in("campaign_id", brandCampaignIds).not("member_phone", "is", null)
      : admin.from("signups").select("id", { count: "exact", head: true }).not("member_phone", "is", null),
    fetchAllRows<{ invitee_email: string }>(
      () => {
        const q = admin.from("event_invites").select("invitee_email");
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "event_invites.invitee_email" },
    ),
    fetchAllRows<{ member_email: string }>(
      () => {
        const q = admin.from("signups").select("member_email").not("member_email", "is", null);
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "signups.member_email" },
    ),
    fetchAllRows<SlimCampaign & { organization_id: string | null }>(
      () => {
        const q = admin.from("campaigns").select("id, created_at, created_by, user_email, organization_id");
        return brandCampaignIds !== null ? q.in("id", brandCampaignIds) : q;
      },
      { label: "campaigns slim" },
    ),
    fetchAllRows<{ campaign_id: string }>(
      () => {
        const q = admin.from("sessions").select("campaign_id");
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "sessions.campaign_id" },
    ),
    fetchAllRows<{ campaign_id: string }>(
      () => {
        const q = admin.from("signups").select("campaign_id");
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "signups.campaign_id" },
    ),
    fetchAllRows<{ inviter_id: string }>(
      () => {
        const q = admin.from("event_invites").select("inviter_id");
        return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
      },
      { label: "event_invites.inviter_id" },
    ),
  ]);

  if (capErr) {
    console.error("metrics_total_capacity:", capErr);
    return NextResponse.json(
      { error: "Metrics RPC failed (apply migrations?)" },
      { status: 500 },
    );
  }
  if (creatorErr) {
    console.error("metrics_creator_breakdown:", creatorErr);
    return NextResponse.json(
      { error: "Metrics RPC failed (apply migrations?)" },
      { status: 500 },
    );
  }

  const { users: allAuthUsers, complete: authUsersFetchComplete } = listUsersResult;
  const brandUserIdSet = new Set(brandUserIds!);
  const authUserList = allAuthUsers.filter((u) => brandUserIdSet.has(u.id));

  const totalCapacity = num(capRaw);

  const campaignWeekMap: Record<string, number> = {};
  for (const row of growthCampaigns) {
    const w = toWeekKey(row.created_at);
    campaignWeekMap[w] = (campaignWeekMap[w] ?? 0) + 1;
  }
  const signupWeekMap: Record<string, number> = {};
  for (const row of growthSignups) {
    const w = toWeekKey(row.signed_up_at);
    signupWeekMap[w] = (signupWeekMap[w] ?? 0) + 1;
  }

  // Events created / member signups come from PostHog server-side events: the DB only
  // holds rows that still exist, so deleted events and cancelled signups vanish from
  // their week. Falls back to DB counts when PostHog isn't reachable.
  const phCounts = await posthogWeeklyEventCounts(
    ["event_created", "signup_batch_created"],
    oldestIso,
  );
  const growthCountsSource: "posthog" | "database" = phCounts ? "posthog" : "database";
  if (phCounts) {
    for (const k of Object.keys(campaignWeekMap)) delete campaignWeekMap[k];
    for (const k of Object.keys(signupWeekMap)) delete signupWeekMap[k];
    Object.assign(campaignWeekMap, phCounts["event_created"] ?? {});
    Object.assign(signupWeekMap, phCounts["signup_batch_created"] ?? {});
  }

  // Creator = org owner who has created at least one event (others can sign up).
  // Counted in the week of their first event. Owners with no event yet are
  // "lookie-loos" and reported separately.
  const firstEventAt = new Map<string, string>();
  for (const row of campaignsSlim) {
    if (!row.created_by) continue;
    const prev = firstEventAt.get(row.created_by);
    if (!prev || row.created_at < prev) firstEventAt.set(row.created_by, row.created_at);
  }
  const skipEmails = founderNotifySkipEmails();
  const activatedCreators = authUserList.filter(
    (u) => firstEventAt.has(u.id) && !isTeamEmail(u.email, skipEmails),
  );
  const ownerNoEventIds = new Set(
    authUserList.filter((u) => !firstEventAt.has(u.id)).map((u) => u.id),
  );
  const accountWeekMap: Record<string, number> = {};
  for (const u of activatedCreators) {
    const w = toWeekKey(firstEventAt.get(u.id)!);
    accountWeekMap[w] = (accountWeekMap[w] ?? 0) + 1;
  }

  const growth = weeks.map((w) => ({
    week: w,
    newEvents: campaignWeekMap[w] ?? 0,
    newSignups: signupWeekMap[w] ?? 0,
    newCreatorAccounts: accountWeekMap[w] ?? 0,
  }));

  const creatorRowsTyped = (creatorRpc ?? []) as CreatorBreakdownRow[];
  const creators = creatorRowsTyped.map((r: CreatorBreakdownRow) => ({
    email: r.organizer_email,
    events: num(r.event_count),
    sessions: num(r.session_count),
    signups: num(r.signup_count),
  }));

  const recentSignups = (recentSignupsRaw ?? ([] as RecentSignupJoined[])).map((s) => {
    const c = s.campaigns;
    const eventName = Array.isArray(c) ? c[0]?.name : c?.name;
    return {
      member_name: s.member_name,
      event_name: eventName ?? "—",
      signed_up_at: s.signed_up_at,
    };
  });

  const now = Date.now();
  const oneDayAgoIso = new Date(now - MS_DAY).toISOString();
  const sevenDaysAgo = new Date(now - 7 * MS_DAY).toISOString();
  const thirtyDaysAgo = new Date(now - 30 * MS_DAY).toISOString();
  const totalUsers = authUserList.length;
  const newUsersThisWeek = authUserList.filter((u) => joinedAt(u) >= sevenDaysAgo).length;
  const activeUsersThisWeek = authUserList.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= sevenDaysAgo,
  ).length;
  const activeUsersLast1Day = authUserList.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= oneDayAgoIso,
  ).length;
  const activeUsersLast7Days = activeUsersThisWeek;
  const activeUsersLast30Days = authUserList.filter(
    (u) => u.last_sign_in_at && u.last_sign_in_at >= thirtyDaysAgo,
  ).length;

  const loginRecencyBuckets = {
    within1Day: 0,
    day2to7: 0,
    day8to30: 0,
    olderThan30d: 0,
    neverLoggedIn: 0,
  };
  const idleDaysSinceLogin: number[] = [];
  for (const u of authUserList) {
    if (!u.last_sign_in_at) {
      loginRecencyBuckets.neverLoggedIn += 1;
      continue;
    }
    const last = new Date(u.last_sign_in_at).getTime();
    const ageDays = (now - last) / MS_DAY;
    idleDaysSinceLogin.push(ageDays);
    if (last >= now - MS_DAY) loginRecencyBuckets.within1Day += 1;
    else if (last >= now - 7 * MS_DAY) loginRecencyBuckets.day2to7 += 1;
    else if (last >= now - 30 * MS_DAY) loginRecencyBuckets.day8to30 += 1;
    else loginRecencyBuckets.olderThan30d += 1;
  }

  const providers = authUserList.reduce((acc: Record<string, number>, u) => {
    const p = u.app_metadata?.provider === "google" ? "google" : "email";
    acc[p] = (acc[p] ?? 0) + 1;
    return acc;
  }, {});

  const weeklyMemberSignups = growth[growth.length - 1]?.newSignups ?? 0;

  const campaignsByCreatorId = new Map<string, Set<string>>();
  const campaignsByOwnerEmail = new Map<string, Set<string>>();
  for (const row of campaignsSlim) {
    if (row.created_by) {
      let s = campaignsByCreatorId.get(row.created_by);
      if (!s) {
        s = new Set();
        campaignsByCreatorId.set(row.created_by, s);
      }
      s.add(row.id);
    }
    const em = row.user_email?.trim().toLowerCase();
    if (em) {
      let s = campaignsByOwnerEmail.get(em);
      if (!s) {
        s = new Set();
        campaignsByOwnerEmail.set(em, s);
      }
      s.add(row.id);
    }
  }

  const sessionCampaignIds = new Set(
    sessionCampaignRows.map((r) => r.campaign_id).filter(Boolean),
  );
  const signupCampaignIds = new Set(
    signupCampaignRows.map((r) => r.campaign_id).filter(Boolean),
  );

  function campaignIdsForUser(u: User): Set<string> {
    const ids = new Set<string>();
    const byId = campaignsByCreatorId.get(u.id);
    if (byId) for (const id of byId) ids.add(id);
    const email = u.email?.toLowerCase();
    if (email) {
      const byE = campaignsByOwnerEmail.get(email);
      if (byE) for (const id of byE) ids.add(id);
    }
    return ids;
  }

  function hasSessionForCampaigns(ids: Set<string>): boolean {
    for (const id of ids) {
      if (sessionCampaignIds.has(id)) return true;
    }
    return false;
  }

  function hasSignupForCampaigns(ids: Set<string>): boolean {
    for (const id of ids) {
      if (signupCampaignIds.has(id)) return true;
    }
    return false;
  }

  let staleAccountsCount = 0;
  for (const u of authUserList) {
    if (campaignIdsForUser(u).size === 0) staleAccountsCount += 1;
  }

  const inviteEmailSet = new Set(
    inviteEmailsRaw.map((r) => r.invitee_email.toLowerCase()),
  );
  const signupEmailSet = new Set(
    signupEmailsRaw.map((r) => r.member_email.toLowerCase()),
  );
  const invitesConverted = [...inviteEmailSet].filter((e) => signupEmailSet.has(e)).length;

  const inviterIds = new Set(
    inviteInviterRows.map((r) => r.inviter_id).filter(Boolean),
  );

  const newUsersWeek = authUserList.filter((u) => joinedAt(u) >= sevenDaysAgo);
  const newAccountsByProviderThisWeek = {
    google: newUsersWeek.filter((u) => u.app_metadata?.provider === "google").length,
    email: newUsersWeek.filter((u) => u.app_metadata?.provider !== "google").length,
    total: newUsersWeek.length,
  };

  let usersWithEvent = 0;
  let usersWithSession = 0;
  let usersWithInAppInvite = 0;
  let usersWithMemberSignup = 0;

  const cohort7d = {
    newUsers: 0,
    withEvent: 0,
    withSession: 0,
    withInAppInvite: 0,
    withMemberSignup: 0,
  };
  const cohort30d = {
    newUsers: 0,
    withEvent: 0,
    withSession: 0,
    withInAppInvite: 0,
    withMemberSignup: 0,
  };

  for (const u of authUserList) {
    const cids = campaignIdsForUser(u);
    const hasEvent = cids.size > 0;
    const hasSession = hasSessionForCampaigns(cids);
    const hasMemberSignup = hasSignupForCampaigns(cids);
    const hasInAppInvite = inviterIds.has(u.id);

    if (hasEvent) usersWithEvent += 1;
    if (hasSession) usersWithSession += 1;
    if (hasInAppInvite) usersWithInAppInvite += 1;
    if (hasMemberSignup) usersWithMemberSignup += 1;

    if (joinedAt(u) >= sevenDaysAgo) {
      cohort7d.newUsers += 1;
      if (hasEvent) cohort7d.withEvent += 1;
      if (hasSession) cohort7d.withSession += 1;
      if (hasInAppInvite) cohort7d.withInAppInvite += 1;
      if (hasMemberSignup) cohort7d.withMemberSignup += 1;
    }
    if (joinedAt(u) >= thirtyDaysAgo) {
      cohort30d.newUsers += 1;
      if (hasEvent) cohort30d.withEvent += 1;
      if (hasSession) cohort30d.withSession += 1;
      if (hasInAppInvite) cohort30d.withInAppInvite += 1;
      if (hasMemberSignup) cohort30d.withMemberSignup += 1;
    }
  }

  const share = (nume: number, den: number) => (den ? nume / den : 0);

  const newCreatorsThisCalendarWeek = growth[growth.length - 1]?.newCreatorAccounts ?? 0;
  const newCreatorsLastCompletedWeek =
    growth.length >= 2 ? growth[growth.length - 2]!.newCreatorAccounts : 0;
  const priorWeekCreators =
    growth.length >= 3 ? growth[growth.length - 3]!.newCreatorAccounts : 0;
  const wowNewCreatorsLastCompletedWeekPct =
    priorWeekCreators === 0
      ? null
      : ((newCreatorsLastCompletedWeek - priorWeekCreators) / priorWeekCreators) * 100;

  const last4Weeks = growth.slice(-4);
  const fourWeekAvgNewCreators =
    last4Weeks.length === 0
      ? 0
      : last4Weeks.reduce((s, x) => s + x.newCreatorAccounts, 0) / last4Weeks.length;

  const currentWeekKey = weeks[weeks.length - 1]!;
  const profiledById = new Map(allAuthUsers.map((u) => [u.id, u]));
  const countSet = (ids: Set<string>) => {
    let total = 0;
    let thisWeek = 0;
    for (const id of ids) {
      const u = profiledById.get(id);
      if (!u) continue;
      total += 1;
      if (toWeekKey(joinedAt(u)) === currentWeekKey) thisWeek += 1;
    }
    return { total, thisWeek };
  };
  const nonCreatorAccounts = {
    ownersNoEvent: countSet(ownerNoEventIds),
    coAdmins: countSet(coAdminOnlyIds),
    noOrgYet: countSet(noOrgIds),
  };
  const thisCalendarWeekUsers = authUserList.filter(
    (u) => toWeekKey(joinedAt(u)) === currentWeekKey,
  );
  const newAccountsByProviderThisCalendarWeek = {
    google: thisCalendarWeekUsers.filter((u) => u.app_metadata?.provider === "google")
      .length,
    email: thisCalendarWeekUsers.filter((u) => u.app_metadata?.provider !== "google")
      .length,
    total: thisCalendarWeekUsers.length,
  };

  // Calculate New Wards metric (wards = organizations with first published event)
  // A ward's first published event is the earliest campaign with at least one session.
  // Every query here is paged: there are well over 1,000 sessions, and an unpaged
  // select stops at row 1,000 (which once showed 16 total wards instead of 50).
  const [orgsWithCampaigns, campaignsWithSessions, allSessionCampaignRows] = await Promise.all([
    fetchAllRows<OrgWithAttribution>(
      () =>
        admin
          .from("organizations")
          .select("id, first_touch_utm_source, first_touch_utm_medium, first_touch_utm_campaign, first_touch_ref, created_by, owner_id"),
      { label: "organizations" },
    ),
    fetchAllRows<WardCampaign>(
      () =>
        admin
          .from("campaigns")
          .select("id, organization_id, created_at")
          .not("organization_id", "is", null),
      { label: "ward campaigns" },
    ),
    // The "all" tab already loaded every session's campaign_id above; reuse it.
    brandCampaignIds === null
      ? Promise.resolve(sessionCampaignRows)
      : fetchAllRows<{ campaign_id: string }>(
          () => admin.from("sessions").select("campaign_id"),
          { label: "ward sessions.campaign_id" },
        ),
  ]);

  const campaignsWithSessionsSet = new Set(allSessionCampaignRows.map((s) => s.campaign_id));

  // Team / test sheets: classified by the ward's CURRENT owner (falls back to the
  // creator for sheets with no ward). One rule for New wards, email capture and the strip.
  const emailByUserId = new Map(allAuthUsers.map((u) => [u.id, u.email ?? null]));
  const wardOwnerById = new Map(
    orgsWithCampaigns.map((o) => [o.id, o.owner_id ?? o.created_by ?? null]),
  );
  const teamSheets = teamSheetIds({
    sheets: campaignsSlim,
    wardOwnerById,
    emailByUserId,
    isTeam: (e) => isTeamEmail(e, skipEmails),
  });

  const orgFirstEventMap = computeWardFirstEvents({
    orgs: orgsWithCampaigns,
    campaigns: campaignsWithSessions,
    campaignsWithSessions: campaignsWithSessionsSet,
    teamSheets,
  });

  // Phoenix calendar months (YYYY-MM).
  const toMonthKey = phoenixMonthKey;

  const nowDate = new Date();
  const currentMonth = toMonthKey(nowDate);
  const lastMonth = addMonths(currentMonth, -1);

  const monthlyWardsMap = new Map<string, { count: number; bySource: Map<string, number> }>();

  for (const { date, orgData } of orgFirstEventMap.values()) {
    const month = toMonthKey(date);
    
    if (!monthlyWardsMap.has(month)) {
      monthlyWardsMap.set(month, { count: 0, bySource: new Map() });
    }
    
    const monthData = monthlyWardsMap.get(month)!;
    monthData.count += 1;

    const source = orgData.first_touch_utm_source ||
      orgData.first_touch_ref ||
      (orgData.first_touch_utm_medium ? `${orgData.first_touch_utm_medium}` : null) ||
      "Unknown";
    
    monthData.bySource.set(source, (monthData.bySource.get(source) || 0) + 1);
  }

  const months: string[] = [];
  for (let i = 11; i >= 0; i -= 1) months.push(addMonths(currentMonth, -i));

  const monthlyTrend = months.map((month) => {
    const data = monthlyWardsMap.get(month);
    const bySource: Record<string, number> = {};
    if (data) {
      for (const [src, cnt] of data.bySource.entries()) {
        bySource[src] = cnt;
      }
    }
    return {
      month,
      count: data?.count || 0,
      bySource,
    };
  });

  const thisMonthData = monthlyWardsMap.get(currentMonth);
  const lastMonthData = monthlyWardsMap.get(lastMonth);
  
  const thisMonthBySource: Record<string, number> = {};
  if (thisMonthData) {
    for (const [src, cnt] of thisMonthData.bySource.entries()) {
      thisMonthBySource[src] = cnt;
    }
  }

  // Total wards (all-time count of distinct orgs with at least one published sheet)
  const totalWards = orgFirstEventMap.size;

  // New wards this week (Phoenix Monday 00:00 to Sunday 23:59:59). Compare
  // week keys, not ISO strings: "…07:00:00+00:00" sorts before "…07:00:00.000Z".
  const nowWeekKey = toWeekKey(nowDate);
  let newWardsThisWeek = 0;
  for (const { date } of orgFirstEventMap.values()) {
    if (toWeekKey(date) === nowWeekKey) {
      newWardsThisWeek += 1;
    }
  }

  // Email capture rate (Phoenix Mon to Sun weeks): signups with a non empty
  // member_email / all signups. Paged so the 1000 row API cap never truncates it.
  // Fetch enough weeks for the core trend chart; the card below still shows 8 completed weeks.
  const captureWindowIso = emailCaptureWindowStart(nowDate, CORE_TREND_WEEKS - 1).toISOString();
  const captureRows = await fetchAllRows<CaptureSignupRow>(
    () => {
      const q = admin
        .from("signups")
        .select("signed_up_at, member_email, campaign_id")
        .gte("signed_up_at", captureWindowIso);
      return brandCampaignIds !== null ? q.in("campaign_id", brandCampaignIds) : q;
    },
    { label: "email capture signups", orderBy: ["signed_up_at", "id"] },
  );
  // Exclude team / test sheets the same way New wards does (ward's current owner).
  const emailCapture = computeEmailCaptureRate(captureRows, nowDate, 8, teamSheets);
  const captureTrend = computeEmailCaptureRate(captureRows, nowDate, CORE_TREND_WEEKS - 1, teamSheets);

  // Core strip: this week vs last week plus a 12 week trend, Phoenix weeks.
  const coreWeeks = lastWeekKeys(currentWeek, CORE_TREND_WEEKS);
  const coreFirstWeekIso = phoenixWeekKeyToUtc(coreWeeks[0]!).toISOString();
  const corePosthog = await posthogCoreWeekly({
    // One extra week so returning organizers has a base for the oldest week.
    sinceIso: phoenixWeekKeyToUtc(addWeeks(coreWeeks[0]!, -1)).toISOString(),
    teamSheetIds: teamSheets,
    extraTeamEmails: skipEmails,
  });
  const newWardsByWeek: Record<string, number> = {};
  let wardsBeforeFirstWeek = 0;
  for (const { date } of orgFirstEventMap.values()) {
    if (date < coreFirstWeekIso) wardsBeforeFirstWeek += 1;
    const k = toWeekKey(date);
    newWardsByWeek[k] = (newWardsByWeek[k] ?? 0) + 1;
  }
  const core = buildCoreWeekly({
    weeks: coreWeeks,
    posthog: corePosthog,
    newCreatorsByWeek: accountWeekMap,
    newWardsByWeek,
    wardsBeforeFirstWeek,
    emailCaptureByWeek: Object.fromEntries(
      [...captureTrend.completedWeeks, captureTrend.thisWeek].map((w) => [w.weekStart, w]),
    ),
  });

  return NextResponse.json({
    totalEvents: totalEvents ?? 0,
    totalSessions: totalSessions ?? 0,
    totalSignups: totalSignups ?? 0,
    totalInvites: totalInvites ?? 0,
    totalCapacity,
    growth,
    creators,
    recentSignups,
    newCreatorsThisCalendarWeek,
    newCreatorsLastCompletedWeek,
    wowNewCreatorsLastCompletedWeekPct,
    fourWeekAvgNewCreators,
    newAccountsByProviderThisCalendarWeek,
    newAccountsRolling7Days: newUsersThisWeek,
    northStar: {
      primaryLabel: `New creators (this week, ${formatWeekRange(currentWeek)})`,
      newCreatorsThisCalendarWeek,
      totalAccounts: totalUsers,
      secondaryLabel: "Signups on events (this calendar week)",
      weeklyMemberSignups,
      rollingLabel: "New accounts (rolling 7 days)",
      newAccountsRolling7Days: newUsersThisWeek,
      lastCompletedWeekLabel: `New creators (last completed week, ${formatWeekRange(addWeeks(currentWeek, -1))})`,
      newCreatorsLastCompletedWeek,
      wowLastCompletedWeekPct: wowNewCreatorsLastCompletedWeekPct,
      fourWeekAvgNewCreators,
    },
    newWards: {
      total: totalWards,
      newThisWeek: newWardsThisWeek,
      thisMonth: thisMonthData?.count || 0,
      lastMonth: lastMonthData?.count || 0,
      monthlyTrend,
      bySource: thisMonthBySource,
    },
    emailCapture,
    core,
    totalUsers,
    newUsersThisWeek,
    activeUsersThisWeek,
    activeUsersLast1Day,
    activeUsersLast7Days,
    activeUsersLast30Days,
    activeShareOfUsers: {
      last1Day: totalUsers ? activeUsersLast1Day / totalUsers : 0,
      last7Days: totalUsers ? activeUsersLast7Days / totalUsers : 0,
      last30Days: totalUsers ? activeUsersLast30Days / totalUsers : 0,
    },
    loginRecencyBuckets,
    staleAccounts: {
      count: staleAccountsCount,
    },
    engagement: {
      medianDaysSinceLastLogin: median(idleDaysSinceLogin),
      usersNeverLoggedIn: loginRecencyBuckets.neverLoggedIn,
    },
    providers,
    signupsWithEmail: signupsWithEmail ?? 0,
    signupsWithPhone: signupsWithPhone ?? 0,
    invitesConverted,
    newAccountsByProviderThisWeek,
    activation: {
      usersWithEvent,
      usersWithSession,
      usersWithInAppInvite,
      usersWithMemberSignup,
      shareOfAllUsers: {
        withEvent: share(usersWithEvent, totalUsers),
        withSession: share(usersWithSession, totalUsers),
        withInAppInvite: share(usersWithInAppInvite, totalUsers),
        withMemberSignup: share(usersWithMemberSignup, totalUsers),
      },
    },
    activationCohort7d: {
      ...cohort7d,
      shareOfNewUsers: {
        withEvent: share(cohort7d.withEvent, cohort7d.newUsers),
        withSession: share(cohort7d.withSession, cohort7d.newUsers),
        withInAppInvite: share(cohort7d.withInAppInvite, cohort7d.newUsers),
        withMemberSignup: share(cohort7d.withMemberSignup, cohort7d.newUsers),
      },
    },
    activationCohort30d: {
      ...cohort30d,
      shareOfNewUsers: {
        withEvent: share(cohort30d.withEvent, cohort30d.newUsers),
        withSession: share(cohort30d.withSession, cohort30d.newUsers),
        withInAppInvite: share(cohort30d.withInAppInvite, cohort30d.newUsers),
        withMemberSignup: share(cohort30d.withMemberSignup, cohort30d.newUsers),
      },
    },
    authUsersListCap: null as number | null,
    authUsersListed: totalUsers,
    authUsersFetchComplete,
    nonCreatorAccounts,
    growthCountsSource,
    totalCreators: activatedCreators.length,
  });
}
