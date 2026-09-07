"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/auth";
import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";
import { safeReturnPath } from "@/lib/auth-return-path";

type OrgItem = {
  id: string;
  name: string;
  needs_naming: boolean;
  brand_id: string;
  role: "owner" | "admin";
};

function OrgSelectInner() {
  const router = useRouter();
  const params = useSearchParams();
  const brand = useBrand();
  const next = safeReturnPath(params.get("next")) ?? "/dashboard";

  const [orgs, setOrgs] = useState<OrgItem[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        router.replace("/login");
        return;
      }
      const res = await fetch("/api/organizations/list", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to load organizations.");
        setOrgs([]);
        return;
      }
      const list: OrgItem[] = data.organizations ?? [];
      setOrgs(list);
      setSelectedId((data.selectedOrgId as string | null) ?? null);

      // If they don't actually have a choice to make, skip the page entirely.
      if (list.length < 2) {
        router.replace(next);
      }
    };
    void load();
  }, [router, next]);

  const handlePick = async (orgId: string) => {
    setSubmitting(orgId);
    setError(null);
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
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to select organization.");
        setSubmitting(null);
        return;
      }
      router.replace(next);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(null);
    }
  };

  if (orgs === null) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] py-12 px-4">
        <div className="max-w-xl mx-auto">
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
            <h1 className="font-serif text-[26px] text-[#0D2B35] mb-1">Choose an organization</h1>
            <p className="text-[13px] text-[#5A8399] mb-6">
              You belong to more than one organization on {brand.name}. Pick which one to use right now — you can switch any time.
            </p>

            {error && (
              <p className="mb-4 text-[13px] text-red-600">{error}</p>
            )}

            <ul className="divide-y divide-[#0E96B0]/10">
              {orgs.map((o) => {
                const isCurrent = o.id === selectedId;
                const isSubmitting = submitting === o.id;
                return (
                  <li key={o.id} className="py-3">
                    <button
                      type="button"
                      onClick={() => handlePick(o.id)}
                      disabled={!!submitting}
                      className="w-full flex items-center justify-between gap-3 px-3 py-3 rounded-xl hover:bg-[#F4FAFB] disabled:opacity-60 disabled:cursor-not-allowed text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[15px] font-medium text-[#0D2B35] truncate">
                          {o.needs_naming ? "Untitled organization" : o.name}
                          {isCurrent && (
                            <span className="ml-2 inline-block px-2 py-0.5 rounded-full bg-[#E6F6F8] text-[#0E96B0] text-[11px] font-semibold align-middle">
                              Current
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-[#5A8399]">
                          {o.role === "owner" ? "Owner" : "Co-admin"}
                        </div>
                      </div>
                      <div className="text-[13px] font-semibold text-[#0E96B0] shrink-0">
                        {isSubmitting ? "Opening…" : "Open →"}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </main>
    </>
  );
}

export default function OrgSelectPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
          <LoadingSpinner size="lg" />
        </main>
      }
    >
      <OrgSelectInner />
    </Suspense>
  );
}
