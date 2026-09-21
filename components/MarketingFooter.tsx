"use client";

import Link from "next/link";
import Image from "next/image";
import { useBrand } from "@/components/BrandProvider";
import { isTipJarEnabled, supportPagePath } from "@/lib/tip-jar";

export default function MarketingFooter() {
  const brand = useBrand();
  const year = new Date().getFullYear();
  const isWardBrand = brand.id === "wardsignup";
  const showSupport = isTipJarEnabled(brand);

  return (
    <footer className="bg-[#054F64] px-10 pt-9 pb-6">
      <div className="max-w-[1080px] mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
        <Link href="/" className="flex items-center gap-2.5 no-underline">
          <Image
            src={brand.logoSrc}
            alt={brand.logoAlt}
            width={28}
            height={28}
            unoptimized={brand.logoSrc.endsWith(".svg")}
            className="rounded-lg flex-shrink-0"
          />
          <span className="font-serif text-lg text-white/65 tracking-[0.5px]" style={{ WebkitTextStroke: "0.4px rgba(255,255,255,0.65)" }}>
            {brand.name}
          </span>
        </Link>
        <div className="flex gap-6 flex-wrap">
          {isWardBrand && (
            <Link href="/use-cases/tithing-declaration" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Tithing Signup
            </Link>
          )}
          {isWardBrand && (
            <Link href="/ad-free" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Ad free sheets
            </Link>
          )}
          <Link href="/privacy" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
            Terms of Service
          </Link>
          {showSupport && (
            <Link href={supportPagePath()} className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Support the Project
            </Link>
          )}
          <a href={`mailto:${brand.supportEmail}`} className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
            Contact
          </a>
        </div>
      </div>
      <div className="max-w-[1080px] mx-auto mt-4 pt-4 border-t border-white/8 text-center text-[13px] text-white/28 space-y-1.5">
        <div>© {year} {brand.name}. All rights reserved.</div>
        <div className="text-white/35">Made with ♥ from Arizona</div>
        {isWardBrand && (
          <div className="text-white/30 text-xs pt-2">
            Independent of The Church of Jesus Christ of Latter-day Saints
          </div>
        )}
      </div>
    </footer>
  );
}
