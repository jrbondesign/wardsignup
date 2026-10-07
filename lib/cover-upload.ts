import { resizeImage } from "@/lib/resize-image";

/** Largest original we accept; it's downscaled in the browser before upload. */
export const COVER_MAX_ORIGINAL_BYTES = 20 * 1024 * 1024;
/** Server limit for the uploaded (resized) file — keep in sync with /api/upload. */
export const COVER_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const TYPES = ["image/jpeg", "image/png", "image/webp"];

const mb = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MB`;

/** Pre-upload checks on the picked file. Returns a user-facing error, or null. */
export function coverFileError(file: File): string | null {
  if (!TYPES.includes(file.type)) {
    return "That file type isn't supported. Please choose a JPEG, PNG, or WebP image.";
  }
  if (file.size > COVER_MAX_ORIGINAL_BYTES) {
    return `That image is ${mb(file.size)}. Please choose one under ${mb(COVER_MAX_ORIGINAL_BYTES).replace(".0", "")}.`;
  }
  return null;
}

/** Resize for upload; throws a user-facing error if it's still over the server limit. */
export async function prepareCoverUpload(file: File): Promise<File> {
  const out = await resizeImage(file);
  if (out.size > COVER_MAX_UPLOAD_BYTES) {
    throw new Error(
      `That image is still ${mb(out.size)} after resizing (limit ${mb(COVER_MAX_UPLOAD_BYTES).replace(".0", "")}). Try a smaller JPEG.`
    );
  }
  return out;
}
