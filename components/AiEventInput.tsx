"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { useBrand } from "@/components/BrandProvider";
import type { AiEventResult } from "@/lib/ai-event-extraction";

const MAX_CHARS = 500;

interface Props {
  onResult: (result: AiEventResult, missingFields: string[]) => void;
}

export function AiEventInput({ onResult }: Props) {
  const brand = useBrand();
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isMac, setIsMac] = useState(false);

  // Detect platform after mount to avoid SSR/CSR hydration mismatch.
  useEffect(() => {
    setIsMac(/Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent));
  }, []);

  const submitHint = isMac ? "⌘+Enter to generate" : "Ctrl+Enter to generate";

  const remaining = MAX_CHARS - description.length;
  const tooShort = description.trim().length < 10;

  const handleSubmit = async () => {
    if (tooShort || loading) return;
    setError(null);
    setLoading(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/ai-create-event", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ description: description.trim(), brandId: brand.id }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      onResult(data.result as AiEventResult, (data.missingFields as string[]) ?? []);
    } catch (err) {
      if (err instanceof Error && err.name === "TimeoutError") {
        setError("Request timed out. Please try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl bg-gradient-to-br from-[#EAF7FB] to-[#F4FAFB] border border-[rgba(14,150,176,0.18)] p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        {/* Sparkle icon */}
        <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 flex-shrink-0" aria-hidden="true">
          <path d="M12 2l2.09 6.26L21 10l-6.91 1.74L12 18l-2.09-6.26L3 10l6.91-1.74L12 2z"
            fill="#0E96B0" opacity="0.9"/>
        </svg>
        <span className="text-[13px] font-semibold text-[#08647E]">Describe your event with AI</span>
      </div>

      <textarea
        value={description}
        onChange={(e) => {
          if (e.target.value.length <= MAX_CHARS) setDescription(e.target.value);
        }}
        onKeyDown={(e) => {
          // Cmd+Enter (Mac) / Ctrl+Enter (other) submits; plain Enter keeps default newline behavior.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder={
          brand.id === "wardsignup"
            ? "e.g. Missionary dinners every Sunday in May at 6pm, one family per day"
            : "e.g. Volunteer shifts every Saturday in June from 9am–noon, max 5 people"
        }
        rows={3}
        className="w-full resize-none rounded-xl border border-[rgba(14,150,176,0.25)] bg-white px-3.5 py-2.5 text-[14px] text-[#0D2B35] placeholder:text-[#8AAFBF] focus:outline-none focus:border-[#0E96B0] focus:ring-2 focus:ring-[rgba(14,150,176,0.15)] transition-colors"
        aria-describedby="ai-event-input-hint"
      />
      <p id="ai-event-input-hint" className="mt-1.5 text-[11px] text-[#8AAFBF]">
        {submitHint}
      </p>

      <div className="flex items-center justify-between mt-2.5 gap-3">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={tooShort || loading}
          className="inline-flex items-center gap-2 text-[13px] font-semibold px-4 py-2 rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_3px_10px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {loading ? (
            <>
              <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/>
              </svg>
              Thinking…
            </>
          ) : (
            <>
              Fill in with AI
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden="true">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
            </>
          )}
        </button>
        <span className={`text-[11px] tabular-nums ${remaining < 50 ? "text-amber-500" : "text-[#8AAFBF]"}`}>
          {remaining}
        </span>
      </div>

      {error && (
        <p className="mt-2 text-[13px] text-red-500 leading-snug">{error}</p>
      )}

      <details className="mt-3 group">
        <summary className="text-[12px] font-medium text-[#0E96B0] cursor-pointer hover:text-[#08647E] transition-colors list-none flex items-center gap-1">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-3 h-3 transition-transform group-open:rotate-90"
            aria-hidden="true"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          Tips for a good description
        </summary>
        <ul className="mt-2 ml-4 text-[12px] text-[#5A8399] leading-relaxed list-disc list-outside space-y-0.5">
          <li>Event name (e.g. &quot;Ward Potluck&quot;)</li>
          <li>When it happens (&quot;every Sunday in May&quot;, &quot;next 3 Tuesdays&quot;, &quot;June 14&quot;)</li>
          <li>Start and end times with am/pm</li>
          <li>Location, if you have one</li>
          <li>How many people fit (e.g. &quot;max 40&quot;, &quot;1 family per night&quot;)</li>
          <li>For appointments: slot length (&quot;15-minute slots&quot;)</li>
          <li>For bring-or-do events: list what&apos;s needed (rolls, salad, cleanup crew…)</li>
        </ul>
      </details>

      <p className="mt-2.5 text-[11px] text-[#8AAFBF] leading-snug">
        AI fills in what it can — always review before creating.
      </p>
    </div>
  );
}
