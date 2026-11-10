import { createServiceRoleClient } from "@/lib/supabase-admin";
import { BuildNextForm } from "./BuildNextForm";
import MarketingNav from "@/components/MarketingNav";
import MarketingFooter from "@/components/MarketingFooter";

export const dynamic = "force-dynamic";

type TokenState = "ok" | "already_voted" | "invalid";

async function lookupToken(
  token: string,
): Promise<{ state: TokenState; brandId: string | null }> {
  if (!token || token.length > 128 || !/^[a-f0-9]+$/i.test(token)) {
    return { state: "invalid", brandId: null };
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { state: "invalid", brandId: null };
  }
  const admin = createServiceRoleClient();
  const { data, error } = await admin
    .from("feedback_requests")
    .select("vote_submitted_at, brand_id")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { state: "invalid", brandId: null };
  const { vote_submitted_at, brand_id } = data as { vote_submitted_at: string | null; brand_id: string };
  if (vote_submitted_at) {
    return { state: "already_voted", brandId: brand_id };
  }
  return { state: "ok", brandId: brand_id };
}

export default async function BuildNextPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { state } = await lookupToken(token);

  return (
    <div className="min-h-screen bg-[#F4FAFB]">
      <MarketingNav />

      <main className="pt-[94px] pb-16 px-6">
        <article className="max-w-[720px] mx-auto">
          {state === "invalid" && (
            <>
              <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
                This link isn't valid
              </h1>
              <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                The link may have been mistyped. You can always just reply to the email instead.
              </p>
            </>
          )}
          {state === "already_voted" && (
            <>
              <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
                Thanks — we already got your vote!
              </h1>
              <p className="text-[17px] leading-[1.7] text-[#2E5566]">
                If you have more to share, just reply to the email.
              </p>
            </>
          )}
          {state === "ok" && (
            <>
              <h1 className="font-serif text-[clamp(36px,6vw,52px)] tracking-[-1px] text-[#0D2B35] mb-6 leading-[1.1]">
                What should we build next?
              </h1>
              <p className="text-[17px] leading-[1.7] text-[#2E5566] mb-10">
                A few of you have asked for photos on invites and calendar sync. We are choosing what to build next and want your vote.
              </p>
              <BuildNextForm token={token} />
            </>
          )}
        </article>
      </main>

      <MarketingFooter />
    </div>
  );
}
