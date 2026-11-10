import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";
import { getEventTemplate, type TemplateKey } from "@/lib/event-template-data";

/**
 * Public asset path to seed as the event cover, or null when create should
 * leave cover_image_url empty (no template default, or org not allowlisted).
 */
export function templateCoverAssetForCreate(
  templateKey: TemplateKey | null | undefined,
  organizationId: string | null | undefined
): string | null {
  if (!templateKey || !isCoverImageEnabledForOrg(organizationId)) return null;
  return getEventTemplate(templateKey)?.defaultCoverAsset ?? null;
}

/**
 * Fetch a public template asset and upload it as the event cover through the
 * same /api/upload path leaders use, so the file lands in
 * `<userId>/events/<eventId>/cover.<ext>` and passes isEventCoverUrl.
 */
export async function uploadTemplateCover(opts: {
  eventId: string;
  token: string;
  assetPath: string;
}): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { eventId, token, assetPath } = opts;
  if (!assetPath.startsWith("/templates/")) {
    return { ok: false, error: "Invalid template cover path" };
  }

  let blob: Blob;
  try {
    const res = await fetch(assetPath);
    if (!res.ok) {
      return { ok: false, error: `Could not load template cover (${res.status})` };
    }
    blob = await res.blob();
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Could not load template cover",
    };
  }

  const ext = assetPath.endsWith(".jpg") || assetPath.endsWith(".jpeg")
    ? "jpg"
    : assetPath.endsWith(".png")
      ? "png"
      : "webp";
  const mime =
    blob.type && blob.type.startsWith("image/")
      ? blob.type
      : ext === "jpg"
        ? "image/jpeg"
        : ext === "png"
          ? "image/png"
          : "image/webp";

  const file = new File([blob], `cover.${ext}`, { type: mime });
  const form = new FormData();
  form.append("file", file);
  form.append("type", "cover");
  form.append("eventId", eventId);

  try {
    const res = await fetch("/api/upload", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
    if (!res.ok || !data.url) {
      return { ok: false, error: data.error || "Cover upload failed" };
    }
    return { ok: true, url: data.url };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Cover upload failed",
    };
  }
}
