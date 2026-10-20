import { createClient } from "@supabase/supabase-js";
import { getServerEventPage } from "@/lib/public-event-page-server";

async function eventTitleAndDescription(id: string) {
  // Shared with the page through React cache(), so this is the same read.
  const page = await getServerEventPage(id);
  if (page !== undefined) {
    return { name: page?.event.name, description: page?.event.description };
  }
  // Server load was slow or failed: keep the old metadata read so link
  // previews still get the real title. Org-scoped RLS on campaigns blocks anon
  // `select * from campaigns`; the public RPC exposes only public-safe columns.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  const { data } = await supabase.rpc("get_public_campaign", { campaign_id: id } as never);
  const row = (Array.isArray(data) ? data[0] : data) as { name?: string; description?: string | null } | null;
  return { name: row?.name, description: row?.description };
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const row = await eventTitleAndDescription(id);
  const title = row.name ?? "Ward Signup";
  const description = row.description ?? "Sign up for an available time slot.";

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
