export type InviteInfoErrorType =
  | "invite_not_found"
  | "invite_expired"
  | "invite_revoked"
  | "invite_already_used"
  | "generic";

/**
 * Map POST /api/organizations/invite-info failures to the accept-page copy.
 * 404 is a missing token. 410 distinguishes expired, revoked, and already used.
 */
export function classifyInviteInfoFailure(
  status: number,
  error: string | undefined,
): { type: InviteInfoErrorType; message: string } {
  if (status === 404) {
    return { type: "invite_not_found", message: "This invitation was not found." };
  }
  if (status === 410) {
    const msg = error ?? "";
    if (msg.includes("expired")) return { type: "invite_expired", message: "This invitation has expired." };
    if (msg.includes("revoked")) return { type: "invite_revoked", message: "This invitation has been revoked." };
    if (msg.includes("already")) return { type: "invite_already_used", message: "This invitation has already been used." };
  }
  return { type: "generic", message: error || "Failed to load invitation." };
}
