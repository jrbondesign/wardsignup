"use client";

import Link from "next/link";
import Image from "next/image";
import { useBrand } from "@/components/BrandProvider";

/** Ward Signup (LDS) — landing examples only; ministry/org use neutral lists below. */
const WARD_HOME_USE_CASES = {
  left: [
    "Tithing declaration appointments",
    "Teaching assignments",
    "Temple recommend interviews",
    "Missionary dinners",
  ],
  right: [
    "Youth and adult interviews",
    "Service project time shifts",
    "Nursery volunteer schedules",
    "Fast Sunday signup sheets",
  ],
} as const;

const MINISTRY_HOME_USE_CASES = {
  left: [
    "Counseling or pastoral appointments",
    "Volunteer shifts and greeters",
    "Small group or class sign-ups",
    "Community meals or hospitality",
  ],
  right: [
    "Training or workshop sessions",
    "Service project time blocks",
    "Children’s ministry rotations",
    "Special events and fundraisers",
  ],
} as const;

const ORG_HOME_USE_CASES = {
  left: [
    "Volunteer shift sign-ups",
    "Meeting or appointment slots",
    "Workshop and training sessions",
    "Committee or team sign-ups",
  ],
  right: [
    "Club event time slots",
    "Service project schedules",
    "Recurring team rotations",
    "Special event registrations",
  ],
} as const;

function UseCaseCheckIcon() {
  return (
    <span className="mt-[3px] w-[18px] h-[18px] shrink-0 self-start rounded-[5px] bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] flex items-center justify-center">
      <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-2.5 h-2.5">
        <polyline points="2 6 5 9 10 3"/>
      </svg>
    </span>
  );
}

