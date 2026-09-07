import { createClient } from "@supabase/supabase-js";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  // Org-scoped RLS on campaigns blocks anon `select * from campaigns`; the public
  // RPC is SECURITY DEFINER and exposes only the public-safe columns.
  const { data } = await supabase.rpc("get_public_campaign", { campaign_id: id } as never);
  const row = Array.isArray(data) ? data[0] : data;
  const title = (row as { name?: string } | null)?.name ?? "Ward Signup";
  const description = (row as { description?: string | null } | null)?.description ?? "Sign up for an available time slot.";

  const fbAppId = process.env.NEXT_PUBLIC_FB_APP_ID;

  return {
    title,
    openGraph: {
      title,
      description,
      url: `/event/${id}`,
      type: "website",
      // images intentionally omitted — Next.js auto-uses opengraph-image.tsx in this directory
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    // fb:app_id — optional but suppresses Facebook debugger warning
    ...(fbAppId ? { other: { "fb:app_id": fbAppId } } : {}),
  };
}

export default function EventLayout({ children }: { children: React.ReactNode }) {
  return children;
}
