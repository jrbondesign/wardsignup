"use client";

import { useRef, useState } from "react";
import {
  coverObjectPosition,
  formatCoverPosition,
  parseCoverPosition,
} from "@/lib/cover-position";

interface Props {
  src: string;
  /** Saved focal point ("<x>% <y>%"); null = centered. */
  position: string | null;
  /** When set, the frame offers drag-to-reposition with Save / Cancel. */
  onSavePosition?: (position: string) => Promise<void>;
  busy?: boolean;
  /** Extra buttons shown beside "Reposition" (e.g. Change / Remove). */
  actions?: React.ReactNode;
  children?: React.ReactNode;
}

/** Style for buttons overlaid on the cover (Reposition and any `actions`). */
export const COVER_OVERLAY_BUTTON =
  "rounded-full bg-black/55 text-white text-xs font-semibold px-3 py-1.5 shadow hover:bg-black/70 disabled:opacity-50";

/**
 * Fixed 2:1 cover frame. The image always uses object-fit: cover (cropped, never
 * stretched); object-position picks the visible crop. Dragging moves the focal point
 * along whichever axis overflows the frame.
 */
export default function CoverImageFrame({ src, position, onSavePosition, busy, actions, children }: Props) {
  const frameRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(parseCoverPosition(position));
  const [saving, setSaving] = useState(false);
  const drag = useRef<{ px: number; py: number; x: number; y: number } | null>(null);

  const shown = editing ? formatCoverPosition(draft.x, draft.y) : coverObjectPosition(position);

  const overflow = () => {
    const f = frameRef.current;
    const i = imgRef.current;
    if (!f || !i || !i.naturalWidth) return { ox: 0, oy: 0 };
    const scale = Math.max(f.clientWidth / i.naturalWidth, f.clientHeight / i.naturalHeight);
    return {
      ox: i.naturalWidth * scale - f.clientWidth,
      oy: i.naturalHeight * scale - f.clientHeight,
    };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editing) return;
    e.preventDefault();
    (e.target as Element).setPointerCapture(e.pointerId);
    drag.current = { px: e.clientX, py: e.clientY, x: draft.x, y: draft.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!editing || !d) return;
    const { ox, oy } = overflow();
    // Dragging the image right reveals more of its left side → smaller x%.
    const x = ox > 0 ? d.x - ((e.clientX - d.px) / ox) * 100 : 50;
    const y = oy > 0 ? d.y - ((e.clientY - d.py) / oy) * 100 : 50;
    setDraft(parseCoverPosition(formatCoverPosition(x, y)));
  };
  const endDrag = () => {
    drag.current = null;
  };

  const startEditing = () => {
    setDraft(parseCoverPosition(position));
    setEditing(true);
  };
  const save = async () => {
    if (!onSavePosition) return;
    setSaving(true);
    try {
      await onSavePosition(formatCoverPosition(draft.x, draft.y));
      setEditing(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Couldn't save position");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      ref={frameRef}
      className={`relative w-full aspect-[2/1] overflow-hidden bg-[#F4FAFB] select-none ${
        editing ? "cursor-grab active:cursor-grabbing touch-none" : ""
      }`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        ref={imgRef}
        src={src}
        alt="Event cover"
        draggable={false}
        className="w-full h-full object-cover pointer-events-none"
        style={{ objectPosition: shown }}
      />
      {children}
      {onSavePosition && !busy && (
        <div className="absolute bottom-3 right-3 flex gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-full bg-white/90 text-[#2E5566] text-xs font-semibold px-3 py-1.5 shadow hover:bg-white disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={save}
                disabled={saving}
                className="rounded-full bg-[#0E96B0] text-white text-xs font-semibold px-3 py-1.5 shadow hover:bg-[#08647E] disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save position"}
              </button>
            </>
          ) : (
            <>
              {actions}
              <button
                type="button"
                onClick={startEditing}
                className={COVER_OVERLAY_BUTTON}
              >
                Reposition
              </button>
            </>
          )}
        </div>
      )}
      {editing && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 text-white text-xs px-3 py-1">
          Drag to reposition
        </div>
      )}
    </div>
  );
}
