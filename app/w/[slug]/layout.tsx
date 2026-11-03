import type { Metadata } from "next";

// The ward page is a client component, so its robots meta has to come from
// this server layout (next/head is ignored in the App Router). Paired with the
// X-Robots-Tag header for /w/:path* in next.config.js.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function WardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
