import { notFound } from "next/navigation";
import type { Metadata } from "next";
import FounderMetricsPage from "@/components/metrics/FounderMetricsPage";
import { founderMetricsFixture } from "./fixture";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Demo: Founder metrics (preview only)",
  robots: { index: false, follow: false, nocache: true },
};

/** Preview only review page with synthetic metrics. No auth, no production data. 404s in production. */
export default function Page() {
  if (process.env.VERCEL_ENV === "production") notFound();
  return <FounderMetricsPage preview={founderMetricsFixture} />;
}
