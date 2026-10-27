/**
 * Signup form funnel tracking for the public sheet page (/event/[id]).
 *
 * Events, in funnel order (all carry the same ward-level ids so ward analysis
 * works without paid group analytics):
 *   sheet_viewed          once per page view, after the sheet loads
 *   signup_form_started   first interaction with any signup form, once per page view
 *   signup_email_entered  a valid email typed into a signup form, once per page view
 *   signup_completed      existing event, fired after a successful submit
 *
 * PRIVACY: none of these events may carry the email, name, phone or note.
 * Only ids, the sheet type and booleans. buildFunnelProps is the single place
 * properties are assembled, and it only accepts these fields.
 */

export type SheetType = "spots" | "items" | "rsvp";
export type SignupFormKind = "slots" | "item" | "custom_item";

export interface FunnelContext {
  /** Ward (organization) id; null when unknown (lookup failed or legacy event). */
  orgId: string | null;
  /**
   * Whether the ward is a test ward (lib/test-orgs). null when the lookup failed
   * or has not finished. Optional so older call sites still type check; missing
   * is sent as null.
   */
  isTestOrg?: boolean | null;
  /** Campaign id. The app calls a campaign an "event"; the URL id is the same value. */
  campaignId: string;
  sheetType: SheetType;
}

export interface FunnelProps {
  org_id: string | null;
  is_test_org: boolean | null;
  campaign_id: string;
  event_id: string;
  sheet_type: SheetType;
  [key: string]: string | number | boolean | null;
}

/** Ward-level ids shared by every funnel and signup event. */
export function buildFunnelProps(
  ctx: FunnelContext,
  extra: Record<string, string | number | boolean | null> = {},
): FunnelProps {
  return {
    ...extra,
    org_id: ctx.orgId,
    is_test_org: typeof ctx.isTestOrg === "boolean" ? ctx.isTestOrg : null,
    campaign_id: ctx.campaignId,
    event_id: ctx.campaignId,
    sheet_type: ctx.sheetType,
  };
}

type SuperPropertyClient = {
  register?(props: Record<string, string>): void;
  unregister?(key: string): void;
} | null | undefined;

/**
 * Puts the ward id on every later PostHog event from this browser as a super
 * property, including `$feature_flag_called` (the experiment exposure), which
 * buildFunnelProps can't reach. Same privacy rule: the id only, never PII.
 * register, not register_once: one browser can open sheets from different
 * wards, so the newest sheet wins. A missing or empty id removes it so a
 * previous ward never sticks to this sheet. Never throws.
 */
export function syncOrgIdSuperProperty(client: SuperPropertyClient, orgId: string | null | undefined): void {
  try {
    if (!client) return;
    if (typeof orgId === "string" && orgId.trim() !== "") client.register?.({ org_id: orgId });
    else client.unregister?.("org_id");
  } catch {
    // Analytics must never break the signup page.
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Loose syntactic check, only used to decide whether to fire signup_email_entered. */
export function isLikelyEmail(value: string | null | undefined): boolean {
  if (typeof value !== "string") return false;
  const v = value.trim();
  return v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v);
}

type Capture = (event: string, props: Record<string, unknown>) => void;

/**
 * Per page view tracker. Each funnel step fires at most once per instance;
 * create one instance per page view (the page keeps it in a ref keyed on the
 * event id).
 */
export class SignupFunnelTracker {
  private fired = new Set<string>();

  constructor(private readonly capture: Capture) {}

  private once(name: string, props: Record<string, unknown>): boolean {
    if (this.fired.has(name)) return false;
    this.fired.add(name);
    try {
      this.capture(name, props);
    } catch {
      // Analytics must never break the signup page.
    }
    return true;
  }

  sheetViewed(ctx: FunnelContext, extra: { slot_count?: number; item_count?: number } = {}): boolean {
    return this.once("sheet_viewed", buildFunnelProps(ctx, extra));
  }

  formStarted(ctx: FunnelContext, form: SignupFormKind, trigger: "field_focus" | "slot_selected"): boolean {
    return this.once("signup_form_started", buildFunnelProps(ctx, { form, trigger }));
  }

  /** Fires only for a valid looking email. The email itself is never sent. */
  emailEntered(ctx: FunnelContext, form: SignupFormKind, email: string): boolean {
    if (!isLikelyEmail(email)) return false;
    return this.once("signup_email_entered", buildFunnelProps(ctx, { form }));
  }

  hasFired(name: string): boolean {
    return this.fired.has(name);
  }
}
