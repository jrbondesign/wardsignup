"use client";

import TurnstileWidget from "@/components/TurnstileWidget";
import type { CaptchaState } from "@/lib/use-captcha";

/**
 * Turnstile on a public signup form. Renders nothing until the Turnstile keys
 * are set. Hidden unless Cloudflare needs the person to click (interaction
 * only), so most people never see it.
 */
export default function SignupCaptcha({ captcha, action }: { captcha: CaptchaState; action: string }) {
  if (!captcha.enabled) return null;
  return (
    <TurnstileWidget
      siteKey={captcha.siteKey}
      onToken={captcha.onToken}
      onError={captcha.onError}
      resetKey={captcha.resetKey}
      action={action}
      appearance="interaction-only"
    />
  );
}
