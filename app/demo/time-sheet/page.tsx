import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DemoTimeSheet from "./DemoTimeSheet";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo: time sheet picker (preview only)",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Preview only review page for the Option A time sheet, with fake data and
 * local state. No Supabase, no auth, no API calls (middleware skips /demo/).
 * 404s in production. Remove before merging the time sheet PR.
 */
export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <DemoTimeSheet />;
}
