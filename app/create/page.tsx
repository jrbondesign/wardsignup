"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClientComponentClient } from "@/lib/auth";
import { getCurrentOrganization } from "@/lib/organizations";
import { useBrand } from "@/components/BrandProvider";
import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import UnifiedCreateForm from "@/components/create/UnifiedCreateForm";
import OrgNameModal from "@/components/OrgNameModal";
import { AiEventInput } from "@/components/AiEventInput";
import { getTemplatesForBrand, type TemplateKey } from "@/lib/event-template-data";
import type { AiEventResult } from "@/lib/ai-event-extraction";
import { getMaxCampaignsForOrg, getMaxCampaignsPerUser, isUnlimitedEventsUser } from "@/lib/limits";

function CreateInner() {
  const brand = useBrand();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Templates available to this brand. Built-in templates are Ward-only (LDS copy);
  // other brands simply see none until brand-neutral templates are authored.
  const brandTemplates = useMemo(() => getTemplatesForBrand(brand.id), [brand.id]);
  const brandTemplateKeys = useMemo(
    () => new Set(brandTemplates.map((t) => t.key)),
    [brandTemplates]
  );

  // Only honor ?template= if the key is valid AND offered to this brand, so a
  // shared Ward template URL doesn't prefill on ministrysignup/orgsignup.
  const rawTemplate = searchParams.get("template") ?? "";
  const initialTemplateKey: TemplateKey | null = brandTemplateKeys.has(rawTemplate as TemplateKey)
    ? (rawTemplate as TemplateKey)
    : null;

  const [aiResult, setAiResult] = useState<AiEventResult | null>(null);
  // Bumped whenever AI fires so the form remounts with a fresh baseline.
  const [aiVersion, setAiVersion] = useState(0);
  const [aiOpen, setAiOpen] = useState(false);

  // The composer owns its state; it reports whether the user has started filling it
  // in so we can confirm before a template/AI selection remounts and wipes that work.
  const formDirtyRef = useRef(false);

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [eventCount, setEventCount] = useState<number | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  type OrgState = { kind: "loading" } | { kind: "missing" } | { kind: "needsNaming"; id: string; name: string } | { kind: "ready" };
  const [orgState, setOrgState] = useState<OrgState>({ kind: "loading" });
  const [orgName, setOrgName] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      const supabase = createClientComponentClient();
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) {
        router.push("/login");
        return;
      }
      setUserEmail(authUser.email ?? null);
      // RLS scopes the count to campaigns whose org the user is a member of.
      const { count, error: countError } = await supabase
        .from("campaigns")
        .select("*", { count: "exact", head: true })
        .eq("brand_id", brand.id);
      setEventCount(countError ? 0 : (count ?? 0));

      // Honor the saved selection so multi-org users create events under the org they
      // picked, not the first one they happen to own.
      const org = await getCurrentOrganization(supabase, authUser, brand.id);
      setOrgName(org?.name ?? null);
      if (!org) setOrgState({ kind: "missing" });
      else if (org.needs_naming) setOrgState({ kind: "needsNaming", id: org.id, name: org.name });
      else setOrgState({ kind: "ready" });

      setCheckingAuth(false);
    };
    check();
  }, [router, brand.id]);

  const maxEvents = getMaxCampaignsForOrg(orgName) ?? getMaxCampaignsPerUser();
  const isUnlimited = isUnlimitedEventsUser(userEmail);
  const atLimit = !isUnlimited && eventCount !== null && eventCount >= maxEvents;

  // Stable form key — bumps when the template or AI baseline changes, remounting the
  // composer with a fresh state. Guarded below so it doesn't silently wipe edits.
  const formKey = `${initialTemplateKey ?? "blank"}-${aiVersion}`;

  // Confirm before discarding in-progress work when picking a new starting point.
  const confirmReplace = (what: string) =>
    !formDirtyRef.current || window.confirm(`Replace what you've started with ${what}?`);

  if (checkingAuth) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="lg" />
      </main>
    );
  }

  if (orgState.kind !== "ready") {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4">
          <div className="max-w-2xl mx-auto">
            <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
              <h1 className="font-serif text-[22px] text-[#0D2B35] mb-1">One quick step</h1>
              <p className="text-sm text-[#5A8399]">
                Name your organization to start creating events.
              </p>
            </div>
          </div>
        </main>
        {orgState.kind !== "loading" && (
          <OrgNameModal
            orgId={orgState.kind === "needsNaming" ? orgState.id : undefined}
            initialName={orgState.kind === "needsNaming" ? orgState.name : undefined}
            brandLabel={brand.name}
            getAccessToken={async () => {
              const supabase = createClientComponentClient();
              const { data: { session } } = await supabase.auth.getSession();
              return session?.access_token ?? null;
            }}
            onComplete={() => setOrgState({ kind: "ready" })}
            onDismiss={() => router.push("/dashboard")}
          />
        )}
      </>
    );
  }

  if (atLimit) {
    return (
      <>
        <Navigation />
        <main className="flex min-h-screen flex-col items-center justify-center p-6 bg-[#F4FAFB]">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
            <h1 className="font-serif text-[26px] text-[#0D2B35] mb-3">You&apos;re at the event limit</h1>
            <p className="text-[15px] text-[#5A8399] mb-6">
              Free beta includes up to {maxEvents} events per account ({eventCount}/{maxEvents} used).
            </p>
            <Link
              href="/dashboard"
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-3 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)]"
            >
              Go to My Events
            </Link>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] py-8 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-6">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-[#0E96B0] hover:text-[#08647E] transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
              </svg>
              Back
            </Link>
          </div>

          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-6 sm:p-8">
            <h1 className="font-serif text-[26px] text-[#0D2B35] mb-1">Create a new event</h1>
            <p className="text-[13px] text-[#5A8399] mb-5">
              Build it from the components below — or start faster with a template or AI.
            </p>

            {/* Starting points: optional accelerators that prefill the composer.
                Neither blocks the form, which is always shown below. */}
            <div className="mb-6 space-y-4 rounded-xl bg-[#F4FAFB] border border-[rgba(14,150,176,0.14)] p-4">
              {brandTemplates.length > 0 && (
                <div>
                  <div className="text-[12px] font-semibold text-[#0D2B35] mb-2">
                    Start from a template
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {brandTemplates.map((tpl) => (
                      <Link
                        key={tpl.key}
                        href={`/create?template=${tpl.key}`}
                        onClick={(e) => {
                          if (!confirmReplace(`the ${tpl.label} template`)) e.preventDefault();
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] rounded-full border-[1.5px] transition-colors ${
                          initialTemplateKey === tpl.key
                            ? "border-[#0E96B0] bg-[#E6F7FB] text-[#0D2B35] font-semibold"
                            : "border-[rgba(14,150,176,0.20)] bg-white hover:border-[#0E96B0] hover:bg-white text-[#0D2B35]"
                        }`}
                      >
                        <span>{tpl.icon}</span>
                        <span className="font-medium">{tpl.label}</span>
                      </Link>
                    ))}
                  </div>
                  {initialTemplateKey && (
                    <p className="mt-2.5 text-[12px] text-[#5A8399]">
                      Template applied — edit anything below, or{" "}
                      <Link href="/create" className="text-[#0E96B0] hover:underline">
                        clear and start over
                      </Link>
                      .
                    </p>
                  )}
                </div>
              )}

              {/* Describe with AI — collapsed by default so it stays an accelerator. */}
              <div className={brandTemplates.length > 0 ? "pt-3 border-t border-[rgba(14,150,176,0.12)]" : ""}>
                {aiOpen ? (
                  <AiEventInput
                    onResult={(result) => {
                      if (!confirmReplace("this AI-generated draft")) return;
                      setAiResult(result);
                      setAiVersion((v) => v + 1);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setAiOpen(true)}
                    className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors"
                  >
                    <span aria-hidden>✨</span> Describe it with AI instead
                  </button>
                )}
              </div>

              {brandTemplates.length > 0 && (
                <p className="text-[12px] text-[#5A8399]">
                  Don&apos;t see the template you need?{" "}
                  <a
                    href={`mailto:${brand.supportEmail}?subject=Template suggestion`}
                    className="text-[#0E96B0] hover:underline"
                  >
                    Suggest a template
                  </a>
                  .
                </p>
              )}
            </div>

            <UnifiedCreateForm
              key={formKey}
              initialTemplateKey={initialTemplateKey}
              initialAiResult={aiResult}
              onDirtyChange={(dirty) => {
                formDirtyRef.current = dirty;
              }}
            />
          </div>
        </div>
      </main>
    </>
  );
}

export default function CreateEvent() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
          <LoadingSpinner size="lg" />
        </main>
      }
    >
      <CreateInner />
    </Suspense>
  );
}
