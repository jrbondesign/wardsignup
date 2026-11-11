export type InviteInfoErrorType =
  | "invite_not_found"
  | "invite_expired"
  | "invite_revoked"
  | "invite_already_used"
  | "invite_already_member"
  | "generic";

export const INVITE_COPY = {
  notFound: {
    title: "Invitation not found",
    message: "This invite link is not valid. Ask your admin for a new link.",
  },
  expired: {
    title: "Invitation expired",
    message: "This invite has expired. Ask your admin for a new link.",
  },
  revoked: {
    title: "Invitation revoked",
    message: "This invite is no longer active. Ask your admin for a new link.",
  },
  alreadyUsed: {
    title: "Invitation already used",
    message: "This invite was already used. Ask your admin for a new link.",
    signedInHint: "If you already joined, sign in here.",
  },
  alreadyMember: {
    title: "You're already in",
    message: "You're already in this organization. Go to your dashboard.",
  },
  generic: {
    title: "We couldn't accept this invitation",
    message: "Failed to load invitation.",
  },
} as const;

/**
 * Map POST /api/organizations/invite-info failures to the accept-page copy.
 * 404 is a missing token. 410 distinguishes expired, revoked, already used,
 * and already a member (the signed-in user already accepted).
 */
export function classifyInviteInfoFailure(
  status: number,
  error: string | undefined,
  extras?: { alreadyMember?: boolean },
): { type: InviteInfoErrorType; title: string; message: string; showSignIn: boolean; showDashboard: boolean } {
  if (status === 404) {
    return {
      type: "invite_not_found",
      title: INVITE_COPY.notFound.title,
      message: INVITE_COPY.notFound.message,
      showSignIn: false,
      showDashboard: false,
    };
  }
  if (status === 410) {
    if (extras?.alreadyMember) {
      return {
        type: "invite_already_member",
        title: INVITE_COPY.alreadyMember.title,
        message: INVITE_COPY.alreadyMember.message,
        showSignIn: false,
        showDashboard: true,
      };
    }
    const msg = error ?? "";
    if (msg.toLowerCase().includes("expired")) {
      return {
        type: "invite_expired",
        title: INVITE_COPY.expired.title,
        message: INVITE_COPY.expired.message,
        showSignIn: false,
        showDashboard: false,
      };
    }
    if (msg.toLowerCase().includes("revoked")) {
      return {
        type: "invite_revoked",
        title: INVITE_COPY.revoked.title,
        message: INVITE_COPY.revoked.message,
        showSignIn: false,
        showDashboard: false,
      };
    }
    if (msg.toLowerCase().includes("already")) {
      return {
        type: "invite_already_used",
        title: INVITE_COPY.alreadyUsed.title,
        message: INVITE_COPY.alreadyUsed.message,
        showSignIn: true,
        showDashboard: false,
      };
    }
  }
  return {
    type: "generic",
    title: INVITE_COPY.generic.title,
    message: error || INVITE_COPY.generic.message,
    showSignIn: false,
    showDashboard: false,
  };
}
