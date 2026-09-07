"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientComponentClient } from "@/lib/auth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import Navigation from "@/components/Navigation";
import Link from "next/link";

interface MetricsData {
  totalEvents: number;
  totalSessions: number;
  totalSignups: number;
  totalInvites: number;
  totalCapacity: number;
  growth: {
    week: string;
    newEvents: number;
    newSignups: number;
    newCreatorAccounts: number;
  }[];
  creators: { email: string; events: number; sessions: number; signups: number }[];
  recentSignups: { member_name: string; event_name: string; signed_up_at: string }[];
  newCreatorsThisCalendarWeek: number;
  newCreatorsLastCompletedWeek: number;
  wowNewCreatorsLastCompletedWeekPct: number | null;
  fourWeekAvgNewCreators: number;
  newAccountsByProviderThisCalendarWeek: { google: number; email: number; total: number };
  newAccountsRolling7Days: number;
  northStar: {
    primaryLabel: string;
    newCreatorsThisCalendarWeek: number;
    totalAccounts: number;
    secondaryLabel: string;
    weeklyMemberSignups: number;
    rollingLabel: string;
    newAccountsRolling7Days: number;
    lastCompletedWeekLabel: string;
    newCreatorsLastCompletedWeek: number;
    wowLastCompletedWeekPct: number | null;
    fourWeekAvgNewCreators: number;
  };
  totalUsers: number;
  newUsersThisWeek: number;
  activeUsersThisWeek: number;
  activeUsersLast1Day: number;
  activeUsersLast7Days: number;
  activeUsersLast30Days: number;
  activeShareOfUsers: { last1Day: number; last7Days: number; last30Days: number };
  loginRecencyBuckets: {
    within1Day: number;
    day2to7: number;
    day8to30: number;
    olderThan30d: number;
    neverLoggedIn: number;
  };
  staleAccounts: { count: number };
  engagement: {
    medianDaysSinceLastLogin: number | null;
    usersNeverLoggedIn: number;
  };
  providers: Record<string, number>;
  signupsWithEmail: number;
  signupsWithPhone: number;
  invitesConverted: number;
  newAccountsByProviderThisWeek: { google: number; email: number; total: number };
  activation: {
    usersWithEvent: number;
    usersWithSession: number;
    usersWithInAppInvite: number;
    usersWithMemberSignup: number;
    shareOfAllUsers: {
      withEvent: number;
      withSession: number;
      withInAppInvite: number;
      withMemberSignup: number;
    };
  };
  activationCohort7d: {
    newUsers: number;
    withEvent: number;
    withSession: number;
    withInAppInvite: number;
    withMemberSignup: number;
    shareOfNewUsers: {
      withEvent: number;
      withSession: number;
      withInAppInvite: number;
      withMemberSignup: number;
    };
  };
  activationCohort30d: {
    newUsers: number;
    withEvent: number;
    withSession: number;
    withInAppInvite: number;
    withMemberSignup: number;
    shareOfNewUsers: {
      withEvent: number;
      withSession: number;
      withInAppInvite: number;
      withMemberSignup: number;
    };
  };
  /** Legacy: was 1000 page cap; null means full paginated fetch. */
  authUsersListCap: number | null;
  authUsersListed: number;
  /** False if listUsers hit the 100k-account safety cap. */
  authUsersFetchComplete: boolean;
}

