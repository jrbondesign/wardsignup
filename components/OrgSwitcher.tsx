"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";

type OrgItem = {
  id: string;
  name: string;
  needs_naming: boolean;
  brand_id: string;
  role: "owner" | "admin";
};

interface Props {
  /** Called when the user picks a new org so the host page can refresh server-derived state. */
  onSwitch?: () => void;
}

/**
 * Gear-icon dropdown that exposes per-organization settings:
 *  - "Organization settings" link (always shown)
 *  - "Switch organization" list (only when the user belongs to 2+ orgs on this brand)
 */
export default function OrgSwitcher({ onSwitch }: Props) {
  const [orgs, setOrgs] = useState<OrgItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/organizations/list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => ({}))) as {
        organizations?: OrgItem[];
        selectedOrgId?: string | null;
      };
      setOrgs(data.organizations ?? []);
      setSelectedId(data.selectedOrgId ?? null);
    };
    void load();
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handler);
    return () => document.removeEventListener("click", handler);
  }, [open]);

  const handlePick = async (orgId: string) => {
    if (submitting) return;
    setError(null);
    setSubmitting(orgId);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/organizations/select", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ organizationId: orgId }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        const msg = body.error ?? `Failed to switch (HTTP ${res.status})`;
        console.error("OrgSwitcher: select failed", { status: res.status, body });
        setError(msg);
        setSubmitting(null);
        return;
      }
      setSelectedId(orgId);
      setOpen(false);
      if (onSwitch) onSwitch();
      else if (typeof window !== "undefined") {
        // Use href= rather than reload() so the request bypasses the bfcache
        // and re-runs the dashboard's data fetch with the new selected org.
        window.location.href = window.location.pathname + window.location.search;
      }
    } catch (e) {
      console.error("OrgSwitcher: select threw", e);
      setError(e instanceof Error ? e.message : "Network error");
      setSubmitting(null);
    }
  };

  const showSwitcher = !!orgs && orgs.length >= 2;

  return (
    <div ref={wrapperRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="Organization settings menu"
        title="Organization settings"
        className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[#0E96B0] hover:text-[#08647E] hover:bg-[#0E96B0]/10 transition-colors"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      {open && (
        <div className="absolute z-20 mt-2 w-64 right-0 bg-white rounded-xl shadow-[0_8px_32px_rgba(8,100,126,0.18)] border border-[#0E96B0]/10 py-1.5">
          <Link
            href="/settings/organization"
            onClick={() => setOpen(false)}
            className="group flex items-center justify-between gap-3 px-3 py-2 text-[13px] font-medium text-[#0E96B0] hover:bg-[#F4FAFB] hover:text-[#08647E]"
          >
            <span className="inline-flex items-center gap-2">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              Organization settings
            </span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="opacity-60 group-hover:opacity-100 transition-opacity">
              <polyline points="9 6 15 12 9 18" />
            </svg>
          </Link>
          {error && (
            <div className="mx-2 my-1 px-2 py-1.5 text-[12px] text-[#B0220E] bg-[#FFE7E2] rounded">
              {error}
            </div>
          )}
          {showSwitcher && (
            <>
              <div className="border-t border-[#0E96B0]/10 my-1" />
              <div className="px-3 pt-1 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[#5A8399]">
                Switch organization
              </div>
              {orgs!.map((o) => {
                const isCurrent = o.id === selectedId;
                const label = o.needs_naming ? "Untitled organization" : o.name;
                return (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => handlePick(o.id)}
                    disabled={!!submitting}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left hover:bg-[#F4FAFB] disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <div className="min-w-0">
                      <div className="text-[13px] font-medium text-[#0D2B35] truncate">{label}</div>
                      <div className="text-[11px] text-[#5A8399]">
                        {o.role === "owner" ? "Owner" : "Co-admin"}
                      </div>
                    </div>
                    {isCurrent && (
                      <span className="text-[11px] font-semibold text-[#0E96B0] shrink-0">Current</span>
                    )}
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}
    </div>
  );
}
