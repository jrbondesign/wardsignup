"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal focus handling and scroll lock: focus the dialog (or initialFocusRef) on open, keep Tab inside the
 * container, close on Escape, and give focus back to the trigger on close.
 * `returnFocusTo` wins; otherwise whatever had focus when the dialog opened.
 */
export function useDialogFocus(
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
  options: {
    initialFocusRef?: RefObject<HTMLElement | null>;
    returnFocusTo?: RefObject<HTMLElement | null>;
  } = {},
) {
  const { initialFocusRef, returnFocusTo } = options;
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const returnTarget = returnFocusTo?.current ?? null;

    // Default: focus the dialog itself (tabIndex -1), so a tap does not paint a
    // focus ring on the first row; Tab then moves into the list.
    const first = initialFocusRef?.current ?? containerRef.current;
    first?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !containerRef.current) return;
      const nodes = Array.from(containerRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        // Nothing usable inside (e.g. buttons disabled while busy): keep focus on the dialog.
        e.preventDefault();
        containerRef.current.focus();
        return;
      }
      const firstEl = nodes[0];
      const lastEl = nodes[nodes.length - 1];
      const active = document.activeElement;
      const inside = containerRef.current.contains(active) && active !== containerRef.current;
      if (e.shiftKey && (active === firstEl || !inside)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (active === lastEl || !inside)) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    // Keep the page behind the dialog from scrolling while it is open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = prevOverflow;
      const target = returnTarget ?? opener;
      if (target && target.isConnected && target !== document.body) target.focus();
    };
    // Run once per open so a parent re-render never steals focus back to the first item.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
