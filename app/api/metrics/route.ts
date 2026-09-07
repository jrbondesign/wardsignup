import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isMetricsAdminEmail } from "@/lib/metrics-admin";

function toWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getUTCDay(); // 0=Sun
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // back to Monday
  d.setUTCDate(diff);
  return d.toISOString().slice(0, 10);
}

const MS_DAY = 24 * 60 * 60 * 1000;

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

const VALID_BRANDS = new Set(["wardsignup", "ministrysignup", "orgsignup"]);

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

  const weeks: string[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i * 7);
    weeks.push(toWeekKey(d.toISOString()));
  }
  const oldestWeekStart = weeks[0]!;
  const oldestIso = `${oldestWeekStart}T00:00:00.000Z`;

  // When filtering by brand, fetch campaign IDs first so we can filter dependent tables.
  let brandCampaignIds: string[] | null = null;
  let brandUserIds: string[] | null = null;
  if (brandFilter) {
    const [{ data: brandCampaigns }, { data: brandProfiles }] = await Promise.all([
      admin.from("campaigns").select("id").eq("brand_id", brandFilter),
      admin.from("organizer_profiles").select("user_id").eq("brand_id", brandFilter),
    ]);
    brandCampaignIds = (brandCampaigns ?? []).map((r: { id: string }) => r.id);
    brandUserIds = (brandProfiles ?? []).map((r: { user_id: string }) => r.user_id);
  } else {
    // For the "all" tab, scope users to those with any organizer_profile — same methodology
    // as brand tabs — so the numbers are additive rather than inflated by bare auth accounts
    // that have no brand affiliation yet.
    const { data: allProfiles } = await admin
      .from("organizer_profiles")
      .select("user_id");
    const profileUserIdSet = new Set(
      (allProfiles ?? []).map((r: { user_id: string }) => r.user_id),
    );
    // Keep brandUserIds as a de-duped array of all profiled user IDs
    brandUserIds = [...profileUserIdSet];
  }

  const [
    { count: totalEvents },
    { count: totalSessions },
    { count: totalSignups },
    { count: totalInvites },
    { data: capRaw, error: capErr },
    { data: creatorRpc, error: creatorErr },
    { data: growthCampaigns },
    { data: growthSignups },
    { data: recentSignupsRaw },
    listUsersResult,
    { count: signupsWithEmail },
    { count: signupsWithPhone },
    { data: inviteEmailsRaw },
    { data: signupEmailsRaw },
    { data: campaignsSlim },
    { data: sessionCampaignRows },
    { data: signupCampaignRows },
    { data: inviteInviterRows },
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
    brandCampaignIds !== null
      ? admin.from("campaigns").select("created_at").in("id", brandCampaignIds).gte("created_at", oldestIso)
      : admin.from("campaigns").select("created_at").gte("created_at", oldestIso),
    brandCampaignIds !== null
      ? admin.from("signups").select("signed_up_at").in("campaign_id", brandCampaignIds).gte("signed_up_at", oldestIso)
      : admin.from("signups").select("signed_up_at").gte("signed_up_at", oldestIso),
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
    brandCampaignIds !== null
      ? admin.from("event_invites").select("invitee_email").in("campaign_id", brandCampaignIds)
      : admin.from("event_invites").select("invitee_email"),
    brandCampaignIds !== null
      ? admin.from("signups").select("member_email").in("campaign_id", brandCampaignIds).not("member_email", "is", null)
      : admin.from("signups").select("member_email").not("member_email", "is", null),
    brandCampaignIds !== null
      ? admin.from("campaigns").select("id, created_by, user_email").in("id", brandCampaignIds)
      : admin.from("campaigns").select("id, created_by, user_email"),
    brandCampaignIds !== null
      ? admin.from("sessions").select("campaign_id").in("campaign_id", brandCampaignIds)
      : admin.from("sessions").select("campaign_id"),
    brandCampaignIds !== null
      ? admin.from("signups").select("campaign_id").in("campaign_id", brandCampaignIds)
      : admin.from("signups").select("campaign_id"),
    brandCampaignIds !== null
      ? admin.from("event_invites").select("inviter_id").in("campaign_id", brandCampaignIds)
      : admin.from("event_invites").select("inviter_id"),
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
  for (const c of growthCampaigns ?? []) {
    const row = c as { created_at: string };
    const w = toWeekKey(row.created_at);
    campaignWeekMap[w] = (campaignWeekMap[w] ?? 0) + 1;
  }
  const signupWeekMap: Record<string, number> = {};
  for (const s of growthSignups ?? []) {
    const row = s as { signed_up_at: string };
    const w = toWeekKey(row.signed_up_at);
    signupWeekMap[w] = (signupWeekMap[w] ?? 0) + 1;
  }

  const accountWeekMap: Record<string, number> = {};
  for (const u of authUserList) {
    const w = toWeekKey(u.created_at);
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
  const newUsersThisWeek = authUserList.filter((u) => u.created_at >= sevenDaysAgo).length;
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
  for (const row of (campaignsSlim ?? []) as SlimCampaign[]) {
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
    (sessionCampaignRows ?? []).map((r: { campaign_id: string }) => r.campaign_id).filter(Boolean),
  );
  const signupCampaignIds = new Set(
    (signupCampaignRows ?? []).map((r: { campaign_id: string }) => r.campaign_id).filter(Boolean),
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
    (inviteEmailsRaw ?? ([] as { invitee_email: string }[])).map((r) =>
      r.invitee_email.toLowerCase(),
    ),
  );
  const signupEmailSet = new Set(
    (signupEmailsRaw ?? ([] as { member_email: string }[])).map((r) =>
      r.member_email.toLowerCase(),
    ),
  );
  const invitesConverted = [...inviteEmailSet].filter((e) => signupEmailSet.has(e)).length;

  const inviterIds = new Set(
    (inviteInviterRows ?? []).map((r: { inviter_id: string }) => r.inviter_id).filter(Boolean),
  );

  const newUsersWeek = authUserList.filter((u) => u.created_at >= sevenDaysAgo);
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

    if (u.created_at >= sevenDaysAgo) {
      cohort7d.newUsers += 1;
      if (hasEvent) cohort7d.withEvent += 1;
      if (hasSession) cohort7d.withSession += 1;
      if (hasInAppInvite) cohort7d.withInAppInvite += 1;
      if (hasMemberSignup) cohort7d.withMemberSignup += 1;
    }
    if (u.created_at >= thirtyDaysAgo) {
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
  const thisCalendarWeekUsers = authUserList.filter(
    (u) => toWeekKey(u.created_at) === currentWeekKey,
  );
  const newAccountsByProviderThisCalendarWeek = {
    google: thisCalendarWeekUsers.filter((u) => u.app_metadata?.provider === "google")
      .length,
    email: thisCalendarWeekUsers.filter((u) => u.app_metadata?.provider !== "google")
      .length,
    total: thisCalendarWeekUsers.length,
  };

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
      primaryLabel: "New creators (this calendar week, UTC Mon–Sun)",
      newCreatorsThisCalendarWeek,
      totalAccounts: totalUsers,
      secondaryLabel: "Signups on events (this calendar week)",
      weeklyMemberSignups,
      rollingLabel: "New accounts (rolling 7 days)",
      newAccountsRolling7Days: newUsersThisWeek,
      lastCompletedWeekLabel: "New creators (last completed week)",
      newCreatorsLastCompletedWeek,
      wowLastCompletedWeekPct: wowNewCreatorsLastCompletedWeekPct,
      fourWeekAvgNewCreators,
    },
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
  });
}
