"use client";

import { useRef, useState } from "react";
import { createClientComponentClient } from "@/lib/auth";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useBrand } from "@/components/BrandProvider";

interface OrgLogoButtonProps {
  /** URL loaded by the parent page from the DB. Component manages its own state from here. */
  initialUrl: string | null;
  /** Visual size: sm = 48 px (dashboard), md = 56 px (admin / edit) */
  size?: "sm" | "md";
}

export default function OrgLogoButton({ initialUrl, size = "md" }: OrgLogoButtonProps) {
  const brand = useBrand();
  const [logoUrl, setLogoUrl] = useState<string | null>(initialUrl);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dim = size === "sm" ? "w-12 h-12" : "w-14 h-14";
  const iconSize = size === "sm" ? "w-5 h-5" : "w-6 h-6";

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    const img = new window.Image();
    img.onload = async () => {
      const ratio = img.width / img.height;
      if (ratio < 0.5 || ratio > 2) {
        alert("Please upload a square image (1:1 ratio recommended). Minimum 400×400 px.");
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setLogoPreview(objectUrl);
      setUploading(true);
      try {
        const supabase = createClientComponentClient();
        const { data: { session } } = await supabase.auth.getSession();
        const form = new FormData();
        form.append("file", file);
        form.append("type", "logo");
        form.append("brand", brand.id);
        const res = await fetch("/api/upload", {
          method: "POST",
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Upload failed");
        setLogoUrl(data.url);
        setLogoPreview(null);
        URL.revokeObjectURL(objectUrl);
      } catch (err: unknown) {
        alert(err instanceof Error ? err.message : "Upload failed");
        setLogoPreview(null);
        URL.revokeObjectURL(objectUrl);
      } finally {
        setUploading(false);
      }
    };
    img.src = objectUrl;
    e.target.value = "";
  };

  const handleRemove = async () => {
    setShowModal(false);
    setUploading(true);
    try {
      const supabase = createClientComponentClient();
      const { data: { session } } = await supabase.auth.getSession();
      await fetch("/api/upload", {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ type: "logo", brand: brand.id }),
      });
      setLogoUrl(null);
      setLogoPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const current = logoPreview ?? logoUrl;

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={handleFileChange}
        disabled={uploading}
      />

      {/* Logo button */}
      <div
        className="relative shrink-0 group cursor-pointer"
        onClick={() => !uploading && setShowModal(true)}
        title={current ? "Edit logo" : "Upload logo"}
      >
        {current ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={current}
            alt="Organizer logo"
            className={`${dim} rounded-xl object-cover border border-[#0E96B0]/20 shadow-sm`}
          />
        ) : (
          <div className={`${dim} rounded-xl border-2 border-dashed border-[#0E96B0]/40 bg-[#E6F7FB]/60 flex items-center justify-center`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={`${iconSize} opacity-60`}>
              <rect x="3" y="3" width="18" height="18" rx="3"/>
              <circle cx="8.5" cy="8.5" r="1.5"/>
              <polyline points="21 15 16 10 5 21"/>
            </svg>
          </div>
        )}

        {/* Hover overlay */}
        {!uploading && (
          <div className="absolute inset-0 rounded-xl bg-black/45 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            <span className="text-white text-[11px] font-semibold tracking-wide">Edit</span>
          </div>
        )}

        {/* Upload spinner */}
        {uploading && (
          <div className="absolute inset-0 rounded-xl bg-white/75 flex items-center justify-center">
            <LoadingSpinner size="sm" />
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setShowModal(false)}
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" />
          <div
            className="relative bg-white rounded-2xl shadow-[0_16px_48px_rgba(8,100,126,0.22)] p-6 w-full max-w-xs"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Preview */}
            <div className="flex items-center gap-4 mb-5">
              {current ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={current} alt="Logo" className="w-16 h-16 rounded-xl object-cover border border-[#0E96B0]/15 shadow-sm shrink-0" />
              ) : (
                <div className="w-16 h-16 rounded-xl border-2 border-dashed border-[#0E96B0]/30 bg-[#F4FAFB] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="#0E96B0" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-7 h-7 opacity-40">
                    <rect x="3" y="3" width="18" height="18" rx="3"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                </div>
              )}
              <div>
                <h3 className="font-serif text-lg text-[#0D2B35] leading-tight">Org Logo</h3>
                <p className="text-xs text-[#5A8399] mt-0.5 leading-snug">Square · 400×400 px min<br />JPEG, PNG, or WebP</p>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={() => {
                  setShowModal(false);
                  // Small delay so modal closes before file dialog opens
                  setTimeout(() => fileInputRef.current?.click(), 60);
                }}
                className="w-full text-left px-4 py-3 rounded-xl border border-[#0E96B0]/20 text-sm font-semibold text-[#08647E] hover:bg-[#E6F7FB] transition-colors flex items-center gap-3"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                  <polyline points="17 8 12 3 7 8"/>
                  <line x1="12" y1="3" x2="12" y2="15"/>
                </svg>
                {current ? "Replace logo" : "Upload logo"}
              </button>

              {current && (
                <button
                  onClick={handleRemove}
                  className="w-full text-left px-4 py-3 rounded-xl border border-red-100 text-sm font-semibold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-3"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4 h-4 shrink-0">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                  Remove logo
                </button>
              )}

              <button
                onClick={() => setShowModal(false)}
                className="w-full text-center px-4 py-2.5 text-sm text-[#5A8399] hover:text-[#0D2B35] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
