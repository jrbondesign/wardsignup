/**
 * One place for "is this a team or test account?" on the founder metrics page.
 *
 * Team list: anything at @jrbond.com, @wardsignup.com or @mail.grokbot.com,
 * bondesign@gmail.com and every bondesign+anything@gmail.com address, and
 * jrbond@me.com. Extra addresses can be added with CREATOR_NOTIFY_SKIP_EMAILS
 * (the founder notify skip list), so both lists stay in step.
 */
import { founderNotifySkipEmails } from "@/lib/founder-notify";

export const TEAM_EMAIL_DOMAINS = ["jrbond.com", "wardsignup.com", "mail.grokbot.com"] as const;
export const TEAM_EXACT_EMAILS = ["bondesign@gmail.com", "jrbond@me.com"] as const;
/** bondesign@gmail.com plus any +tag alias of it. */
const BONDESIGN_ALIAS = /^bondesign(\+[^@]*)?@gmail\.com$/;

function normalize(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

/** Built in team rule only (no env extras). */
export function isBuiltInTeamEmail(email: string | null | undefined): boolean {
  const e = normalize(email);
  if (!e || !e.includes("@")) return false;
  if ((TEAM_EXACT_EMAILS as readonly string[]).includes(e)) return true;
  if (BONDESIGN_ALIAS.test(e)) return true;
  const domain = e.slice(e.lastIndexOf("@") + 1);
  return (TEAM_EMAIL_DOMAINS as readonly string[]).includes(domain);
}

/**
 * Team or test account. `extra` defaults to the founder notify skip list
 * (FOUNDER_NOTIFY_TO, jon@jrbond.com, bondesign@gmail.com and CREATOR_NOTIFY_SKIP_EMAILS).
 */
export function isTeamEmail(
  email: string | null | undefined,
  extra: ReadonlySet<string> = founderNotifySkipEmails(),
): boolean {
  const e = normalize(email);
  if (!e) return false;
  return isBuiltInTeamEmail(e) || extra.has(e);
}

/**
 * HogQL safe regex for the built in team rule, for PostHog person emails.
 * Kept next to isBuiltInTeamEmail so the two never drift (see tests).
 */
export const TEAM_EMAIL_HOGQL_REGEX =
  "^(bondesign(\\\\+[^@]*)?@gmail\\\\.com|jrbond@me\\\\.com|[^@]+@(jrbond\\\\.com|wardsignup\\\\.com|mail\\\\.grokbot\\\\.com))$";

export type SheetForTeamCheck = {
  id: string;
  created_by: string | null;
  user_email?: string | null;
  organization_id?: string | null;
};

/**
 * Team or test sheets, classified by the ward's CURRENT owner.
 *
 * A sheet that belongs to a ward is a team sheet only when that ward's current
 * owner is a team account, no matter who created it (so a ward Jonathan set up
 * and handed to a real leader, like Sweetwater Branch, counts as real). A sheet
 * with no ward, or whose ward owner is unknown, falls back to its creator
 * (created_by, then user_email).
 */
export function teamSheetIds(opts: {
  sheets: ReadonlyArray<SheetForTeamCheck>;
  /** organization id to current owner user id. */
  wardOwnerById: ReadonlyMap<string, string | null>;
  emailByUserId: ReadonlyMap<string, string | null | undefined>;
  isTeam?: (email: string | null | undefined) => boolean;
}): Set<string> {
  const isTeam = opts.isTeam ?? ((e) => isTeamEmail(e));
  const out = new Set<string>();
  for (const s of opts.sheets) {
    const ownerId = s.organization_id ? opts.wardOwnerById.get(s.organization_id) : null;
    if (ownerId) {
      if (isTeam(opts.emailByUserId.get(ownerId))) out.add(s.id);
      continue;
    }
    const creatorEmail = s.created_by ? opts.emailByUserId.get(s.created_by) : null;
    if (isTeam(creatorEmail ?? s.user_email ?? null)) out.add(s.id);
  }
  return out;
}
