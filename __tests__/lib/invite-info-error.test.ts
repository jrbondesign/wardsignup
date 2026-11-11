import { classifyInviteInfoFailure, INVITE_COPY } from "@/lib/invite-info-error";

describe("classifyInviteInfoFailure", () => {
  it("keeps missing, expired, revoked and used invites distinct", () => {
    expect(classifyInviteInfoFailure(404, "Invitation not found or expired")).toMatchObject({
      type: "invite_not_found",
      title: INVITE_COPY.notFound.title,
      message: INVITE_COPY.notFound.message,
      showSignIn: false,
      showDashboard: false,
    });
    expect(classifyInviteInfoFailure(410, "This invitation has expired")).toMatchObject({
      type: "invite_expired",
      title: INVITE_COPY.expired.title,
      message: INVITE_COPY.expired.message,
    });
    expect(classifyInviteInfoFailure(410, "This invitation has been revoked")).toMatchObject({
      type: "invite_revoked",
      title: INVITE_COPY.revoked.title,
      message: INVITE_COPY.revoked.message,
    });
    expect(classifyInviteInfoFailure(410, "This invitation has already been used")).toMatchObject({
      type: "invite_already_used",
      title: INVITE_COPY.alreadyUsed.title,
      message: INVITE_COPY.alreadyUsed.message,
      showSignIn: true,
      showDashboard: false,
    });
  });

  it("shows a dashboard next step when the signed in user already accepted", () => {
    expect(
      classifyInviteInfoFailure(410, "This invitation has already been used", { alreadyMember: true }),
    ).toMatchObject({
      type: "invite_already_member",
      title: INVITE_COPY.alreadyMember.title,
      message: INVITE_COPY.alreadyMember.message,
      showSignIn: false,
      showDashboard: true,
    });
  });

  it("uses the server message for other failures", () => {
    expect(classifyInviteInfoFailure(400, "Invalid invite token format")).toMatchObject({
      type: "generic",
      message: "Invalid invite token format",
    });
    expect(classifyInviteInfoFailure(500, undefined).message).toBe("Failed to load invitation.");
  });

  it("does not use dashes as punctuation in user facing copy", () => {
    const snippets = [
      INVITE_COPY.notFound.message,
      INVITE_COPY.expired.message,
      INVITE_COPY.revoked.message,
      INVITE_COPY.alreadyUsed.message,
      INVITE_COPY.alreadyUsed.signedInHint,
      INVITE_COPY.alreadyMember.message,
      INVITE_COPY.alreadyMember.title,
    ];
    for (const text of snippets) {
      expect(text).not.toMatch(/[—–]/);
    }
  });
});
