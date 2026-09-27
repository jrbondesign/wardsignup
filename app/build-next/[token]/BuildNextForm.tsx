"use client";

import { useState } from "react";

const VOTE_OPTIONS = [
  { value: "photos", label: "Photos on invites" },
  { value: "calendar_sync", label: "Google Calendar sync for bishop appointments" },
  { value: "tithing_sheets", label: "Better fit for tithing declaration / bishop appointment sheets" },
  { value: "something_else", label: "Something else" },
] as const;

function TipJarBlurb() {
  return (
    <div className="rounded-xl bg-[#E6F7FB] border border-[#0E96B0]/20 p-6">
      <p className="text-[16px] text-[#2E5566] leading-[1.7] mb-3">
        Ward Signup stays free, with no ads on your sheets. If you want to help with hosting costs, an optional tip jar is here:
      </p>
      <a
        href="https://wardsignup.com/support-the-project"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 text-[15px] font-medium px-5 py-2.5 rounded-full bg-transparent border-[1.5px] border-[#0E96B0]/40 text-[#08647E] no-underline whitespace-nowrap transition-all duration-200 hover:border-[#0E96B0] hover:bg-[#E6F7FB]"
      >
        Optional tip jar →
      </a>
    </div>
  );
}

export function BuildNextForm({ token }: { token: string }) {
  const [choice, setChoice] = useState("");
  const [otherText, setOtherText] = useState("");
  const [additionalNotes, setAdditionalNotes] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!choice) {
      setMessage("Please select an option.");
      return;
    }
    if (choice === "something_else" && !otherText.trim()) {
      setMessage("Please tell us what you'd like to see built.");
      return;
    }
    setState("sending");
    setMessage("");
    try {
      const res = await fetch(`/api/build-next/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ choice, otherText, additionalNotes }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState("error");
        setMessage(body.error || "Something went wrong. Please try again.");
        return;
      }
      setState("done");
    } catch {
      setState("error");
      setMessage("Something went wrong. Please try again.");
    }
  };

  if (state === "done") {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="font-serif text-[28px] text-[#0D2B35] tracking-[-0.3px] mb-3">
            Thanks
          </h2>
          <p className="text-[17px] leading-[1.7] text-[#2E5566]">
            This helps us pick what to build next. We will not promise every idea ships.
          </p>
        </div>
        <TipJarBlurb />
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <fieldset>
        <legend className="block text-[16px] font-semibold text-[#0D2B35] mb-3">
          Choose one:
        </legend>
        <div className="space-y-3">
          {VOTE_OPTIONS.map((o) => (
            <label
              key={o.value}
              className="flex items-start gap-3 p-4 rounded-xl border-2 border-[#0E96B0]/15 hover:border-[#0E96B0]/40 hover:bg-[#F4FAFB] transition-all cursor-pointer"
            >
              <input
                type="radio"
                name="choice"
                value={o.value}
                checked={choice === o.value}
                onChange={(e) => setChoice(e.target.value)}
                className="mt-0.5 h-5 w-5 text-[#0E96B0] focus:ring-[#0E96B0] cursor-pointer"
              />
              <span className="text-[16px] text-[#0D2B35] leading-[1.5]">
                {o.label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {choice === "something_else" && (
        <div>
          <label
            htmlFor="other-text"
            className="block text-[16px] font-semibold text-[#0D2B35] mb-2"
          >
            What would you like to see?
          </label>
          <textarea
            id="other-text"
            value={otherText}
            onChange={(e) => setOtherText(e.target.value)}
            maxLength={2000}
            rows={3}
            className="w-full rounded-xl border-2 border-[#0E96B0]/20 px-4 py-3 text-[16px] text-[#0D2B35] focus:outline-none focus:ring-2 focus:ring-[#0E96B0] focus:border-transparent"
            placeholder="Describe what you'd like to see…"
          />
        </div>
      )}

      <div>
        <label
          htmlFor="additional-notes"
          className="block text-[16px] font-semibold text-[#0D2B35] mb-2"
        >
          Anything else we should know? (optional)
        </label>
        <textarea
          id="additional-notes"
          value={additionalNotes}
          onChange={(e) => setAdditionalNotes(e.target.value)}
          maxLength={2000}
          rows={2}
          className="w-full rounded-xl border-2 border-[#0E96B0]/20 px-4 py-3 text-[16px] text-[#0D2B35] focus:outline-none focus:ring-2 focus:ring-[#0E96B0] focus:border-transparent"
          placeholder="Any context that helps us prioritize…"
        />
      </div>

      {message && (
        <p className="text-[15px] text-red-600 font-medium">{message}</p>
      )}
      <button
        type="submit"
        disabled={state === "sending"}
        className="w-full rounded-full bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] px-6 py-3.5 text-[16px] font-semibold text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] transition-all duration-200 hover:-translate-y-[1px] hover:shadow-[0_6px_20px_rgba(14,150,176,0.45)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {state === "sending" ? "Sending…" : "Send my vote"}
      </button>
      <TipJarBlurb />
    </form>
  );
}
