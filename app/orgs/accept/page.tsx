"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClientComponentClient } from "@/lib/auth";
import Navigation from "@/components/Navigation";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { maskEmail } from "@/lib/email-mask";
import { usePostHog } from "posthog-js/react";

type Status =
  | "loading_invite"
  | "needs_magic_link"
  | "sending_link"
  | "link_sent"
  | "accepting"
  | "accepted"
  | "wrong_account"
  | "error";

type InviteInfo = {
  organizationName: string;
  maskedEmail: string;
  inviterDisplayName?: string;
};

type ErrorType =
  | "missing_token"
  | "invite_not_found"
  | "invite_expired"
  | "invite_revoked"
  | "invite_already_used"
  | "ward_deleted"
  | "email_mismatch"
  | "generic";

function AcceptInner() {
  const router = useRouter();
  const params = useSearchParams();
  const posthog = usePostHog();
  const token = params.get("token") ?? "";
  const [status, setStatus] = useState<Status>("loading_invite");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [userEmail, setUserEmail] = useState<string>("");
  const [errorType, setErrorType] = useState<ErrorType | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [organizationId, setOrganizationId] = useState<string>("");

  useEffect(() => {
    // Remove token from URL for security (after reading it)
    if (token && typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (url.searchParams.has("token")) {
        posthog?.capture("invite_card_viewed");
      }
    }
  }, [token, posthog]);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setStatus("error");
        setErrorType("missing_token");
        setErrorMessage("Missing invite token.");
        posthog?.capture("invite_error", { type: "missing_token" });
        return;
      }

      const supabase = createClientComponentClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        // Fetch invite info to show on landing page
        const res = await fetch("/api/organizations/invite-info", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setStatus("error");
          if (res.status === 404) {
            setErrorType("invite_not_found");
            setErrorMessage("This invitation was not found.");
          } else if (res.status === 410) {
            const msg = data?.error ?? "";
            if (msg.includes("expired")) {
              setErrorType("invite_expired");
              setErrorMessage("This invitation has expired.");
            } else if (msg.includes("revoked")) {
              setErrorType("invite_revoked");
              setErrorMessage("This invitation has been revoked.");
            } else if (msg.includes("already")) {
              setErrorType("invite_already_used");
              setErrorMessage("This invitation has already been used.");
            } else {
              setErrorType("generic");
              setErrorMessage(data?.error ?? "Failed to load invitation.");
            }
          } else {
            setErrorType("generic");
            setErrorMessage(data?.error ?? "Failed to load invitation.");
          }
          posthog?.capture("invite_error", { type: errorType ?? "generic" });
          return;
        }

        const data = await res.json();
        setInviteInfo({
          organizationName: data.organizationName,
          maskedEmail: data.maskedInvitedEmail,
          inviterDisplayName: data.inviterDisplayName,
        });
        setStatus("needs_magic_link");
        return;
      }

      // User is signed in - check if it's the right account
      const user = session.user;
      setUserEmail(user.email ?? "");

      // Get invite email for comparison
      const infoRes = await fetch("/api/organizations/invite-info", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });

      if (!infoRes.ok) {
        const data = await infoRes.json().catch(() => ({}));
        setStatus("error");
        setErrorType("generic");
        setErrorMessage(data?.error ?? "Failed to load invitation.");
        posthog?.capture("invite_error", { type: "generic" });
        return;
      }

      const infoData = await infoRes.json();
      
      // Server will validate the actual email match
      // We just need to try acceptance and let it handle the validation
      setInviteInfo({
        organizationName: infoData.organizationName,
        maskedEmail: infoData.maskedInvitedEmail,
        inviterDisplayName: infoData.inviterDisplayName,
      });

      // Correct account - accept the invite
      setStatus("accepting");
      const acceptRes = await fetch("/api/organizations/accept", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });

      const acceptData = await acceptRes.json().catch(() => ({}));

      if (!acceptRes.ok) {
        // Check for email mismatch error
        if (acceptRes.status === 403 && acceptData?.error?.toLowerCase().includes("mismatch")) {
          setStatus("wrong_account");
          setUserEmail(user.email ?? "");
          posthog?.capture("invite_error", { type: "email_mismatch" });
          return;
        }
        
        setStatus("error");
        setErrorType("generic");
        setErrorMessage(acceptData?.error ?? "Failed to accept invitation.");
        posthog?.capture("invite_error", { type: "accept_failed" });
        return;
      }

      posthog?.capture("accept_success", {
        organization_id: acceptData.organization_id,
        ownership_transferred: acceptData.ownership_transferred,
      });
      
      // Navigate to the destination determined by the server
      const destination = acceptData.destination ?? "/dashboard";
      router.push(destination);
    };

    run();
  }, [token, router, posthog]);

  const handleRequestMagicLink = async () => {
    setStatus("sending_link");
    posthog?.capture("magic_link_requested");

    const res = await fetch("/api/organizations/invite-magic-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus("error");
      setErrorType("generic");
      setErrorMessage(data?.error ?? "Failed to send sign in link.");
      posthog?.capture("invite_error", { type: "magic_link_failed" });
      return;
    }

    setStatus("link_sent");
  };

  const handleSignOut = async () => {
    const supabase = createClientComponentClient();
    await supabase.auth.signOut();
    router.refresh();
  };

  if (status === "loading_invite" || status === "accepting" || status === "sending_link") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-8 bg-[#F4FAFB]">
        <LoadingSpinner size="lg" className="mb-4" />
        <p className="text-sm text-[#5A8399]">
          {status === "accepting"
            ? "Accepting invitation…"
            : status === "sending_link"
              ? "Sending sign in link…"
              : "Loading invitation…"}
        </p>
      </main>
    );
  }

  if (status === "needs_magic_link" && inviteInfo) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8">
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3 text-center">
              You're invited
            </h1>
            <div className="bg-[#E6F7FB] border border-[rgba(14,150,176,0.18)] rounded-xl px-5 py-4 mb-5">
              <p className="text-sm text-[#2E5566] mb-1">
                <strong className="text-[#0D2B35] font-semibold">Ward:</strong>{" "}
                {inviteInfo.organizationName}
              </p>
              {inviteInfo.inviterDisplayName && (
                <p className="text-sm text-[#2E5566] mb-1">
                  <strong className="text-[#0D2B35] font-semibold">Invited by:</strong>{" "}
                  {inviteInfo.inviterDisplayName}
                </p>
              )}
              <p className="text-sm text-[#2E5566]">
                <strong className="text-[#0D2B35] font-semibold">Invited:</strong>{" "}
                {inviteInfo.maskedEmail}
              </p>
            </div>
            <p className="text-sm text-[#5A8399] mb-5 text-center">
              Click below to receive a sign in link at the invited email address.
            </p>
            <button
              onClick={handleRequestMagicLink}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] transition-all"
            >
              Email me a sign in link
            </button>
          </div>
        </main>
      </>
    );
  }

  if (status === "link_sent" && inviteInfo) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#1D9E75] to-[#0F6E56] flex items-center justify-center mx-auto mb-4">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-white"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">Check your email</h1>
            <p className="text-sm text-[#5A8399] leading-relaxed mb-6">
              We sent a sign in link to <strong className="text-[#0D2B35] font-semibold">{inviteInfo.maskedEmail}</strong>.<br />
              Click the link in your email to accept the invitation.
            </p>
          </div>
        </main>
      </>
    );
  }

  if (status === "wrong_account" && inviteInfo) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
            <h1 className="font-serif text-[22px] text-[#0D2B35] mb-3">Wrong account</h1>
            <p className="text-sm text-[#5A8399] mb-2">
              You're signed in as <strong className="text-[#0D2B35] font-semibold">{userEmail}</strong>
            </p>
            <p className="text-sm text-[#5A8399] mb-5">
              This invite is for <strong className="text-[#0D2B35] font-semibold">{inviteInfo.maskedEmail}</strong>
            </p>
            <button
              onClick={handleSignOut}
              className="w-full inline-flex items-center justify-center gap-2 text-sm font-semibold px-6 py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] transition-all"
            >
              Switch account
            </button>
          </div>
        </main>
      </>
    );
  }

  // This state is no longer reached - we navigate directly after acceptance

  return (
    <>
      <Navigation />
      <main className="min-h-screen bg-[#F4FAFB] py-8 px-4 flex flex-col items-center justify-center">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-8 text-center">
          <h1 className="font-serif text-[22px] text-[#0D2B35] mb-2">
            {errorType === "invite_expired"
              ? "Invitation expired"
              : errorType === "invite_revoked"
                ? "Invitation revoked"
                : errorType === "invite_already_used"
                  ? "Invitation already used"
                  : errorType === "invite_not_found"
                    ? "Invitation not found"
                    : errorType === "ward_deleted"
                      ? "Ward deleted"
                      : "We couldn't accept this invitation"}
          </h1>
          <p className="text-sm text-red-600 mb-5">{errorMessage}</p>
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
