import { withUtm } from "@/lib/utm";

/**
 * Link a creator copies to share by hand (copy link buttons). Tagged ref=share,
 * the same lightweight convention PR #69 uses for share links. Keeps existing
 * query params and hashes; leaves relative or invalid URLs unchanged.
 */
export function shareLink(url: string): string {
  return withUtm(url, { ref: "share" });
}
