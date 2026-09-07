"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/auth";
import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Status = "loading" | "needs_login" | "accepting" | "ok" | "error";

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus("error");
        setMessage("Missing invite token.");
        return;
      }
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setStatus("needs_login");
        return;
      }
      setStatus("accepting");
      const res = await fetch("/api/organizations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus("error");
        setMessage(data?.error ?? "Failed to accept invitation.");
        return;
      }
      setStatus("ok");
    };
    run();
  }, [token]);

  if (status === "loading" || status === "accepting") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="lg" className="mb-4" />
        <p className="text-sm text-[#5A8399]">Accepting invitation…</p>
      </main>
    );
  }

  if (status === "needs_login") {
    const next = encodeURIComponent(`/orgs/accept?token=${encodeURIComponent(token)}`);
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">Sign in to accept</h1>
            <p className="text-sm text-[#5A8399] mb-5">
              Sign in with the email address that received this invitation.
            </p>
            <Link
              href={`/login?next=${next}`}
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)]"
            >
              Sign in
            </Link>
          </div>
        </main>
      </>
    );
  }

  if (status === "ok") {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">You're in</h1>
            <p className="text-sm text-[#5A8399] mb-5">
              You can now manage events for this organization.
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)]"
            >
              Go to events
            </button>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
          <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">We couldn't accept this invitation</h1>
          <p className="text-sm text-red-600 mb-5">{message}</p>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full border-[1.5px] border-[#0E96B0]/30 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all"
          >
            Back to events
          </Link>
        </div>
      </main>
    </>
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
          <LoadingSpinner size="lg" />
        </main>
      }
    >
      <AcceptInner />
    </Suspense>
  );
}
