import { describe, it, expect } from "@jest/globals";
import { isBuiltInTeamEmail, isTeamEmail, teamSheetIds, TEAM_EMAIL_HOGQL_REGEX } from "@/lib/team-accounts";

describe("team account list", () => {
  it.each([
    "jon@jrbond.com",
    "jon+test@jrbond.com",
    "melanie@jrbond.com",
    "jonathan@wardsignup.com",
    "bondesign@gmail.com",
    "bondesign+jasper@gmail.com",
    "BONDESIGN+Test@Gmail.com",
    "wendy@mail.grokbot.com",
    "jrbond@me.com",
    "  jon@JRBOND.com ",
  ])("%s is team", (email) => {
    expect(isBuiltInTeamEmail(email)).toBe(true);
  });

  it.each([
    "leader@example.com",
    "bondesign2@gmail.com",
    "xbondesign@gmail.com",
    "someone@gmail.com",
    "jon@jrbond.com.evil.com",
    "jrbond@icloud.com",
    "",
    null,
    undefined,
  ])("%s is not team", (email) => {
    expect(isBuiltInTeamEmail(email as string | null | undefined)).toBe(false);
  });

  it("honours extra skip emails", () => {
    expect(isTeamEmail("helper@example.com", new Set(["helper@example.com"]))).toBe(true);
    expect(isTeamEmail("helper@example.com", new Set())).toBe(false);
  });

  it("HogQL regex agrees with the TypeScript rule", () => {
    // The TS string holds HogQL escapes (\\\\ in the source becomes \\ in HogQL, then \ in the regex).
    const re = new RegExp(TEAM_EMAIL_HOGQL_REGEX.replace(/\\\\/g, "\\"));
    for (const e of ["jon+x@jrbond.com", "bondesign+a@gmail.com", "jrbond@me.com", "a@mail.grokbot.com", "jonathan@wardsignup.com"]) {
      expect(re.test(e)).toBe(true);
    }
    for (const e of ["leader@example.com", "bondesign2@gmail.com", "jon@jrbond.com.evil.com", "jrbondxme.com"]) {
      expect(re.test(e)).toBe(false);
    }
  });
});

describe("team sheets by the ward's current owner", () => {
  const emailByUserId = new Map<string, string | null>([
    ["u-jon", "jon@jrbond.com"],
    ["u-leader", "leader@example.com"],
    ["u-test", "bondesign+test@gmail.com"],
  ]);
  const wardOwnerById = new Map<string, string | null>([
    ["ward-sweetwater", "u-leader"], // Jonathan set it up, a real leader owns it now
    ["ward-test", "u-test"],
    ["ward-real", "u-leader"],
  ]);

  it("a sheet Jonathan created in a ward now owned by a real leader counts as real (Sweetwater Branch)", () => {
    const out = teamSheetIds({
      sheets: [{ id: "s1", created_by: "u-jon", user_email: "jon@jrbond.com", organization_id: "ward-sweetwater" }],
      wardOwnerById,
      emailByUserId,
    });
    expect(out.has("s1")).toBe(false);
  });

  it("a real leader's sheet in a team owned ward is a team sheet", () => {
    const out = teamSheetIds({
      sheets: [{ id: "s2", created_by: "u-leader", user_email: "leader@example.com", organization_id: "ward-test" }],
      wardOwnerById,
      emailByUserId,
    });
    expect(out.has("s2")).toBe(true);
  });

  it("sheets with no ward fall back to the creator", () => {
    const out = teamSheetIds({
      sheets: [
        { id: "s3", created_by: "u-jon", organization_id: null },
        { id: "s4", created_by: "u-leader", organization_id: null },
        { id: "s5", created_by: null, user_email: "bondesign+x@gmail.com", organization_id: null },
      ],
      wardOwnerById,
      emailByUserId,
    });
    expect([...out].sort()).toEqual(["s3", "s5"]);
  });

  it("real ward with real owner stays real", () => {
    const out = teamSheetIds({
      sheets: [{ id: "s6", created_by: "u-leader", organization_id: "ward-real" }],
      wardOwnerById,
      emailByUserId,
    });
    expect(out.size).toBe(0);
  });
});
