"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePostHog } from "posthog-js/react";
import { createClientComponentClient } from "@/lib/auth";

export const ORG_SETTINGS_CAPTION_WARD = "Your ward name, admins and public ward directory.";
export const ORG_SETTINGS_CAPTION_GENERIC = "Your group name and admins.";

/** Gear glyph shared with the OrgSwitcher menu and the nav. */
export function GearIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

interface Props {
  /** Ward brand gets the directory line; other brands get the shorter group line. */
  isWardBrand: boolean;
}

/**
 * Dashboard header entry point for org settings: a labeled one tap link to
 * /settings/organization, an always visible caption (instead of a hover only
 * tooltip), and a quiet "Switch organization" link for members of 2+ orgs.
 */
export default function OrgSettingsEntry({ isWardBrand }: Props) {
  const posthog = usePostHog();
  const [orgCount, setOrgCount] = useState(0);
  const [orgsLoading, setOrgsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch("/api/organizations/list", {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;
        const data = (await res.json().catch(() => ({}))) as { organizations?: unknown[] };
        if (!cancelled) setOrgCount(data.organizations?.length ?? 0);
      } catch {
        // Switching is optional; settings stay reachable without the list.
      } finally {
        if (!cancelled) setOrgsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const caption = isWardBrand ? ORG_SETTINGS_CAPTION_WARD : ORG_SETTINGS_CAPTION_GENERIC;
  const showSwitch = orgCount >= 2;

  return (
    <div className="mt-2">
      <Link
        href="/settings/organization"
        aria-describedby="org-settings-caption"
        onClick={() => posthog?.capture("org_settings_opened", { source: "dashboard" })}
        className="inline-flex items-center gap-2 min-h-11 text-[13px] sm:text-sm font-semibold px-4 py-2 rounded-full border-[1.5px] border-[#0E96B0]/35 bg-white text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
      >
        <GearIcon className="w-4 h-4" />
        Organization settings
      </Link>
      <p id="org-settings-caption" className="text-xs text-[#5A8399] mt-1.5">
        {caption}
      </p>
      {showSwitch ? (
        <Link
          href="/orgs/select?next=/dashboard"
          className="mt-1 inline-flex items-center gap-1.5 min-h-11 rounded-full text-[13px] font-medium text-[#0E96B0] hover:text-[#08647E] no-underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0E96B0]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="w-3.5 h-3.5"
          >
            <polyline points="17 1 21 5 17 9" />
            <path d="M3 11V9a4 4 0 0 1 4-4h14" />
            <polyline points="7 23 3 19 7 15" />
            <path d="M21 13v2a4 4 0 0 1-4 4H3" />
          </svg>
          Switch organization
        </Link>
      ) : (
        // Hold the Switch row's height until the org list loads so the header
        // doesn't jump for multi-org users; collapses for single-org users.
        orgsLoading && <div data-testid="org-switch-placeholder" aria-hidden="true" className="mt-1 min-h-11" />
      )}
    </div>
  );
}
