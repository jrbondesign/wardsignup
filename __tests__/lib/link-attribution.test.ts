/**
 * @jest-environment node
 */
import { shareLink } from "@/lib/share-links";
import { participantManageLink } from "@/lib/participant-email";
import { persistSignupAttribution, sanitizeSignupAttribution, ATTRIBUTION_MAX_LEN } from "@/lib/signup-attribution";

describe("shareLink", () => {
  it("adds ref=share", () => {
    expect(shareLink("https://wardsignup.com/event/abc")).toBe("https://wardsignup.com/event/abc?ref=share");
  });
  it("keeps existing params and the hash, no double ?", () => {
    const out = shareLink("https://wardsignup.com/event/abc?view=list#slots");
    expect(out).toBe("https://wardsignup.com/event/abc?view=list&ref=share#slots");
    expect(out.split("?")).toHaveLength(2);
  });
  it("never overwrites an existing ref", () => {
    expect(shareLink("https://wardsignup.com/w/ward-1?ref=qr")).toBe("https://wardsignup.com/w/ward-1?ref=qr");
  });
  it("leaves an unparseable (relative) url alone", () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    expect(shareLink("/event/abc")).toBe("/event/abc");
  });
});

describe("participantManageLink", () => {
  const token = "c0ffee00-1111-4222-8333-444455556666";
  it("tags cancel links and keeps the token path", () => {
    const out = participantManageLink(`https://wardsignup.com/cancel/${token}`, "reminder");
    const u = new URL(out);
    expect(u.pathname).toBe(`/cancel/${token}`);
    expect(u.searchParams.get("utm_source")).toBe("participant_email");
    expect(u.searchParams.get("utm_medium")).toBe("email");
    expect(u.searchParams.get("utm_campaign")).toBe("reminder");
  });
  it("keeps an existing query param and has one ?", () => {
    const out = participantManageLink(`https://wardsignup.com/cancel/${token}?slot=2`, "batch_confirmation");
    expect(out.split("?")).toHaveLength(2);
    expect(new URL(out).searchParams.get("slot")).toBe("2");
    expect(new URL(out).searchParams.get("utm_campaign")).toBe("batch_confirmation");
  });
});

describe("sanitizeSignupAttribution", () => {
  it("picks only the four fields, trimmed", () => {
    expect(
      sanitizeSignupAttribution({
        first_touch_utm_source: " participant_email ",
        first_touch_ref: "share",
        member_email: "x@y.co",
        first_touch_utm_medium: "",
      }),
    ).toEqual({ first_touch_utm_source: "participant_email", first_touch_ref: "share" });
  });
  it("null when nothing usable", () => {
    expect(sanitizeSignupAttribution({})).toBeNull();
    expect(sanitizeSignupAttribution(null)).toBeNull();
    expect(sanitizeSignupAttribution({ first_touch_ref: 42 })).toBeNull();
  });
  it("caps length and strips control characters", () => {
    const r = sanitizeSignupAttribution({ first_touch_utm_campaign: "a\u0000b" + "x".repeat(500) });
    expect(r!.first_touch_utm_campaign!.startsWith("ab")).toBe(true);
    expect(r!.first_touch_utm_campaign!.length).toBe(ATTRIBUTION_MAX_LEN);
  });
});

describe("persistSignupAttribution", () => {
  const client = (result: { error: unknown } | Error) => {
    const inFn = jest.fn(() => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)));
    const update = jest.fn(() => ({ in: inFn }));
    const from = jest.fn(() => ({ update }));
    return { from, update, inFn };
  };
  it("updates every row id", async () => {
    const c = client({ error: null });
    await expect(persistSignupAttribution(c, "signups", ["a", "b", null], { first_touch_ref: "share" })).resolves.toBe(true);
    expect(c.from).toHaveBeenCalledWith("signups");
    expect(c.update).toHaveBeenCalledWith({ first_touch_ref: "share" });
    expect(c.inFn).toHaveBeenCalledWith("id", ["a", "b"]);
  });
  it("skips with no attribution, no ids or no admin", async () => {
    const c = client({ error: null });
    await expect(persistSignupAttribution(c, "signups", ["a"], null)).resolves.toBe(false);
    await expect(persistSignupAttribution(c, "signups", [], { first_touch_ref: "share" })).resolves.toBe(false);
    await expect(persistSignupAttribution(null, "signups", ["a"], { first_touch_ref: "share" })).resolves.toBe(false);
    expect(c.from).not.toHaveBeenCalled();
  });
  it("never throws on a DB error or a missing column", async () => {
    jest.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      persistSignupAttribution(client({ error: { message: 'column "first_touch_ref" does not exist' } }), "item_signups", ["a"], { first_touch_ref: "share" }),
    ).resolves.toBe(false);
    await expect(persistSignupAttribution(client(new Error("network")), "signups", ["a"], { first_touch_ref: "share" })).resolves.toBe(false);
  });
});
