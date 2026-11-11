type Env = Record<string, string | undefined>;

export type OutboundBlock =
  | { blocked: false }
  | { blocked: true; reason: "preview" | "EMAIL_OUTBOUND=off" };

/**
 * Preview deployments inherit the project's Preview Resend key. Refuse every
 * send and every email cron before a provider call or a database write.
 * Production is unchanged until EMAIL_OUTBOUND=off is set there on purpose.
 */
/** Body for an email cron that must not touch the database or a provider. */
export function emailCronDisabledBody(
  env: Env = process.env,
): { ok: true; disabled: true; reason: "preview" | "EMAIL_OUTBOUND=off"; sent: 0 } | null {
  const block = emailOutboundBlock(env);
  if (!block.blocked) return null;
  return { ok: true, disabled: true, reason: block.reason, sent: 0 };
}

export function emailOutboundBlock(env: Env = process.env): OutboundBlock {
  if (env.VERCEL_ENV?.trim() === "preview") return { blocked: true, reason: "preview" };
  if (env.EMAIL_OUTBOUND?.trim().toLowerCase() === "off") {
    return { blocked: true, reason: "EMAIL_OUTBOUND=off" };
  }
  return { blocked: false };
}
