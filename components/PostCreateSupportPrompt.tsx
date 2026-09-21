"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  SUPPORT_PROMPT_DISMISSED_KEY,
  isTipJarEnabled,
  supportPagePath,
} from "@/lib/tip-jar";
import { useBrand } from "@/components/BrandProvider";

/**
 * Soft post-create prompt shown on the admin page after a successful create
 * (`?created=1`). Dismiss stores localStorage so it does not reappear.
 */
export default function PostCreateSupportPrompt({ visible }: { visible: boolean }) {
  const brand = useBrand();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!visible || !isTipJarEnabled(brand)) {
      setShow(false);
      return;
    }
    try {
      if (localStorage.getItem(SUPPORT_PROMPT_DISMISSED_KEY) === "1") {
        setShow(false);
        return;
      }
    } catch {
      // private mode / blocked storage — still show once this session
    }
    setShow(true);
  }, [visible, brand]);

  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(SUPPORT_PROMPT_DISMISSED_KEY, "1");
    } catch {
      // ignore
    }
    setShow(false);
  };

  return (
    <div className="mb-6 rounded-xl border-[1.5px] border-[#F9A825] bg-[#FFFBF0] px-4 py-3.5 shadow-[0_2px_12px_rgba(249,168,37,0.12)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="font-serif text-[18px] sm:text-[19px] text-[#0D2B35] tracking-[-0.2px] mb-0.5 leading-snug">
            Ward Signup is free — always.
          </h2>
          <p className="text-[13px] sm:text-[14px] leading-snug text-[#2E5566] m-0">
            If this saved you time, consider a small contribution to help cover hosting costs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5 flex-shrink-0">
          <Link
            href={supportPagePath()}
            className="inline-flex items-center gap-1.5 text-[13px] font-semibold px-4 py-2 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white no-underline shadow-[0_3px_10px_rgba(14,150,176,0.28)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_4px_14px_rgba(14,150,176,0.38)]"
          >
            Support the Project →
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="text-[13px] font-medium text-[#5A8399] hover:text-[#2E5566] transition-colors bg-transparent border-none cursor-pointer px-1 py-1"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}
