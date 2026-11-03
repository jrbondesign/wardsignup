"use client";

import { useEffect, useState } from "react";
import { getStoredAttribution } from "@/lib/attribution";
import OrgIdentityFields from "@/components/OrgIdentityFields";
import { joinCalling } from "@/lib/callings";
import { normalizeWardName } from "@/lib/ward-name";

interface OrgNameModalProps {
  /** When provided, modal renames an existing org via PATCH; otherwise creates via POST. */
  orgId?: string;
  initialName?: string;
  initialWardName?: string | null;
  brandLabel: string;
  onComplete: (name: string) => void;
  onDismiss?: () => void;
  getAccessToken: () => Promise<string | null>;
}

export default function OrgNameModal({
  orgId,
  initialName,
  initialWardName,
  brandLabel,
  onComplete,
  onDismiss,
  getAccessToken,
}: OrgNameModalProps) {
  const [name, setName] = useState(initialName?.trim() && initialName !== "Untitled organization" ? initialName : "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wardName, setWardName] = useState(initialWardName ?? "");
  const [callingChoice, setCallingChoice] = useState("");
  const [callingOther, setCallingOther] = useState("");

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
      setError("Please enter your organization.");
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
      const ward = normalizeWardName(wardName);
      const authHeaders = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      };

      // Get attribution for new orgs only
      const attribution = orgId ? undefined : getStoredAttribution();

      // Renaming an existing org sends Ward/Unit in the same PATCH (the server saves
      // the name even if the ward column isn't there yet).
      const res = await fetch(url, {
        method,
        headers: authHeaders,
        body: JSON.stringify(orgId && ward ? { name: trimmed, ward_name: ward } : { name: trimmed, attribution }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.error ?? "Failed to save your organization.");
        setSubmitting(false);
        return;
      }
      // New org: Ward/Unit is optional and must never block first run, so it is
      // saved best effort right after the org exists.
      const newOrgId: string | undefined = !orgId ? data?.organization?.id : undefined;
      if (ward && newOrgId) {
        try {
          const wardRes = await fetch(`/api/organizations/${newOrgId}`, {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ name: trimmed, ward_name: ward }),
          });
          if (!wardRes.ok) console.warn("Ward/Unit not saved:", wardRes.status);
        } catch (wardError) {
          console.warn("Ward/Unit not saved:", wardError);
        }
      }
      // Calling is optional and must never block first run: save it best effort.
      const calling = joinCalling(callingChoice, callingOther);
      if (calling) {
        try {
          const callingRes = await fetch("/api/organizer-profile/calling", {
            method: "PATCH",
            headers: authHeaders,
            body: JSON.stringify({ calling }),
          });
          if (!callingRes.ok) console.warn("Calling not saved:", callingRes.status);
        } catch (callingError) {
          console.warn("Calling not saved:", callingError);
        }
      }
      onComplete(trimmed);
    } catch {
      setError("Network error. Please try again.");
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-[#0D2B35]/50 backdrop-blur-[2px] flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-[0_20px_60px_rgba(8,100,126,0.18)] max-w-4xl w-full p-6 sm:p-8 max-h-[calc(100vh-2rem)] overflow-y-auto">
        <h2 className="font-serif text-2xl text-[#0D2B35] mb-2">Tell us about your ward</h2>
        <p className="text-sm text-[#5A8399] leading-relaxed mb-5">
          Your organization will own your events on {brandLabel}. You can change this later in settings.
        </p>
        <form onSubmit={handleSubmit}>
          <OrgIdentityFields
            idPrefix="first-run"
            name={name}
            onNameChange={setName}
            wardName={wardName}
            onWardNameChange={setWardName}
            callingChoice={callingChoice}
            callingOther={callingOther}
            onCallingChoiceChange={setCallingChoice}
            onCallingOtherChange={setCallingOther}
            canEditOrg
            disabled={submitting}
            autoFocus
          />
          {error && <p className="mt-2 text-[13px] text-red-600">{error}</p>}
          <div className="flex gap-3 mt-5 md:justify-end">
            {onDismiss && (
              <button
                type="button"
                onClick={onDismiss}
                disabled={submitting}
                className="flex-1 md:flex-none md:min-w-[140px] text-sm font-semibold px-4 py-2.5 rounded-xl border-[1.5px] border-[#0E96B0]/30 text-[#2E5566] hover:border-[#0E96B0] hover:bg-[#E6F7FB] transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 md:flex-none md:min-w-[140px] text-sm font-semibold px-4 py-2.5 rounded-xl bg-gradient-to-br from-[#22C8D8] via-[#0E96B0] to-[#08647E] text-white shadow-[0_4px_14px_rgba(14,150,176,0.35)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0"
            >
              {submitting ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
