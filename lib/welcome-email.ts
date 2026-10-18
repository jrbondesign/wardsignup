import { escapeHtml } from "@/lib/html-escape";
import { WELCOME_REMINDERS_LINE } from "@/lib/reminder-copy";

export interface WelcomeEmailInput {
  firstName: string;
  /** Brand quick start sentence (brand.email.welcomeQuickStartBold). */
  quickPlain: string;
  brandName: string;
  siteHost: string;
  /** Site URL with welcome email UTM params. */
  siteUrlWithUtm: string;
}

/** Plain text and HTML bodies of the new creator welcome email. */
export function buildWelcomeEmail({
  firstName,
  quickPlain,
  brandName,
  siteHost,
  siteUrlWithUtm,
}: WelcomeEmailInput): { text: string; html: string } {
  const safeFirst = escapeHtml(firstName);
  const brand = { name: brandName, siteHost };
  const text = `Hi ${firstName},

Thanks for signing up. You're one of our very first users!

Quick start: ${quickPlain}

✨ Members don't need an account. They just open your link, pick a slot, and enter their name.

${WELCOME_REMINDERS_LINE}

This is free to use. If anything feels off, just reply. I read every message.

One quick question: What's the first event you plan to use it for?

Thanks again,
Jonathan

${brand.name} · ${siteUrlWithUtm}
Made with ❤️ in Arizona`;
  const html = `
        <div style="font-family: Georgia, 'Times New Roman', serif; max-width: 560px; margin: 0 auto; padding: 40px 20px; color: #0D2B35;">

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">Hi ${safeFirst},</p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            Thanks for signing up. You're one of our very first users!
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            <strong>Quick start:</strong> ${escapeHtml(quickPlain)}
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            ✨ Members don't need an account. They just open your link, pick a slot, and enter their name.
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            ${escapeHtml(WELCOME_REMINDERS_LINE)}
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 16px;">
            This is free to use. If anything feels off, just reply. I read every message.
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 24px;">
            One quick question: What's the first event you plan to use it for?
          </p>

          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 4px;">Thanks again,</p>
          <p style="font-size: 16px; line-height: 1.7; margin: 0 0 24px;">Jonathan</p>

          <div style="margin: 0; padding: 0; color: #5A8399;">
            <div style="margin: 0; padding: 0; font-size: 14px; line-height: 1.45;">
              ${escapeHtml(brand.name)} · <a href="${escapeHtml(siteUrlWithUtm)}" style="color: #0E96B0; text-decoration: none;">${escapeHtml(brand.siteHost)}</a>
            </div>
            <div style="margin: 0; padding: 0; font-size: 13px; line-height: 1.45;">
              Made with ❤️ in Arizona
            </div>
          </div>

        </div>
      `;
  return { text, html };
}
