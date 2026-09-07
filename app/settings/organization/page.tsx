"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/auth";
import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";
import OrgMembersSection from "@/components/OrgMembersSection";
import OrgSwitcher from "@/components/OrgSwitcher";
import { getCurrentOrganization } from "@/lib/organizations";

type OrgRow = { id: string; name: string; needs_naming: boolean; owner_id: string };

export default function OrganizationSettingsPage() {
  const router = useRouter();
  const brand = useBrand();
  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [name, setName] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const load = async () => {
      const supabase = createClientComponentClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      setUserId(authUser.id);

      // Honor the saved selection so multi-org users land on the org they picked.
      const current = await getCurrentOrganization(supabase, authUser, brand.id);
      let row: OrgRow | null = null;
      if (current) {
        const { data } = await supabase
          .from("organizations")
          .select("id, name, needs_naming, owner_id")
          .eq("id", current.id)
          .maybeSingle();
        row = (data as OrgRow | null) ?? null;
      }
      setOrg(row);
      setName(row?.name && row.name !== "Untitled organization" ? row.name : "");
      setLoading(false);
    };
    load();
  }, [router, brand.id]);

  const handleLeave = async () => {
    if (!org) return;
    if (!confirm("Leave this organization? You'll lose access to its events immediately.")) return;
    setLeaving(true);
    setMessage(null);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/organizations/${org.id}/leave`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Failed to leave organization." });
        setLeaving(false);
        return;
      }
      // Bounce to the chooser if they still belong to multiple orgs; otherwise the
      // dashboard will fall through to its default-selection logic.
      const listRes = await fetch("/api/organizations/list", {
        headers: { Authorization: `Bearer ${session?.access_token ?? ""}` },
      });
      const listData = (await listRes.json().catch(() => ({}))) as { organizations?: unknown[] };
      const remaining = listData.organizations?.length ?? 0;
      router.replace(remaining >= 2 ? "/orgs/select" : "/dashboard");
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
      setLeaving(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setMessage({ kind: "error", text: "Please enter a name." });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`/api/organizations/${org.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage({ kind: "error", text: data?.error ?? "Failed to update organization." });
        setSaving(false);
        return;
      }
      setOrg({ ...org, name: trimmed, needs_naming: false });
      setMessage({ kind: "ok", text: "Saved." });
    } catch {
      setMessage({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (!org) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4">
          <div className="max-w-2xl mx-auto bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">No organization yet</h1>
            <p className="text-sm text-[#5A8399] mb-5">
              Create your first event to set up your organization.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)]"
            >
              Create event
            </Link>
          </div>
        </main>
      </>
    );
  }

  const isOwner = userId === org.owner_id;

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E]"
            >
              ← Back to events
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h1 className="font-serif text-[26px] text-[#0D2B35]">Organization settings</h1>
              <OrgSwitcher />
            </div>
            <p className="text-[13px] text-[#5A8399] mb-6">
              This is the team that owns your events on {brand.name}.
            </p>

            <form onSubmit={handleSave}>
              <label htmlFor="org-name" className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
                Name
              </label>
              <input
                id="org-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!isOwner}
                placeholder="e.g. Sossaman Estates Ward EQ"
                maxLength={120}
                className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60 disabled:bg-[#F4FAFB] disabled:cursor-not-allowed"
              />

              {message && (
                <p className={`mt-2 text-[13px] ${message.kind === "ok" ? "text-[#0F6E56]" : "text-red-600"}`}>
                  {message.text}
                </p>
              )}

              {isOwner && (
                <div className="mt-5">
                  <button
                    type="submit"
                    disabled={saving}
                    className="text-sm font-semibold px-6 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
                  >
                    {saving ? "Saving…" : "Save changes"}
                  </button>
                </div>
              )}
            </form>
          </div>

          <OrgMembersSection organizationId={org.id} isOwner={isOwner} />

          {!isOwner && (
            <section className="mt-6 bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
              <h2 className="font-serif text-[18px] text-[#0D2B35] mb-1">Leave this organization</h2>
              <p className="text-[13px] text-[#5A8399] mb-4">
                You&rsquo;ll lose access to this organization&rsquo;s events. The owner can re-invite you later.
              </p>
              <button
                type="button"
                onClick={handleLeave}
                disabled={leaving}
                className="text-[13px] font-semibold px-4 py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                {leaving ? "Leaving…" : "Leave organization"}
              </button>
            </section>
          )}
        </div>
      </main>
    </>
  );
}
