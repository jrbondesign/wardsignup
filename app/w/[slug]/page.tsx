"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import Head from "next/head";
import { getPublicOrgCampaigns } from "@/lib/supabase";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";

interface PublicEvent {
  id: string;
  name: string;
  description: string | null;
  event_date: string | null;
  event_end_date: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  event_times: { label: string; time: string }[] | null;
  event_locations: { label: string; address: string }[] | null;
  event_type: string | null;
}

export default function WardDirectoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const brand = useBrand();
  const { slug } = use(params);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [events, setEvents] = useState<PublicEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const result = await getPublicOrgCampaigns(slug);
        const data = result.data as unknown as PublicEvent[] | null;
        const error = result.error;
        
        if (error || !data || data.length === 0) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        // Set org name from first event's org (we'll use the slug as fallback for display)
        setOrgName(slug.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()));
        setEvents(data);
      } catch (err) {
        console.error("Error fetching directory:", err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex items-center justify-center">
        <LoadingSpinner size="xl" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-[#F4FAFB] flex flex-col">
        <header className="bg-white border-b border-[#0E96B0]/10">
          <div className="max-w-4xl mx-auto px-6 min-h-[60px] py-2 flex items-center justify-between gap-3">
            <Link href="/" className="flex items-center gap-2 no-underline">
              <Image src={brand.logoSrc} alt={brand.logoAlt} width={28} height={28} className="rounded-[7px]" />
              <span className="font-serif text-lg text-[#0D2B35] tracking-[0.5px]"
                    style={{ WebkitTextStroke: "0.3px #0D2B35" }}>
                {brand.name}
              </span>
            </Link>
            <Link
              href="/"
              className="text-xs sm:text-sm font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors no-underline"
            >
              Create your own signup
            </Link>
          </div>
        </header>
        <main className="flex-1 flex items-center justify-center p-8">
          <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(8,100,126,0.10)] p-10 max-w-md w-full text-center">
            <h1 className="font-serif text-2xl text-[#0D2B35] mb-3">Directory not found</h1>
            <p className="text-sm text-[#5A8399]">
              This ward directory may not exist or has not been published yet.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const formatDate = (d: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    return new Date(y, m - 1, dd).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  };

  const formatTime = (t: string) => /^\d{2}:\d{2}/.test(t) ? new Date(`1970-01-01T${t.length === 5 ? t + ":00" : t}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : t;

  return (
    <>
      <Head>
        <meta name="robots" content="noindex" />
      </Head>
      <div className="min-h-screen bg-[#F4FAFB] flex flex-col">
        <header className="bg-white border-b border-[#0E96B0]/10">
        <div className="max-w-4xl mx-auto px-6 min-h-[60px] py-2 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <Image src={brand.logoSrc} alt={brand.logoAlt} width={28} height={28} className="rounded-[7px]" />
            <span className="font-serif text-lg text-[#0D2B35] tracking-[0.5px]"
                  style={{ WebkitTextStroke: "0.3px #0D2B35" }}>
              {brand.name}
            </span>
          </Link>
          <Link
            href="/"
            className="text-xs sm:text-sm font-semibold text-[#0E96B0] hover:text-[#08647E] transition-colors no-underline"
          >
            Create your own signup
          </Link>
        </div>
      </header>

      <main className="flex-1 w-full max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="font-serif text-[clamp(28px,5vw,42px)] text-[#0D2B35] tracking-[-0.5px] leading-tight mb-2">
            {orgName || slug}
          </h1>
          <p className="text-sm text-[#5A8399]">
            Current volunteer opportunities
          </p>
        </div>

        {events.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] p-10 text-center">
            <p className="text-sm text-[#5A8399]">No events are currently accepting signups.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {events.map((event) => (
              <Link
                key={event.id}
                href={`/event/${event.id}`}
                className="block bg-white rounded-2xl shadow-[0_4px_24px_rgba(8,100,126,0.08)] hover:shadow-[0_6px_32px_rgba(8,100,126,0.14)] transition-shadow overflow-hidden no-underline"
              >
                <div className="h-1.5 bg-gradient-to-r from-[#22C8D8] via-[#0E96B0] to-[#08647E]" />
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <h2 className="font-serif text-xl text-[#0D2B35] flex-1">{event.name}</h2>
                    
                    {/* Scannable date/time badge */}
                    {(event.event_date || event.event_start_time) && (
                      <div className="flex-shrink-0 bg-[#E6F7FB] rounded-lg px-3 py-2 text-right">
                        {event.event_date && (
                          <div className="text-[13px] font-semibold text-[#0E96B0] leading-tight">
                            {new Date(event.event_date + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                          </div>
                        )}
                        {event.event_start_time && (
                          <div className="text-[11px] text-[#5A8399] leading-tight mt-0.5">
                            {formatTime(event.event_start_time)}
                            {event.event_end_time && ` – ${formatTime(event.event_end_time)}`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  {event.description && (
                    <p className="text-sm text-[#5A8399] leading-relaxed mb-3 line-clamp-2">
                      {event.description}
                    </p>
                  )}

                  <div className="flex flex-wrap items-center gap-3 text-sm text-[#2E5566]">
                    {event.event_locations && event.event_locations.length > 0 && (
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                        </svg>
                        <span className="text-[#5A8399]">{event.event_locations[0].address}</span>
                      </div>
                    )}
                    
                    {event.event_times && event.event_times.length > 0 && (
                      <div className="flex items-center gap-2">
                        <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 flex-shrink-0">
                          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <span className="text-[#5A8399]">{event.event_times[0].label}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-[#0E96B0]">
                    View details & sign up
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4">
                      <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      <footer className="mt-auto flex-shrink-0 border-t border-[#0E96B0]/10 bg-white/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col items-center justify-center gap-4 text-center">
          <p className="text-sm text-[#5A8399] leading-relaxed">
            Powered by{" "}
            <a
              href={brand.siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#0E96B0] hover:text-[#08647E] underline decoration-[#0E96B0]/35 underline-offset-2"
            >
              {brand.siteHost}
            </a>
          </p>
        </div>
      </footer>
      </div>
    </>
  );
}
