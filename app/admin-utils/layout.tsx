import type { Metadata } from "next";
import { AdminUtilsAuthGate } from "@/components/AdminUtilsAuthGate";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
    googleBot: { index: false, follow: false },
  },
};

export default function AdminUtilsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AdminUtilsAuthGate>{children}</AdminUtilsAuthGate>;
}
