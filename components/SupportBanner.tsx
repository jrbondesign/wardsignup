"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SUPPORT_BANNER_DISMISSED_KEY,
  isSupportBannerEnabled,
  supportPagePath,
} from "@/lib/tip-jar";
import { useBrand } from "@/components/BrandProvider";

/**
 * Thin dismissible homepage banner. Gated by NEXT_PUBLIC_SUPPORT_BANNER_ENABLED.
 * Fixed just below the marketing nav so the full-bleed hero stays intact.
 */
export default function SupportBanner() {
  const brand = useBrand();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isSupportBannerEnabled(brand)) {
      setShow(false);
      return;
    }
    try {
      if (localStorage.getItem(SUPPORT_BANNER_DISMISSED_KEY) === "1") {
        setShow(false);
        return;
      }
    } catch {
      // show anyway
    }
    setShow(true);
  }, [brand]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SUPPORT_BANNER_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div
      role="region"
      aria-label="Support the project"
      className="fixed top-[60px] sm:top-[66px] left-0 right-0 z-[999] flex items-center justify-center gap-3 px-4 py-2.5 bg-[#054F64]/95 backdrop-blur-[12px] text-white/90 text-[13px] sm:text-[14px] leading-snug border-b border-white/10"
    >
      <p className="m-0 text-center max-w-[920px]">
        Ward Signup is free and always will be. Help cover hosting costs.{" "}
        <Link
          href={supportPagePath()}
          className="font-semibold text-white underline underline-offset-2 hover:text-white/90"
        >
          Support the Project
        </Link>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss"
        className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors bg-transparent border-none cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );
}
