"use client";

import CoverImageFrame, { COVER_OVERLAY_BUTTON } from "@/components/CoverImageFrame";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { COVER_SIZE_HINT } from "@/lib/cover-position";
import { type AdminEventView } from "@/components/admin/hooks/deriveAdminEventView";

/** Cover image with change/reposition/remove controls. */
export default function AdminCoverImage({ ctx }: { ctx: AdminEventView }) {
  const {
    coverEnabled,
    coverInputRef,
    coverPosition,
    coverPreview,
    coverUploading,
    coverUrl,
    handleCoverPositionSave,
    handleCoverRemove,
  } = ctx;

  return (
    coverEnabled && (coverUrl || coverPreview) && (
    <>
    <CoverImageFrame
      src={coverPreview || coverUrl!}
      position={coverPreview ? null : coverPosition}
      onSavePosition={coverPreview ? undefined : handleCoverPositionSave}
      busy={coverUploading}
      actions={
        <>
          <button
            type="button"
            onClick={() => coverInputRef.current?.click()}
            className={COVER_OVERLAY_BUTTON}
          >
            Change
          </button>
          <button
            type="button"
            onClick={handleCoverRemove}
            className={COVER_OVERLAY_BUTTON}
          >
            Remove
          </button>
        </>
      }
    >
      {coverUploading && (
        <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      )}
    </CoverImageFrame>
    <p className="px-7 pt-2 text-[11px] text-[#7A9BAE] leading-relaxed">{COVER_SIZE_HINT}</p>
    </>
  )
  );
}
