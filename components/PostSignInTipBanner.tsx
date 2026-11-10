"use client";

import { useState, useSyncExternalStore } from "react";
import {
  POST_SIGNIN_TIP_DISMISSED_KEY,
  isTipJarEnabled,
  tipJarOutboundUrl,
} from "@/lib/tip-jar";
import { useBrand } from "@/components/BrandProvider";

/**
 * Dismissible tip-jar notice on the organizer dashboard (post sign-in home).
 * Points at the current tip jar URL (Venmo). Dismiss stores localStorage.
 */
const subscribeNoop = () => () => {};

function readDismissed(): boolean {
  try {
    return localStorage.getItem(POST_SIGNIN_TIP_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export default function PostSignInTipBanner() {
  const brand = useBrand();
  const storedDismissed = useSyncExternalStore(subscribeNoop, readDismissed, () => true);
  const [dismissed, setDismissed] = useState(false);
  const tipUrl = tipJarOutboundUrl(brand, {
    utm_source: "dashboard",
    utm_medium: "web",
    utm_campaign: "post_signin_tip",
  });
  const show = isTipJarEnabled(brand) && Boolean(tipUrl) && !storedDismissed && !dismissed;

  if (!show || !tipUrl) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(POST_SIGNIN_TIP_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setDismissed(true);
  };

  return (
    <div
      role="region"
      aria-label="Optional tip jar"
      className="mb-6 rounded-xl border-[1.5px] border-[#F9A825] bg-[#FFFBF0] px-4 py-3.5 shadow-[0_2px_12px_rgba(249,168,37,0.12)]"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[18px] sm:text-[19px] text-[#0D2B35] tracking-[-0.2px] mb-0.5 leading-snug">
            Optional tip jar is on Venmo now
          </h2>
          <p className="text-[13px] sm:text-[14px] leading-snug text-[#2E5566] m-0">
            A small contribution helps cover hosting. Support is never required.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          <a
            href={tipUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline shadow-[0_3px_10px_rgba(14,150,176,0.28)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_4px_14px_rgba(14,150,176,0.38)]"
          >
            Tip on Venmo →
          </a>
          <button
            type="button"
            onClick={dismiss}
            className="text-[13px] font-medium text-[#5A8399] hover:text-[#2E5566] transition-colors bg-transparent border-none cursor-pointer px-1 py-1"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
