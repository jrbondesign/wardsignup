import { classifyInviteInfoFailure } from "@/lib/invite-info-error";

describe("classifyInviteInfoFailure", () => {
  it("keeps missing, expired, revoked and used invites distinct", () => {
    expect(classifyInviteInfoFailure(404, "Invitation not found or expired")).toEqual({
      type: "invite_not_found",
      message: "This invitation was not found.",
    });
    expect(classifyInviteInfoFailure(410, "This invitation has expired")).toEqual({
      type: "invite_expired",
      message: "This invitation has expired.",
    });
    expect(classifyInviteInfoFailure(410, "This invitation has been revoked")).toEqual({
      type: "invite_revoked",
      message: "This invitation has been revoked.",
    });
    expect(classifyInviteInfoFailure(410, "This invitation has already been used")).toEqual({
      type: "invite_already_used",
      message: "This invitation has already been used.",
    });
  });

  it("uses the server message for other failures", () => {
    expect(classifyInviteInfoFailure(400, "Invalid invite token format")).toEqual({
      type: "generic",
      message: "Invalid invite token format",
    });
    expect(classifyInviteInfoFailure(500, undefined).message).toBe("Failed to load invitation.");
  });
});
