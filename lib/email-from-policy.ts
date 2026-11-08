/** The only From address the Brevo cutover may use for Ward Signup. */
export const WARD_SIGNUP_FROM_EMAIL = "jonathan@wardsignup.com";
export const WARD_SIGNUP_FROM = "Jonathan <jonathan@wardsignup.com>";

export function wardSignupFrom(brandId: string):
  | { ok: true; from: string; email: string; name: string }
  | { ok: false; error: string } {
  if (brandId !== "wardsignup") {
    return { ok: false, error: "Brevo cutover From enforcement is only defined for wardsignup" };
  }
  return { ok: true, from: WARD_SIGNUP_FROM, email: WARD_SIGNUP_FROM_EMAIL, name: "Jonathan" };
}