function weekLabel(mondayStr: string) {
  const [y, m, d] = mondayStr.split("-").map(Number);
  const mon = new Date(y, m - 1, d);
  const sun = new Date(y, m - 1, d + 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${mon.toLocaleDateString([], opts)} – ${sun.toLocaleDateString([], opts)}`;
}

function pct(n: number) {
  return Math.round(n * 100);
}

type BrandTab = "all" | "wardsignup" | "ministrysignup" | "orgsignup";

const BRAND_TABS: { id: BrandTab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "wardsignup", label: "Ward" },
  { id: "ministrysignup", label: "Ministry" },
  { id: "orgsignup", label: "Org" },
];

export default function MetricsPage() {
  const router = useRouter();
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshed, setRefreshed] = useState("");
  const [activeTab, setActiveTab] = useState<BrandTab>("all");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setData(null);
      setError("");
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.push("/login"); return; }

      const url = activeTab === "all" ? "/api/metrics" : `/api/metrics?brand=${activeTab}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.status === 403) {
        router.push("/dashboard");
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `API error ${res.status}`);
        setLoading(false);
        return;
      }

      const json = await res.json();
      setData(json);
      setRefreshed(new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
      setLoading(false);
    };
    load();
  }, [router, activeTab]);

  const fillRate = data && data.totalCapacity > 0
    ? Math.min(100, Math.round((data.totalSignups / data.totalCapacity) * 100))
    : 0;

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] p-6 sm:p-8">
        <div className="max-w-5xl mx-auto">

          {/* Header */}
          <div className="mb-8 flex items-end justify-between gap-4">
            <div>
              <Link
                href="/dashboard"
                className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] mb-3 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                  <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                </svg>
                Back to My Events
              </Link>
              <h1 className="font-serif text-[32px] text-[#0D2B35]">Founder metrics</h1>
              <p className="text-[15px] text-[#5A8399] mt-1 max-w-2xl">
                New creators per week (registered accounts) for GTM tracking. Weeks are UTC Monday–Sunday.
              </p>
            </div>
            {refreshed && (
              <div className="text-[13px] text-[#5A8399] shrink-0 pb-1">Updated {refreshed}</div>
            )}
          </div>

          {/* Brand tabs */}
          <div className="flex gap-1 mb-6 bg-white border border-[rgba(14,150,176,0.14)] rounded-xl p-1 w-fit shadow-[0_1px_4px_rgba(8,100,126,0.06)]">
            {BRAND_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? "bg-[#0E96B0] text-white shadow-sm"
                    : "text-[#5A8399] hover:text-[#0D2B35]"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-5 py-4 rounded-xl text-sm">
              {error}
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-24">
              <LoadingSpinner size="md" />
            </div>
          ) : data && (
            <div className="space-y-6">

              {/* Hero — new creators (calendar week) */}
              <div className="bg-gradient-to-br from-[#E6F7FB] to-white rounded-2xl border border-[rgba(14,150,176,0.22)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6 sm:p-8">
                <div className="text-[12px] font-semibold text-[#08647E] uppercase tracking-[0.5px] mb-2">
                  New creators (leading)
                </div>
                <p className="text-[15px] text-[#5A8399] mb-6 max-w-2xl">
                  A <strong className="text-[#2E5566] font-semibold">creator</strong> is a new Supabase auth account (Google or magic link).
                  Compare calendar weeks for weekly reviews; rolling 7 days can differ from the current week boundary.
                </p>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
                  <div>
                    <div className="text-[13px] text-[#5A8399] mb-1">{data.northStar.primaryLabel}</div>
                    <div className="text-[48px] sm:text-[56px] font-semibold text-[#0E96B0] leading-none tabular-nums">
                      {data.northStar.newCreatorsThisCalendarWeek.toLocaleString()}
                    </div>
                    <div className="text-[12px] text-[#5A8399] mt-2">
                      {data.northStar.totalAccounts.toLocaleString()} total registered accounts
                    </div>
                    <div className="text-[12px] text-[#0D2B35] mt-3 font-medium">
                      This calendar week: Google {data.newAccountsByProviderThisCalendarWeek.google.toLocaleString()} · Magic link{" "}
                      {data.newAccountsByProviderThisCalendarWeek.email.toLocaleString()}
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] text-[#5A8399] mb-1">{data.northStar.lastCompletedWeekLabel}</div>
                    <div className="text-[40px] sm:text-[48px] font-semibold text-[#0D2B35] leading-none tabular-nums">
                      {data.northStar.newCreatorsLastCompletedWeek.toLocaleString()}
                    </div>
                    <div className="text-[12px] text-[#5A8399] mt-2">
                      {data.northStar.wowLastCompletedWeekPct == null
                        ? "WoW: — (no prior week to compare)"
                        : `WoW vs prior week: ${data.northStar.wowLastCompletedWeekPct >= 0 ? "+" : ""}${data.northStar.wowLastCompletedWeekPct.toFixed(0)}%`}
                    </div>
                  </div>
                  <div>
                    <div className="text-[13px] text-[#5A8399] mb-1">4-week average (new creators)</div>
                    <div className="text-[40px] sm:text-[48px] font-semibold text-[#0D2B35] leading-none tabular-nums">
                      {data.northStar.fourWeekAvgNewCreators.toFixed(1)}
                    </div>
                    <div className="text-[12px] text-[#5A8399] mt-2">Smoothes noisy weeks</div>
                  </div>
                  <div>
                    <div className="text-[13px] text-[#5A8399] mb-1">{data.northStar.rollingLabel}</div>
                    <div className="text-[40px] sm:text-[48px] font-semibold text-[#2E5566] leading-none tabular-nums">
                      {data.northStar.newAccountsRolling7Days.toLocaleString()}
                    </div>
                    <div className="text-[12px] text-[#5A8399] mt-2">
                      Rolling window, not aligned to week boundaries
                    </div>
                  </div>
                </div>
              </div>

              {/* Distribution — signups & events (this calendar week) */}
              <div className="grid sm:grid-cols-3 gap-4">
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-5">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                    Signups (this week)
                  </div>
                  <div className="text-[32px] font-semibold text-[#0D2B35] tabular-nums leading-none">
                    {data.northStar.weeklyMemberSignups.toLocaleString()}
                  </div>
                  <p className="text-[12px] text-[#5A8399] mt-2 leading-snug">
                    Public signups claiming slots—lags creator growth; shows link distribution.
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-5">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                    New events (this week)
                  </div>
                  <div className="text-[32px] font-semibold text-[#0D2B35] tabular-nums leading-none">
                    {(data.growth[data.growth.length - 1]?.newEvents ?? 0).toLocaleString()}
                  </div>
                  <p className="text-[12px] text-[#5A8399] mt-2 leading-snug">
                    Campaigns created in the current UTC week.
                  </p>
                </div>
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-5">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] mb-1">
                    Rolling 7d (providers)
                  </div>
                  <div className="text-[13px] text-[#0D2B35] font-medium">
                    Google {data.newAccountsByProviderThisWeek.google.toLocaleString()} · Magic link{" "}
                    {data.newAccountsByProviderThisWeek.email.toLocaleString()}
                  </div>
                  <p className="text-[12px] text-[#5A8399] mt-2 leading-snug">
                    Same window as rolling new-account count—useful for comparing to calendar week.
                  </p>
                </div>
              </div>

              {/* Weekly trend — bars + table */}
              <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-1">
                  Last 8 weeks
                </div>
                <p className="text-[13px] text-[#5A8399] mb-5 max-w-3xl">
                  Bar height = new creators per week. Table includes signups and new events for context.
                </p>
                {(() => {
                  const maxC = Math.max(
                    1,
                    ...data.growth.map((g) => g.newCreatorAccounts),
                  );
                  return (
                    <div className="mb-8 flex items-end justify-stretch gap-1.5 h-36 border-b border-[rgba(14,150,176,0.18)] pb-0 px-0.5">
                      {data.growth.map((row) => {
                        const pctH = row.newCreatorAccounts === 0
                          ? 0
                          : Math.max(6, (row.newCreatorAccounts / maxC) * 100);
                        return (
                          <div
                            key={row.week}
                            className="flex-1 flex flex-col justify-end h-full min-w-0 group relative"
                            title={`${weekLabel(row.week)}: ${row.newCreatorAccounts} creators`}
                          >
                            <div
                              className="w-full rounded-t bg-[#0E96B0] transition-opacity group-hover:opacity-90"
                              style={{ height: `${pctH}%` }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#5A8399] mb-6 justify-center sm:justify-between">
                  {data.growth.map((row) => (
                    <span key={row.week} className="whitespace-nowrap">
                      {weekLabel(row.week)}
                    </span>
                  ))}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
                        <th className="text-left pb-3 pr-4 font-semibold">Week</th>
                        <th className="text-right pb-3 px-3 font-semibold">New creators</th>
                        <th className="text-right pb-3 px-3 font-semibold">Signups</th>
                        <th className="text-right pb-3 pl-3 font-semibold">New events</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.growth].reverse().map((row) => (
                        <tr key={row.week} className="border-b border-[rgba(14,150,176,0.06)] last:border-0">
                          <td className="py-3 pr-4 text-[13px] text-[#5A8399]">{weekLabel(row.week)}</td>
                          <td className="py-3 px-3 text-right text-[14px] font-semibold text-[#0E96B0] tabular-nums">
                            {row.newCreatorAccounts > 0 ? row.newCreatorAccounts : <span className="text-[#C8DDE6] font-normal">—</span>}
                          </td>
                          <td className="py-3 px-3 text-right text-[14px] font-semibold text-[#0D2B35] tabular-nums">
                            {row.newSignups > 0 ? row.newSignups : <span className="text-[#C8DDE6] font-normal">—</span>}
                          </td>
                          <td className="py-3 pl-3 text-right text-[14px] font-semibold text-[#0D2B35] tabular-nums">
                            {row.newEvents > 0 ? row.newEvents : <span className="text-[#C8DDE6] font-normal">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <details className="group rounded-2xl border border-[rgba(14,150,176,0.2)] bg-[#FAFCFD] open:bg-white open:shadow-[0_2px_12px_rgba(8,100,126,0.06)]">
                <summary className="cursor-pointer list-none px-6 py-4 font-semibold text-[#0D2B35] text-[15px] flex items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    Advanced diagnostics
                    <span className="block sm:inline sm:before:content-['\2014\00a0'] text-[12px] font-normal text-[#5A8399] group-open:hidden">
                      Activation, funnel, accounts, lists
                    </span>
                  </span>
                  <svg className="w-5 h-5 text-[#0E96B0] shrink-0 group-open:rotate-180 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <div className="px-6 pb-6 space-y-6 border-t border-[rgba(14,150,176,0.10)] pt-6">

              {/* Activation funnel (from app data — not time-on-site) */}
              <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-2">Activation</div>
                <p className="text-[13px] text-[#5A8399] mb-5 max-w-3xl leading-relaxed">
                  What organizers have done in the app, among{" "}
                  {data.authUsersListed.toLocaleString()} auth accounts
                  {data.authUsersFetchComplete === false ? " (partial fetch)" : ""}.
                  &quot;Invites sent&quot; counts only <strong className="text-[#2E5566] font-semibold">in-app email invites</strong> stored in the database—not copy-link, SMS, or WhatsApp shares.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
                        <th className="text-left pb-3 font-semibold">Step</th>
                        <th className="text-right pb-3 pl-4 font-semibold">Users</th>
                        <th className="text-right pb-3 pl-4 font-semibold">% of accounts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[rgba(14,150,176,0.08)]">
                      {[
                        ["Created an event", data.activation.usersWithEvent, data.activation.shareOfAllUsers.withEvent],
                        ["Added at least one slot", data.activation.usersWithSession, data.activation.shareOfAllUsers.withSession],
                        ["Sent an in-app email invite", data.activation.usersWithInAppInvite, data.activation.shareOfAllUsers.withInAppInvite],
                        ["Got ≥1 signup on their events", data.activation.usersWithMemberSignup, data.activation.shareOfAllUsers.withMemberSignup],
                      ].map(([label, count, share]) => (
                        <tr key={String(label)}>
                          <td className="py-2.5 text-[#0D2B35]">{label}</td>
                          <td className="py-2.5 pl-4 text-right font-semibold tabular-nums">{count as number}</td>
                          <td className="py-2.5 pl-4 text-right text-[#5A8399] tabular-nums">{pct(share as number)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-8 grid sm:grid-cols-2 gap-6">
                  <div>
                    <div className="text-[12px] font-semibold text-[#0D2B35] mb-3">New accounts (last 7 days)</div>
                    <p className="text-[12px] text-[#5A8399] mb-2">
                      Cohort size: {data.activationCohort7d.newUsers.toLocaleString()} users
                    </p>
                    <table className="w-full text-[13px]">
                      <tbody className="divide-y divide-[rgba(14,150,176,0.08)]">
                        {[
                          ["Created an event", data.activationCohort7d.shareOfNewUsers.withEvent],
                          ["Added a slot", data.activationCohort7d.shareOfNewUsers.withSession],
                          ["In-app email invite", data.activationCohort7d.shareOfNewUsers.withInAppInvite],
                          ["Signup on their events", data.activationCohort7d.shareOfNewUsers.withMemberSignup],
                        ].map(([label, share]) => (
                          <tr key={String(label)}>
                            <td className="py-1.5 text-[#5A8399]">{label}</td>
                            <td className="py-1.5 text-right font-semibold text-[#0D2B35] tabular-nums">{pct(share as number)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-[#0D2B35] mb-3">New accounts (last 30 days)</div>
                    <p className="text-[12px] text-[#5A8399] mb-2">
                      Cohort size: {data.activationCohort30d.newUsers.toLocaleString()} users
                    </p>
                    <table className="w-full text-[13px]">
                      <tbody className="divide-y divide-[rgba(14,150,176,0.08)]">
                        {[
                          ["Created an event", data.activationCohort30d.shareOfNewUsers.withEvent],
                          ["Added a slot", data.activationCohort30d.shareOfNewUsers.withSession],
                          ["In-app email invite", data.activationCohort30d.shareOfNewUsers.withInAppInvite],
                          ["Signup on their events", data.activationCohort30d.shareOfNewUsers.withMemberSignup],
                        ].map(([label, share]) => (
                          <tr key={String(label)}>
                            <td className="py-1.5 text-[#5A8399]">{label}</td>
                            <td className="py-1.5 text-right font-semibold text-[#0D2B35] tabular-nums">{pct(share as number)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Engagement not tracked in DB (Phase 2/3) */}
              <div className="bg-[#FAFCFD] rounded-2xl border border-dashed border-[rgba(14,150,176,0.35)] p-6">
                <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-2">Engagement (not in database)</div>
                <p className="text-[13px] text-[#5A8399] leading-relaxed max-w-3xl">
                  Time in the app, session length, and passive shares (copy link, WhatsApp, mailto, SMS) are{" "}
                  <strong className="text-[#2E5566] font-semibold">not recorded</strong> in Supabase. To measure those, add product analytics
                  (e.g. PostHog or Vercel custom events) or a lightweight <code className="text-[12px] bg-[#F4FAFB] px-1 rounded">usage_events</code>{" "}
                  table with client or API instrumentation.
                </p>
              </div>

              {/* Funnel + Fill Rate */}
              <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-5">Funnel</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {([
                    { label: "Events", value: data.totalEvents },
                    null,
                    { label: "Slots", value: data.totalSessions },
                    null,
                    { label: "Signups", value: data.totalSignups },
                  ] as Array<{ label: string; value: number } | null>).map((item, i) =>
                    item === null ? (
                      <svg key={i} viewBox="0 0 24 24" fill="none" stroke="#C8DDE6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 shrink-0">
                        <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                      </svg>
                    ) : (
                      <div key={i} className="flex-1 min-w-[90px] bg-[#F4FAFB] rounded-xl px-4 py-4 text-center">
                        <div className="text-[36px] font-semibold text-[#0D2B35] leading-none">{item.value}</div>
                        <div className="text-[12px] text-[#5A8399] mt-1.5">{item.label}</div>
                      </div>
                    )
                  )}
                  <div className="hidden sm:block w-px h-12 bg-[rgba(14,150,176,0.14)] mx-1 shrink-0" />
                  <div className="flex-1 min-w-[90px] bg-[#E6F7FB] rounded-xl px-4 py-4 text-center">
                    <div className="text-[36px] font-semibold text-[#0E96B0] leading-none">{fillRate}%</div>
                    <div className="text-[12px] text-[#5A8399] mt-1.5">Fill Rate</div>
                  </div>
                </div>
                <div className="mt-3 text-[12px] text-[#5A8399] space-y-0.5">
                  <div>{data.totalSignups.toLocaleString()} signups across {data.totalCapacity.toLocaleString()} total spots · {data.totalInvites} invite{data.totalInvites !== 1 ? "s" : ""} sent</div>
                  <div>
                    Invite conversion: {data.invitesConverted} of {data.totalInvites}{data.totalInvites > 0 ? ` (${Math.round((data.invitesConverted / data.totalInvites) * 100)}%)` : ""} · Email provided: {data.totalSignups > 0 ? Math.round((data.signupsWithEmail / data.totalSignups) * 100) : 0}% · Phone provided: {data.totalSignups > 0 ? Math.round((data.signupsWithPhone / data.totalSignups) * 100) : 0}%
                  </div>
                </div>
              </div>

              {/* Accounts + activity windows */}
              <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-5">Accounts</div>
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { label: "Total", value: data.totalUsers },
                    { label: "New (rolling 7d)", value: data.newUsersThisWeek },
                    { label: "Active (1d)", value: data.activeUsersLast1Day },
                    { label: "Active (7d)", value: data.activeUsersLast7Days },
                    { label: "Active (30d)", value: data.activeUsersLast30Days },
                  ].map((item) => (
                    <div key={item.label} className="flex-1 min-w-[90px] bg-[#F4FAFB] rounded-xl px-4 py-4 text-center">
                      <div className="text-[36px] font-semibold text-[#0D2B35] leading-none">{item.value}</div>
                      <div className="text-[12px] text-[#5A8399] mt-1.5">{item.label}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-4 text-[12px] text-[#5A8399] space-y-1">
                  <div>
                    Share of accounts with any login in window:{" "}
                    <span className="text-[#0D2B35] font-medium">
                      {Math.round(data.activeShareOfUsers.last1Day * 100)}% (1d)
                    </span>
                    {" · "}
                    <span className="text-[#0D2B35] font-medium">
                      {Math.round(data.activeShareOfUsers.last7Days * 100)}% (7d)
                    </span>
                    {" · "}
                    <span className="text-[#0D2B35] font-medium">
                      {Math.round(data.activeShareOfUsers.last30Days * 100)}% (30d)
                    </span>
                  </div>
                  <div>
                    Google: {data.providers.google ?? 0} · Magic link: {data.providers.email ?? 0}
                  </div>
                </div>
                <p className="mt-4 text-[11px] text-[#7A9BAE] leading-relaxed border-t border-[rgba(14,150,176,0.10)] pt-4">
                  Instrumentation: segments use Supabase Auth <code className="text-[11px] bg-[#F4FAFB] px-1 rounded">last_sign_in_at</code> only (no per-login history). For DAU/WAU-style login frequency or funnels, add product analytics (e.g. PostHog or Vercel custom events).
                </p>
              </div>

              {/* Last login recency + stale accounts */}
              <div className="grid sm:grid-cols-2 gap-6">
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-5">Last login — recency</div>
                  <table className="w-full text-[13px]">
                    <tbody className="divide-y divide-[rgba(14,150,176,0.08)]">
                      {[
                        ["Last 24 hours", data.loginRecencyBuckets.within1Day],
                        ["2–7 days ago", data.loginRecencyBuckets.day2to7],
                        ["8–30 days ago", data.loginRecencyBuckets.day8to30],
                        ["Older than 30 days", data.loginRecencyBuckets.olderThan30d],
                        ["Never logged in", data.loginRecencyBuckets.neverLoggedIn],
                      ].map(([label, n]) => (
                        <tr key={String(label)}>
                          <td className="py-2 text-[#5A8399]">{label}</td>
                          <td className="py-2 text-right font-semibold text-[#0D2B35] tabular-nums">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {data.engagement.medianDaysSinceLastLogin != null && (
                    <div className="mt-3 text-[12px] text-[#5A8399]">
                      Median days since last login (among users who logged in at least once):{" "}
                      <span className="font-semibold text-[#0D2B35] tabular-nums">
                        {data.engagement.medianDaysSinceLastLogin.toFixed(1)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-3">Stale accounts</div>
                  <div className="text-[40px] font-semibold text-[#0D2B35] leading-none tabular-nums">
                    {data.staleAccounts.count}
                  </div>
                  <p className="text-[13px] text-[#5A8399] mt-3 leading-relaxed">
                    Auth accounts with no campaign row (no event created by this user id or email). Good for spotting signups who have not activated as organizers.
                  </p>
                </div>
              </div>

              {/* Creators + Recent Signups */}
              <div className="grid sm:grid-cols-2 gap-6">

                {/* Creators */}
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-5">Creators</div>
                  {data.creators.length === 0 ? (
                    <p className="text-sm text-[#5A8399]">No creators yet.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
                          <th className="text-left pb-3 font-semibold">Email</th>
                          <th className="text-right pb-3 pl-4 font-semibold">Events</th>
                          <th className="text-right pb-3 pl-4 font-semibold">Sess.</th>
                          <th className="text-right pb-3 pl-4 font-semibold">Signups</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.creators.map((c) => (
                          <tr key={c.email} className="border-b border-[rgba(14,150,176,0.06)] last:border-0">
                            <td className="py-2.5 text-[13px] text-[#0D2B35] max-w-0 w-full truncate overflow-hidden">{c.email}</td>
                            <td className="py-2.5 pl-4 text-right text-[13px] font-semibold text-[#0D2B35] tabular-nums whitespace-nowrap">{c.events}</td>
                            <td className="py-2.5 pl-4 text-right text-[13px] text-[#5A8399] tabular-nums whitespace-nowrap">{c.sessions}</td>
                            <td className="py-2.5 pl-4 text-right text-[13px] font-semibold text-[#0E96B0] tabular-nums whitespace-nowrap">{c.signups}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Recent Signups */}
                <div className="bg-white rounded-2xl border border-[rgba(14,150,176,0.14)] shadow-[0_2px_12px_rgba(8,100,126,0.06)] p-6">
                  <div className="text-[12px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] mb-5">Recent Signups</div>
                  {data.recentSignups.length === 0 ? (
                    <p className="text-sm text-[#5A8399]">No signups yet.</p>
                  ) : (
                    <table className="w-full">
                      <thead>
                        <tr className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.4px] border-b border-[rgba(14,150,176,0.10)]">
                          <th className="text-left pb-3 font-semibold">Name</th>
                          <th className="text-left pb-3 pl-3 font-semibold">Event</th>
                          <th className="text-right pb-3 pl-3 font-semibold">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                      {data.recentSignups.map((s, i) => (
                        <tr key={i} className="border-b border-[rgba(14,150,176,0.06)] last:border-0">
                          <td className="py-2.5 text-[13px] font-medium text-[#0D2B35] max-w-0 w-full truncate overflow-hidden">{s.member_name}</td>
                          <td className="py-2.5 pl-3 text-[13px] text-[#5A8399] max-w-0 w-full truncate overflow-hidden">{s.event_name}</td>
                          <td className="py-2.5 pl-3 text-right text-[12px] text-[#5A8399] whitespace-nowrap">
                            {new Date(s.signed_up_at).toLocaleDateString([], { month: "short", day: "numeric" })}
                          </td>
                        </tr>
                      ))}
                      </tbody>
                    </table>
                  )}
                </div>

              </div>

                </div>
              </details>

            </div>
          )}
        </div>
      </main>
    </>
  );
}
