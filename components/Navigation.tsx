"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useBrand } from "@/components/BrandProvider";
import { createClientComponentClient } from "@/lib/auth";

export default function Navigation() {
  const brand = useBrand();
  const router = useRouter();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const supabase = createClientComponentClient();
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      setLoading(false);
    };
    getUser();
  }, []);

  const handleSignOut = async () => {
    const supabase = createClientComponentClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  if (loading || !user) return null;

  const isFounder = user.email === "bondesign@gmail.com";

  return (
    <>
      <nav className="sticky top-0 z-[100] flex items-center justify-between px-4 sm:px-8 h-[60px] sm:h-[66px] bg-[#F4FAFB]/92 backdrop-blur-[16px] border-b border-[#0E96B0]/10">
        {/* Logo */}
        <Link href="/dashboard" className="flex items-center gap-2 sm:gap-2.5 no-underline flex-shrink-0 min-w-0">
          <Image
            src={brand.logoSrc}
            alt={brand.logoAlt}
            width={32}
            height={32}
            unoptimized={brand.logoSrc.endsWith(".svg")}
            className="rounded-[8px] flex-shrink-0"
          />
          <span className="font-serif text-xl sm:text-2xl text-[#0D2B35] tracking-[0.5px]"
                style={{ WebkitTextStroke: "0.4px #0D2B35" }}>
            {brand.name}
          </span>
          <span className="hidden sm:inline text-[10px] font-bold tracking-[0.9px] uppercase bg-[#22C8D8]/15 text-[#08647E] border border-[#0E96B0]/28 px-2.5 py-1 rounded-full whitespace-nowrap self-center">
            Free Beta
          </span>
        </Link>

        {/* Nav links — desktop only */}
        <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
          <Link href="/dashboard" className="text-sm font-medium text-[#2E5566] hover:text-[#0D2B35] px-4 py-2 rounded-full hover:bg-[#0E96B0]/8 transition-all no-underline">
            My Events
          </Link>
          <Link href="/create" className="text-sm font-medium text-[#2E5566] hover:text-[#0D2B35] px-4 py-2 rounded-full hover:bg-[#0E96B0]/8 transition-all no-underline">
            Create Event
          </Link>
          {isFounder && (
            <Link href="/admin/metrics" className="text-sm font-medium text-[#2E5566] hover:text-[#0D2B35] px-4 py-2 rounded-full hover:bg-[#0E96B0]/8 transition-all no-underline">
              Metrics
            </Link>
          )}
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <span className="text-sm text-[#5A8399] hidden lg:block truncate max-w-[200px]">
            {user.email}
          </span>
          {/* Desktop sign out */}
          <button
            onClick={handleSignOut}
            className="hidden md:block text-sm font-medium px-3 sm:px-[18px] py-2 rounded-full border-[1.5px] border-[#0E96B0]/40 text-[#08647E] bg-transparent hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all whitespace-nowrap"
          >
            Sign Out
          </button>
          {/* Hamburger — mobile only */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden flex items-center justify-center w-9 h-9 rounded-xl text-[#2E5566] hover:bg-[#0E96B0]/8 transition-colors"
            aria-label="Menu"
          >
            {menuOpen ? (
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
      {menuOpen && (
        <div className="md:hidden fixed inset-0 z-[99] top-[60px]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-[#0D2B35]/20 backdrop-blur-[2px]" onClick={() => setMenuOpen(false)} />
          {/* Panel */}
          <div className="absolute top-0 right-0 w-64 h-full bg-white shadow-[−8px_0_32px_rgba(8,100,126,0.12)] flex flex-col">
            <div className="flex flex-col p-4 gap-1 flex-1">
              <div className="text-[11px] font-semibold text-[#5A8399] uppercase tracking-[0.5px] px-3 py-2">
                {user.email}
              </div>
              <Link href="/dashboard" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
                My Events
              </Link>
              <Link href="/create" onClick={() => setMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Create Event
              </Link>
              {isFounder && (
                <Link href="/admin/metrics" onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium text-[#0D2B35] hover:bg-[#F4FAFB] transition-colors no-underline">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 text-[#5A8399]">
                    <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
                  </svg>
                  Metrics
                </Link>
              )}
            </div>
            <div className="p-4 border-t border-[rgba(14,150,176,0.10)]">
              <button onClick={handleSignOut}
                className="w-full text-sm font-medium px-4 py-3 rounded-xl border-[1.5px] border-[#0E96B0]/40 text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all">
                Sign Out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
