/**
 * First-touch attribution on signup rows (columns from PR #69's migration
 * 20261016120000_attribution_tracking.sql on `signups`, and
 * 20261018120000_item_signup_attribution.sql on `item_signups`).
 *
 * The client sends these with every signup (lib/attribution.ts
 * getAttributionForSubmission). Values are untrusted: trimmed, capped and
 * stripped of control characters. Saving never throws and never fails the signup.
 */

export interface SignupAttribution {
  first_touch_utm_source?: string;
  first_touch_utm_medium?: string;
  first_touch_utm_campaign?: string;
  first_touch_ref?: string;
}

const KEYS = [
  "first_touch_utm_source",
  "first_touch_utm_medium",
  "first_touch_utm_campaign",
  "first_touch_ref",
] as const;

export const ATTRIBUTION_MAX_LEN = 200;

function clean(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  // eslint-disable-next-line no-control-regex
  const s = v.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, ATTRIBUTION_MAX_LEN);
  return s || undefined;
}

/** Pick and clean the attribution fields from a request body; null when none. */
export function sanitizeSignupAttribution(body: unknown): SignupAttribution | null {
  if (!body || typeof body !== "object") return null;
  const out: SignupAttribution = {};
  for (const k of KEYS) {
    const v = clean((body as Record<string, unknown>)[k]);
    if (v) out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

type UpdateClient = {
  from: (table: string) => {
    update: (values: never) => {
      in: (col: string, ids: string[]) => PromiseLike<{ error: unknown }>;
    };
  };
};

/**
 * Save attribution on the given signup rows. Returns true when saved.
 * Never throws: a missing column (migration not applied yet) or any DB error
 * is logged and the signup still succeeds.
 */
export async function persistSignupAttribution(
  admin: unknown,
  table: "signups" | "item_signups",
  ids: ReadonlyArray<string | null | undefined>,
  attribution: SignupAttribution | null,
): Promise<boolean> {
  const rowIds = ids.filter((id): id is string => typeof id === "string" && id.length > 0);
  if (!admin || !attribution || rowIds.length === 0) return false;
  try {
    const { error } = await (admin as UpdateClient)
      .from(table)
      .update(attribution as never)
      .in("id", rowIds);
    if (error) {
      console.error(`signup attribution save (${table}) failed:`, error);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`signup attribution save (${table}) threw:`, e);
    return false;
  }
}
