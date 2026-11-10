import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CreateLayoutFixture from "./CreateLayoutFixture";

/**
 * Test fixture for the phone layout regression test (e2e/iphone-layout.spec.ts):
 * the real create form inside the same page shell as /create, with no sign-in
 * and no saving. Never served on production.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create form layout check",
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
};

export default function Page() {
  const env = process.env;
  const enabled =
    env.VERCEL_ENV !== "production" &&
    (env.VERCEL_ENV === "preview" || env.NODE_ENV !== "production" || env.LAYOUT_FIXTURE === "1");
  if (!enabled) notFound();
  return <CreateLayoutFixture />;
}
