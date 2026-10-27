"use client";

import { useEffect, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { CALLING_MAX_LENGTH, normalizeCalling } from "@/lib/callings";

export const OWN_CALLING_LABEL = "Your calling (optional)";
export const OWN_CALLING_PLACEHOLDER = "Elders Quorum secretary";
export const OWN_CALLING_HELPER = "Private. Not shown on public pages.";

const inputClass =
  "w-full min-w-0 px-3 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[14px] text-[#0D2B35] placeholder-[#5A8399]/60 bg-white";

/**
 * The signed in person's own calling (organizer_profiles.calling), edited on
 * their own row in the admins list. It only ever reads and writes the caller's
 * own profile through /api/organizer-profile/calling; other admins' callings are
 * never loaded.
 */
export default function OwnCallingField() {
  const [value, setValue] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const token = async () => {
    const supabase = createClientComponentClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const t = await token();
        if (!t) return;
        const res = await fetch("/api/organizer-profile/calling", { headers: { Authorization: `Bearer ${t}` } });
        const data = (await res.json().catch(() => null)) as { calling?: string | null } | null;
        if (!cancelled && res.ok) {
          setSaved(data?.calling ?? null);
          setValue(data?.calling ?? "");
        }
      } catch {
        // Optional field; leave it blank.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const dirty = normalizeCalling(value) !== saved;

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const t = await token();
      if (!t) {
        setStatus({ kind: "error", text: "You're signed out." });
        return;
      }
      const calling = normalizeCalling(value);
      const res = await fetch("/api/organizer-profile/calling", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${t}` },
        body: JSON.stringify({ calling }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; calling?: string | null };
      if (!res.ok) {
        setStatus({ kind: "error", text: data?.error ?? "Failed to save your calling." });
        return;
      }
      setSaved(data?.calling ?? calling);
      setValue(data?.calling ?? calling ?? "");
      setStatus({ kind: "ok", text: "Saved." });
    } catch {
      setStatus({ kind: "error", text: "Network error. Please try again." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-2.5 max-w-md" data-testid="own-calling">
      <label htmlFor="own-calling" className="block text-[12px] font-semibold text-[#0D2B35] mb-1">
        {OWN_CALLING_LABEL}
      </label>
      <div className="flex gap-2">
        <input
          id="own-calling"
          type="text"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setStatus(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              if (dirty && !saving) void save();
            }
          }}
          placeholder={OWN_CALLING_PLACEHOLDER}
          maxLength={CALLING_MAX_LENGTH}
          disabled={!loaded || saving}
          aria-describedby="own-calling-helper"
          className={inputClass}
        />
        <button
          type="button"
          onClick={() => void save()}
          disabled={!loaded || saving || !dirty}
          className="shrink-0 text-[13px] font-semibold px-4 py-2 rounded-xl border-[1.5px] border-[#0E96B0]/35 bg-white text-[#08647E] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
      <p id="own-calling-helper" className="mt-1 text-[11px] text-[#5A8399]">
        {OWN_CALLING_HELPER}
      </p>
      {status && (
        <p className={`mt-1 text-[12px] ${status.kind === "ok" ? "text-[#0F6E56]" : "text-red-600"}`} role="status">
          {status.text}
        </p>
      )}
    </div>
  );
}
