/**
 * Open the browser print dialog after the click has painted.
 *
 * window.print() blocks the main thread until the dialog closes. Called
 * straight from a click handler, the whole time the dialog is open counts as
 * the interaction's processing time, so INP reports 7 to 38 seconds. Waiting
 * one frame and then a macrotask lets the browser paint the click first.
 */
export function printAfterPaint(win: Pick<Window, "print" | "requestAnimationFrame" | "setTimeout"> = window): void {
  win.requestAnimationFrame(() => {
    win.setTimeout(() => win.print(), 0);
  });
}