export default function Home() {
  const brand = useBrand();
  const year = new Date().getFullYear();
  const isWardBrand = brand.id === "wardsignup";
  const homeUseCases = brand.id === "wardsignup" ? WARD_HOME_USE_CASES
    : brand.id === "orgsignup" ? ORG_HOME_USE_CASES
    : MINISTRY_HOME_USE_CASES;

  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-between px-4 sm:px-10 h-[60px] sm:h-[66px] bg-[#F4FAFB]/92 backdrop-blur-[16px] border-b border-[#0E96B0]/10">
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
            Free Beta
          </span>
        </Link>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <Link href="/login" className="hidden sm:inline-flex text-sm font-medium px-[18px] py-2 rounded-full bg-transparent border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline whitespace-nowrap transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]">
            Sign In
          </Link>
          <Link href="/create" className="text-sm font-semibold px-4 sm:px-[22px] py-2 sm:py-2.5 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white border-none no-underline whitespace-nowrap shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)]">
            Get Started
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-[104px] pb-[72px] overflow-hidden bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E]">
        {/* Background gradients */}
        <div className="absolute inset-0 z-[1] pointer-events-none" style={{
          background: `radial-gradient(ellipse at 18% 28%, rgba(255,255,255,0.20) 0%, transparent 52%),
                       radial-gradient(ellipse at 80% 75%, rgba(5,79,100,0.45) 0%, transparent 55%)`
        }}/>

        {/* Watermark logo */}
        <Image
          src={brand.heroWatermarkSrc ?? "/logo-watermark.svg"}
          alt=""
          aria-hidden="true"
          width={500}
          height={500}
          priority
          loading="eager"
          unoptimized={(brand.heroWatermarkSrc ?? "/logo-watermark.svg").endsWith(".svg")}
          className="absolute right-[-40px] top-1/2 -translate-y-[52%] w-[min(500px,62vw)] opacity-[0.18] mix-blend-luminosity pointer-events-none z-0 rounded-[18%]"
        />

        <div className="relative z-[2] flex flex-col items-center text-center max-w-[660px] w-full">
          <div className="inline-flex items-start gap-2 bg-white/18 border border-white/32 text-white text-[13px] font-medium px-[18px] py-1.5 rounded-full mb-7 backdrop-blur-[8px] animate-fadeUp">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0 mt-[2px]">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            {brand.homePillText}
          </div>

          <h1 className="font-serif text-[clamp(42px,8vw,76px)] leading-[1.05] text-white tracking-[-1.5px] mb-5 animate-fadeUp" style={{ animationDelay: "0.1s" }}>
            {brand.heroLine1}
            <br />
            {brand.heroLine2Prefix}
            <em className="italic opacity-82">{brand.heroLine2Em}</em>
          </h1>

          <p className="text-[clamp(16px,2.4vw,19px)] font-normal leading-[1.65] text-white/78 mb-10 max-w-[480px] animate-fadeUp" style={{ animationDelay: "0.2s" }}>
            {brand.homeSubhead}
          </p>

          <div className="flex gap-3 flex-wrap justify-center animate-fadeUp" style={{ animationDelay: "0.3s" }}>
            <Link href="/create" className="text-base font-semibold px-8 py-3.5 rounded-full bg-white text-[#08647E] border-none no-underline shadow-[0_8px_28px_rgba(0,0,0,0.20)] transition-all duration-200 inline-flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#0E96B0" }}>
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Get Started
            </Link>
            <Link href="/login" className="text-base font-semibold px-8 py-3.5 rounded-full bg-[rgba(5,50,65,0.50)] border-[1.5px] border-white/50 text-white no-underline backdrop-blur-[8px] transition-all duration-200 hover:bg-[rgba(5,50,65,0.70)] hover:-translate-y-0.5">
              Sign In
            </Link>
          </div>

          {/* Use Cases Card */}
          <div className="relative z-[2] mt-14 bg-white rounded-[20px] shadow-[0_20px_60px_rgba(8,100,126,0.22)] p-6 sm:p-[30px_36px] max-w-[740px] w-full animate-fadeUp" style={{ animationDelay: "0.4s" }}>
            <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-[#0E96B0] mb-[18px] text-center">
              Common Use Cases
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 min-w-0">
              <div className="flex flex-col sm:pr-7 sm:border-r border-[#0E96B0]/10 min-w-0">
                {homeUseCases.left.map((label, i) => (
                  <div
                    key={label}
                    className={`flex items-start gap-2.5 py-2.5 text-left text-sm text-[#2E5566] ${
                      i < homeUseCases.left.length - 1 ? "border-b border-[#0E96B0]/7" : ""
                    }`}
                  >
                    <UseCaseCheckIcon />
                    <span className="min-w-0 flex-1 leading-snug whitespace-nowrap">{label}</span>
                  </div>
                ))}
              </div>
              <div className="flex flex-col sm:pl-7 min-w-0">
                {homeUseCases.right.map((label, i) => (
                  <div
                    key={label}
                    className={`flex items-start gap-2.5 py-2.5 text-left text-sm text-[#2E5566] ${
                      i < homeUseCases.right.length - 1 ? "border-b border-[#0E96B0]/7" : ""
                    }`}
                  >
                    <UseCaseCheckIcon />
                    <span className="min-w-0 flex-1 leading-snug whitespace-nowrap">{label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-[88px] px-6 max-w-[1080px] mx-auto">
        <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-[#0E96B0] text-center mb-2.5">
          Features
        </div>
        <h2 className="font-serif text-[clamp(28px,4vw,44px)] text-center tracking-[-0.6px] text-[#0D2B35] mb-3.5 leading-[1.15]">
          {brand.id === "wardsignup" ? "Everything your secretary needs" : "Everything your team needs"}
        </h2>
        <p className="text-[17px] text-[#5A8399] text-center max-w-[500px] mx-auto mb-14 leading-[1.65]">
          {brand.id === "wardsignup"
            ? "Designed for ward leadership — simple enough for anyone, powerful enough for every calling."
            : brand.id === "orgsignup"
            ? "Built for organizers, volunteers, and team leads — without the spreadsheet chaos."
            : "Built for church staff, volunteers, and leaders — without the spreadsheet chaos."}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Time Slots
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              Create specific days and times with a set number of spots per slot. No double-booking, ever.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Email Invites
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              Send personalized invitations with a unique link. People can sign up without creating an account.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="14"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Track Progress
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              See spots, signups, and remaining slots at a glance. Know who&apos;s confirmed and who hasn&apos;t.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Shareable Links
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              {isWardBrand
                ? "One link for any event. Share by email, text, or bulletin — no app download required."
                : "One link for any event. Share by email, text, newsletter, or your website — no app download required."}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="9" cy="7" r="4"/>
                <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Spot limits
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              Set how many spots each slot has. Slots close automatically when full — no manual oversight needed.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-[32px_26px] border border-[#0E96B0]/9 shadow-[0_2px_8px_rgba(8,100,126,0.10)] transition-all duration-[250ms] relative overflow-hidden hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(8,100,126,0.14)] group">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E] scale-x-0 origin-left transition-transform duration-300 group-hover:scale-x-100"/>
            <div className="w-12 h-12 rounded-xl bg-[#E6F7FB] flex items-center justify-center mb-[18px]">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <div className="font-serif text-xl text-[#0D2B35] mb-2">
              Simple Sign Up
            </div>
            <p className="text-sm text-[#5A8399] leading-[1.65]">
              Participants choose a slot and enter their name — no account needed. As frictionless as a paper sheet, but online.
            </p>
          </div>
        </div>
      </section>

      {/* How It Works Section — full-width dark background */}
      <section className="relative overflow-hidden bg-[#0D2B35] py-[88px] px-6">
        {/* Top-right glow */}
        <div className="absolute top-[-100px] right-[-100px] w-[450px] h-[450px] rounded-full pointer-events-none" style={{
          background: "radial-gradient(circle, rgba(34,200,216,0.12) 0%, transparent 70%)"
        }}/>

        <div className="relative z-[1] max-w-[860px] mx-auto">
          <div className="text-[11px] font-semibold tracking-[1.6px] uppercase text-[#22C8D8] text-center mb-2.5">
            How it works
          </div>
          <h2 className="font-serif text-[clamp(28px,4vw,44px)] text-center tracking-[-0.6px] text-white mb-3.5 leading-[1.15]">
            Up and running in minutes
          </h2>
          <p className="text-[17px] text-white/50 text-center max-w-[500px] mx-auto mb-14 leading-[1.65]">
            {isWardBrand
              ? "No training needed. Any secretary can get a signup sheet live before Sunday."
              : "No complicated setup. Your team can publish a signup sheet before your next event."}
          </p>

          {/* Steps grid with connecting line */}
          <div className="relative">
            {/* Connecting line — desktop only */}
            <div
              className="absolute hidden md:block h-[1.5px] top-[26px] opacity-35"
              style={{
                left: "calc(16.66% + 20px)",
                right: "calc(16.66% + 20px)",
                background: "linear-gradient(90deg, #0E96B0, #22C8D8, #0E96B0)"
              }}
            />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-9">
              <div className="flex flex-col items-center text-center px-5">
                <div
                  className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] flex items-center justify-center mb-[22px] relative z-[1] flex-shrink-0"
                  style={{ boxShadow: "0 0 0 8px rgba(34,200,216,0.10)" }}
                >
                  <span className="font-serif text-[22px] text-white">1</span>
                </div>
                <div className="font-serif text-xl text-white mb-2.5">
                  Create your event
                </div>
                <p className="text-sm text-white/50 leading-[1.65]">
                  Name the event, add a description, and set your available time slots with spot limits.
                </p>
              </div>

              <div className="flex flex-col items-center text-center px-5">
                <div
                  className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] flex items-center justify-center mb-[22px] relative z-[1] flex-shrink-0"
                  style={{ boxShadow: "0 0 0 8px rgba(34,200,216,0.10)" }}
                >
                  <span className="font-serif text-[22px] text-white">2</span>
                </div>
                <div className="font-serif text-xl text-white mb-2.5">
                  Share the link
                </div>
                <p className="text-sm text-white/50 leading-[1.65]">
                  {isWardBrand
                    ? "Copy your unique signup link and share it by email, text, or in your ward bulletin."
                    : "Copy your unique signup link and share it by email, text, or in your newsletter."}
                </p>
              </div>

              <div className="flex flex-col items-center text-center px-5">
                <div
                  className="w-[52px] h-[52px] rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] flex items-center justify-center mb-[22px] relative z-[1] flex-shrink-0"
                  style={{ boxShadow: "0 0 0 8px rgba(34,200,216,0.10)" }}
                >
                  <span className="font-serif text-[22px] text-white">3</span>
                </div>
                <div className="font-serif text-xl text-white mb-2.5">
                  Watch it fill up
                </div>
                <p className="text-sm text-white/50 leading-[1.65]">
                  Participants pick a slot and confirm — you see it update in real time, no back-and-forth needed.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-[88px] px-6 flex items-center justify-center">
        <div className="max-w-[760px] w-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] rounded-[28px] p-[64px_72px] shadow-[0_20px_60px_rgba(8,100,126,0.22)] text-center relative overflow-hidden">
          {/* Decorative circles */}
          <div className="absolute top-[-50px] right-[-50px] w-[220px] h-[220px] rounded-full bg-white/8 pointer-events-none"/>
          <div className="absolute bottom-[-70px] left-[-40px] w-[260px] h-[260px] rounded-full bg-white/5 pointer-events-none"/>

          <div className="relative z-[1]">
            <h2 className="font-serif text-[clamp(26px,4vw,40px)] text-white tracking-[-0.5px] mb-3 leading-[1.15]">
              {brand.id === "wardsignup"
                ? "Ready to simplify your ward scheduling?"
                : brand.id === "orgsignup"
                ? "Ready to simplify scheduling for your organization?"
                : "Ready to simplify scheduling for your ministry?"}
            </h2>
            <p className="text-[17px] text-white/75 mb-9 max-w-[480px] mx-auto leading-[1.6]">
              Free during beta — no credit card, no setup fee, no complexity.
            </p>
            <div className="flex gap-3 flex-wrap justify-center">
              <Link href="/create" className="text-base font-semibold px-8 py-3.5 rounded-full bg-white text-[#08647E] border-none no-underline shadow-[0_8px_28px_rgba(0,0,0,0.20)] transition-all duration-200 inline-flex items-center gap-2 hover:-translate-y-0.5 hover:shadow-[0_12px_36px_rgba(0,0,0,0.25)]">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: "#0E96B0" }}>
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Get Started
              </Link>
              <Link href="/login" className="text-base font-semibold px-8 py-3.5 rounded-full bg-[rgba(5,50,65,0.50)] border-[1.5px] border-white/50 text-white no-underline backdrop-blur-[8px] transition-all duration-200 hover:bg-[rgba(5,50,65,0.70)] hover:-translate-y-0.5">
                Sign In
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
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
            <Link href="/privacy" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Privacy Policy
            </Link>
            <Link href="/terms" className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Terms of Service
            </Link>
            <a href={`mailto:${brand.supportEmail}`} className="text-[13px] text-white/40 hover:text-white/78 transition-colors no-underline">
              Contact
            </a>
          </div>
        </div>
        <div className="max-w-[1080px] mx-auto mt-4 pt-4 border-t border-white/8 text-center text-[13px] text-white/28 space-y-1.5">
          <div>© {year} {brand.name}. All rights reserved.</div>
          <div className="text-white/35">Made with ♥ from Arizona</div>
        </div>
      </footer>
    </div>
  );
}
