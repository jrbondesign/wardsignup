import { createHash } from "crypto";
import { isBrevoCutoverEnabled } from "@/lib/email-cutover-config";

type Env = Record<string, string | undefined>;

/**
 * Stable cutover idempotency key for one business operation.
 * Returns undefined while the gate is off, so the live Resend path keeps
 * minting its own per-call key.
 * A missing part refuses the key rather than collapsing different operations
 * (a new login token, a different signup) onto one row.
 */
export function cutoverOperationKey(
  purpose: "magic_link" | "signup_confirmation" | "org_invite" | "reminder",
  parts: Array<string | null | undefined>,
  env: Env = process.env,
): string | undefined {
  if (!isBrevoCutoverEnabled(env)) return undefined;
  if (parts.length === 0 || parts.some((part) => !part?.trim())) return undefined;
  const material = parts.map((part) => part!.trim().toLowerCase()).join("\n");
  const hash = createHash("sha256").update(`${purpose}\n${material}`).digest("hex").slice(0, 32);
  return `${purpose}/${hash}`;
}
