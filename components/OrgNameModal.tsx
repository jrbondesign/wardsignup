"use client";

import { useEffect, useState } from "react";

interface OrgNameModalProps {
  /** When provided, modal renames an existing org via PATCH; otherwise creates via POST. */
  orgId?: string;
  initialName?: string;
  brandLabel: string;
  onComplete: (name: string) => void;
  onDismiss?: () => void;
  getAccessToken: () => Promise<string | null>;
}

export default function OrgNameModal({
  orgId,
  initialName,
  brandLabel,
  onComplete,
  onDismiss,
  getAccessToken,
}: OrgNameModalProps) {
  const [name, setName] = useState(initialName?.trim() && initialName !== "Untitled organization" ? initialName : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onDismiss) onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Please enter a name.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const token = await getAccessToken();
      if (!token) {
        setError("You're signed out. Please sign in again.");
        setSubmitting(false);
        return;
      }
      const url = orgId ? `/api/organizations/${orgId}` : `/api/organizations`;
      const method = orgId ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save organization name.");
        setSubmitting(false);
        return;
      }
      onComplete(trimmed);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-md w-full p-8">
        <h2 className="font-serif text-2xl text-[#0D2B35] mb-2">Name your organization</h2>
        <p className="text-sm text-[#5A8399] leading-relaxed mb-5">
          This is the team that will own your events on {brandLabel}. You can rename it later from settings.
        </p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="org-name" className="block text-[12px] font-semibold text-[#0D2B35] mb-1.5">
            Organization name
          </label>
          <input
            id="org-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Sossaman Estates Ward EQ"
            maxLength={120}
            autoFocus
            className="w-full px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 focus:border-[#0E96B0] focus:outline-none text-[#0D2B35] placeholder-[#5A8399]/60"
          />
          {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
          <div className="flex gap-3 mt-5">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
