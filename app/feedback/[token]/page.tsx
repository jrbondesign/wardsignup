import { createServiceRoleClient } from "@/lib/supabase-admin";
import { publicSiteOriginAndBrandForCampaign } from "@/lib/brand/campaign-site";
import { FeedbackForm } from "./FeedbackForm";

export const dynamic = "force-dynamic";

type TokenState = "ok" | "already_submitted" | "invalid";

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
    .select("status, brand_id")
    .eq("token", token)
    .maybeSingle();
  if (error || !data) return { state: "invalid", brandId: null };
  const { status, brand_id } = data as { status: string; brand_id: string };
  if (status === "responded" || status === "triaged") {
    return { state: "already_submitted", brandId: brand_id };
  }
  return { state: "ok", brandId: brand_id };
}

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const { state, brandId } = await lookupToken(token);
  const { brand } = publicSiteOriginAndBrandForCampaign({
    brand_id: brandId ?? undefined,
  });
  const productName = brand.name;

  return (
    <div className="min-h-screen bg-gray-50 flex items-start justify-center px-4 py-16">
      <div className="w-full max-w-lg bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        {state === "invalid" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              This link isn&apos;t valid
            </h1>
            <p className="text-gray-600">
              The feedback link may have been mistyped. You can always just
              reply to the email instead — every message gets read.
            </p>
          </>
        )}
        {state === "already_submitted" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Thanks — we already got your feedback!
            </h1>
            <p className="text-gray-600">
              If you have more to share, just reply to the email.
            </p>
          </>
        )}
        {state === "ok" && (
          <>
            <h1 className="text-xl font-semibold text-gray-900 mb-2">
              Thanks for testing it out 🙏
            </h1>
            <p className="text-gray-600 mb-6">
              A few quick questions — under a minute, and a sentence or two is
              plenty.
            </p>
            <FeedbackForm token={token} productName={productName} />
          </>
        )}
      </div>
    </div>
  );
}
