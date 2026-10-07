/**
 * Downscale an image in the browser before upload so covers stay small
 * (~150–400 KB) in the event-media bucket. Outputs JPEG because the OG image
 * renderer (Satori) can't decode WebP. Returns the original file if the
 * browser can't encode or the result isn't smaller.
 */
export async function resizeImage(
  file: File,
  maxWidth = 1600,
  maxHeight = 800,
  quality = 0.82
): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    // Scale to *cover* the 2:1 frame (not fit inside it) so there's spare image to
    // reposition without upscaling; never enlarge. Aspect ratio is always preserved.
    const scale = Math.min(1, Math.max(maxWidth / bitmap.width, maxHeight / bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // JPEG has no alpha — paint white behind transparent PNGs.
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
