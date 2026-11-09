/** Shown under "Event not found" on public event routes. No dashes. */
export const EVENT_NOT_FOUND_GUIDANCE =
  "This link may have been cut off or broken when it was copied. Ask the organizer for the full link, or scan the QR code.";

/** Shown next to Download QR. No dashes. */
export const QR_DOWNLOAD_HINT =
  "Download the image, then insert it into your program or document as a picture.";

/** Sheet helper keeps the old purpose and adds the insert instruction. */
export const QR_ACTION_HELPER = `For a slide, bulletin or handout. ${QR_DOWNLOAD_HINT}`;

/** Shown near Copy link. No dashes. */
export const COPY_LINK_LINE_HINT = "Paste the link as one line so it doesn't break.";

export function copyLinkHelper(isWardBrand: boolean): string {
  const base = isWardBrand
    ? "Send it to your ward by email or text"
    : "Send it to your group by email or text";
  return `${base} ${COPY_LINK_LINE_HINT}`;
}
