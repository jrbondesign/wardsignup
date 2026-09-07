const SIZE_CLASSES = {
  xs: "h-4 w-4 border-2",
  sm: "h-5 w-5 border-2",
  md: "h-8 w-8 border-[3px]",
  lg: "h-9 w-9 border-[3px]",
  xl: "h-10 w-10 border-[3px]",
} as const;

export type LoadingSpinnerSize = keyof typeof SIZE_CLASSES;

/**
 * Ring spinner (partial border) — use app-wide for loading states.
 */
export function LoadingSpinner({
  size = "lg",
  className = "",
}: {
  /** lg=w-9, xl=w-10 (full-page), md=w-8, sm=w-5 (buttons), xs=w-4 (inline) */
  size?: LoadingSpinnerSize;
  className?: string;
}) {
  return (
    <div
      className={`${SIZE_CLASSES[size]} shrink-0 rounded-full border-[#0E96B0]/20 border-t-[#0E96B0] animate-spin ${className}`.trim()}
      aria-hidden
    />
  );
}
