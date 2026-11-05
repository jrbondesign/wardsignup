import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DemoTimeInput from "./DemoTimeInput";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo: Time input with AM/PM (preview only)",
  robots: { index: false, follow: false, nocache: true },
};

/** Preview only review page. 404s in production. */
export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <DemoTimeInput />;
}
