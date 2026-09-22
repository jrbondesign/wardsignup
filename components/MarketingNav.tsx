"use client";

import React from "react";
import Link from "next/link";
import Image from "next/image";
import { useBrand } from "@/components/BrandProvider";
import { isTipJarEnabled, supportPagePath } from "@/lib/tip-jar";

export default function MarketingNav() {
  const brand = useBrand();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const showSupport = isTipJarEnabled(brand);

  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    if (mobileMenuOpen) {
      document.addEventListener("keydown", handleEscape);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  return (
    <>
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[1000] flex items-center justify-between px-4 sm:px-10 h-[60px] sm:h-[66px] bg-[#F4FAFB]/92 backdrop-blur-[16px] border-b border-[#0E96B0]/10">
        <Link href="/" className="flex items-center gap-2 sm:gap-2.5 no-underline flex-shrink-0 min-w-0">
          <Image
            src={brand.logoSrc}
            alt={brand.logoAlt}
            width={32}
            height={32}
            unoptimized={brand.logoSrc.endsWith(".svg")}
            className="rounded-[8px] flex-shrink-0"
          />
          <span className="font-serif text-xl sm:text-2xl text-[#0D2B35] tracking-[0.5px]" style={{ WebkitTextStroke: "0.4px #0D2B35" }}>
            {brand.name}
          </span>
          <span className="hidden sm:inline text-[10px] font-bold tracking-[0.9px] uppercase bg-[#22C8D8]/15 text-[#08647E] border border-[#0E96B0]/28 px-2.5 py-1 rounded-full whitespace-nowrap self-center">
            Free
          </span>
        </Link>
        
        {/* Desktop nav links */}
        <div className="hidden md:flex items-center gap-1.5">
          <Link href="/about" className="text-sm font-medium px-4 py-2 rounded-full text-[#2E5566] hover:text-[#0D2B35] hover:bg-[#0E96B0]/8 no-underline transition-all">
            About
          </Link>
          <Link href="/faq" className="text-sm font-medium px-4 py-2 rounded-full text-[#2E5566] hover:text-[#0D2B35] hover:bg-[#0E96B0]/8 no-underline transition-all">
            FAQ
          </Link>
          {showSupport && (
          <Link href={supportPagePath()} className="text-sm font-medium px-4 py-2 rounded-full text-[#2E5566] hover:text-[#0D2B35] hover:bg-[#0E96B0]/8 no-underline transition-all">
            Support the Project
          </Link>
          )}
          <Link href="/use-cases" className="text-sm font-medium px-4 py-2 rounded-full text-[#2E5566] hover:text-[#0D2B35] hover:bg-[#0E96B0]/8 no-underline transition-all">
            Use cases
          </Link>
        </div>

        {/* Desktop action buttons */}
        <div className="hidden md:flex items-center gap-1.5 flex-shrink-0">
          <Link href="/login" className="text-sm font-medium px-[18px] py-2 rounded-full bg-transparent border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline whitespace-nowrap transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]">
            Sign In
          </Link>
          <Link href="/create" className="text-sm font-semibold px-[22px] py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline whitespace-nowrap shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)]">
            Get Started
          </Link>
        </div>

        {/* Mobile: Get Started + Hamburger */}
        <div className="flex md:hidden items-center gap-2 flex-shrink-0">
          <Link href="/create" className="text-sm font-semibold px-4 py-2 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline whitespace-nowrap shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200">
            Get Started
          </Link>
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex items-center justify-center w-9 h-9 rounded-xl text-[#2E5566] hover:bg-[#0E96B0]/8 transition-colors"
            aria-label={mobileMenuOpen ? "Close menu" : "Menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
                <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
            )}
          </button>
        </div>
      </nav>

      {/* Mobile menu drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-[999] top-[60px]">
          <div className="absolute inset-0 bg-[#0D2B35]/20 backdrop-blur-[2px]" onClick={() => setMobileMenuOpen(false)} />
          <div className="absolute top-0 right-0 w-64 h-full bg-white shadow-[-8px_0_32px_rgba(8,100,126,0.12)] flex flex-col">
            <div className="flex flex-col p-4 gap-1 flex-1">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] px-3 py-2 mb-1">
                Menu
              </div>
              <Link href="/about" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
                About
              </Link>
              <Link href="/faq" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                FAQ
              </Link>
              {showSupport && (
              <Link href={supportPagePath()} onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
                </svg>
                Support the Project
              </Link>
              )}
              <Link href="/use-cases" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
                </svg>
                Use cases
              </Link>
              <div className="my-2 border-t border-[#0E96B0]/10"/>
              <Link href="/login" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Sign In
              </Link>
              <Link href="/privacy" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
                Privacy Policy
              </Link>
              <Link href="/terms" onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
