import { createHash, randomBytes } from "crypto";

const HASH_PREFIX = "h1:";

export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/** Stored form of an invite token (prefixed SHA-256). Safe if a member SELECTs the row. */
export function hashInviteToken(rawToken: string): string {
  const digest = createHash("sha256").update(rawToken, "utf8").digest("hex");
  return `${HASH_PREFIX}${digest}`;
}

export function isHashedInviteToken(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(HASH_PREFIX);
}
