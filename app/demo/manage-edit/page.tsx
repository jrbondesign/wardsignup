import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DemoManageEdit from "./DemoManageEdit";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo: Manage and Edit (preview only)",
  robots: { index: false, follow: false, nocache: true },
};

/** Preview only review page with mock data. No Supabase, no auth. 404s in production. */
export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <DemoManageEdit />;
}
