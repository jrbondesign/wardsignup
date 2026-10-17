import type { Metadata } from "next";

export const metadata: Metadata = {
  referrer: "no-referrer",
};

export default function AcceptLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
