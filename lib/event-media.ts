import type { createServiceRoleClient } from "@/lib/supabase-admin";
import { isCoverImageEnabledForOrg } from "@/lib/cover-image-feature";

type AdminClient = ReturnType<typeof createServiceRoleClient>;

export const EVENT_MEDIA_BUCKET = "event-media";

// Covers are stored at `<userId>/events/<eventId>/cover.<ext>` by /api/upload.
// Logos share the bucket (`<userId>/logo.<ext>`), so anything that deletes
// objects must only ever act on cover-shaped paths.
const COVER_PATH_RE = /^[\w-]+\/events\/[\w-]+\/cover\.(jpg|png|webp)$/;

/** Extract the storage object path from a public event-media URL (drops ?v=). */
export function eventMediaPath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/object/public/${EVENT_MEDIA_BUCKET}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try {
    return decodeURIComponent(url.slice(i + marker.length).split("?")[0]);
  } catch {
    return null;
  }
}

/**
 * True when `url` is a cover image in this project's Supabase event-media
 * bucket. cover_image_url is writable by org admins via RLS, so callers that
 * fetch or render it server-side should check this first.
 */
export function isEventCoverUrl(url: string | null | undefined): url is string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/$/, "");
  if (!url || !base || !url.startsWith(`${base}/storage/v1/object/public/`)) return false;
  const path = eventMediaPath(url);
  return !!path && COVER_PATH_RE.test(path);
}

/**
 * Remove a cover object from storage unless another campaign still points at
 * it (duplicated events share the original's file). Best-effort: logs errors
 * rather than throwing. Call AFTER the referencing row is updated/deleted.
 */
export async function removeCoverIfUnreferenced(
  admin: AdminClient,
  coverUrl: string | null | undefined
): Promise<void> {
  const path = eventMediaPath(coverUrl);
  if (!path || !COVER_PATH_RE.test(path)) return;
  try {
    // Cover paths are [\w-./] only; escape `_` so LIKE treats it literally.
    const pattern = `/${EVENT_MEDIA_BUCKET}/${path}`.replace(/_/g, "\\_");
    const { count, error } = await admin
      .from("campaigns")
      .select("id", { count: "exact", head: true })
      .like("cover_image_url", `%${pattern}%`);
    if (error) throw error;
    if ((count ?? 0) > 0) return;
    const { error: rmErr } = await admin.storage.from(EVENT_MEDIA_BUCKET).remove([path]);
    if (rmErr) throw rmErr;
  } catch (e) {
    console.error("removeCoverIfUnreferenced:", path, e);
  }
}

/**
 * Server-only: the event's cover URL if the cover feature is enabled for its org and
 * the URL is a valid cover in this project's bucket; otherwise null. Public pages read
 * campaigns through an RPC that omits organization_id, so they ask the server.
 */
export async function publicCoverUrlForCampaign(
  admin: AdminClient,
  campaignId: string
): Promise<string | null> {
  const { data } = await admin
    .from("campaigns")
    .select("organization_id, cover_image_url")
    .eq("id", campaignId)
    .maybeSingle();
  const row = data as { organization_id: string | null; cover_image_url: string | null } | null;
  if (!row || !isCoverImageEnabledForOrg(row.organization_id)) return null;
  return isEventCoverUrl(row.cover_image_url) ? row.cover_image_url : null;
}
