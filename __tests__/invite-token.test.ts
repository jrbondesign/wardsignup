import { generateInviteToken, hashInviteToken, isHashedInviteToken } from "@/lib/invite-token";

describe("invite tokens", () => {
  it("hashes to a prefixed digest that does not contain the raw token", () => {
    const raw = generateInviteToken();
    const hashed = hashInviteToken(raw);
    expect(isHashedInviteToken(hashed)).toBe(true);
    expect(hashed.includes(raw)).toBe(false);
    expect(hashInviteToken(raw)).toBe(hashed);
  });
});
