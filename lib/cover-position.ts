/** Cover focal point, stored as a CSS object-position string ("<x>% <y>%", 0–100). */
export const DEFAULT_COVER_POSITION = "50% 50%";

/** Recommended upload size, shown as helper text. Covers render in a fixed 2:1 frame. */
export const COVER_SIZE_HINT =
  "Recommended: 1600 × 800 px (2:1), at least 1200 × 600. Drag to reposition — the image is cropped to fit, never stretched.";

const RE = /^(100|[1-9]?[0-9])% (100|[1-9]?[0-9])%$/;

export function isValidCoverPosition(v: unknown): v is string {
  return typeof v === "string" && RE.test(v);
}

export function parseCoverPosition(v: string | null | undefined): { x: number; y: number } {
  if (!isValidCoverPosition(v)) return { x: 50, y: 50 };
  const [x, y] = v.split(" ").map((p) => parseInt(p, 10));
  return { x, y };
}

export function formatCoverPosition(x: number, y: number): string {
  const c = (n: number) => Math.round(Math.min(100, Math.max(0, n)));
  return `${c(x)}% ${c(y)}%`;
}

/** Safe value for style.objectPosition. */
export function coverObjectPosition(v: string | null | undefined): string {
  return isValidCoverPosition(v) ? v : DEFAULT_COVER_POSITION;
}
