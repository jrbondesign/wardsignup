/**
 * @jest-environment node
 */
jest.mock("@/lib/supabase/middleware", () => {
  const { NextResponse } = require("next/server");
  return {
    isProtectedPath: () => false,
    needsAuthSession: () => false,
    updateSession: async () => ({ response: NextResponse.next(), user: null, timedOut: false }),
  };
});

import { NextRequest } from "next/server";
import {
  canonicalPublicEventRedirect,
  cleanEventId,
  isPublicEventUuid,
  publicEventRedirectTarget,
  queryStringFromSearchParams,
} from "@/lib/public-event-id";
import {
  COPY_LINK_LINE_HINT,
  EVENT_NOT_FOUND_GUIDANCE,
  QR_DOWNLOAD_HINT,
} from "@/lib/public-event-copy";

const ID = "b7d1ead2-85c7-4d82-8a65-d2c75b553ebf";
const UPPER = "B7D1EAD2-85C7-4D82-8A65-D2C75B553EBF";
const DASHES = /[\u2010-\u2015]| - /;

function broken(raw: string): string {
  return raw.slice(0, 23) + "BROKEN" + raw.slice(23);
}

describe("cleanEventId", () => {
  it("removes a newline in the middle of a uuid", () => {
    expect(cleanEventId(`${ID.slice(0, 23)}\n${ID.slice(23)}`)).toBe(ID);
  });

  it("removes %0A, %0D, %09 and %20, in either case", () => {
    expect(cleanEventId(`${ID.slice(0, 23)}%0A${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)}%0a${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)}%0D${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)}%09${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)}%20${ID.slice(23)}`)).toBe(ID);
  });

  it("removes spaces and trailing whitespace", () => {
    expect(cleanEventId(`${ID} `)).toBe(ID);
    expect(cleanEventId(` ${ID}\n\t`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)} ${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID}%20`)).toBe(ID);
  });

  it("peels a double encoded newline (%250A)", () => {
    expect(cleanEventId(`${ID.slice(0, 23)}%250A${ID.slice(23)}`)).toBe(ID);
    expect(cleanEventId(`${ID.slice(0, 23)}%25250a${ID.slice(23)}`)).toBe(ID);
  });

  it("passes a valid uuid through unchanged, including case", () => {
    expect(cleanEventId(ID)).toBe(ID);
    expect(cleanEventId(UPPER)).toBe(UPPER);
    expect(isPublicEventUuid(UPPER)).toBe(true);
  });

  it("does not decode non-whitespace escapes", () => {
    const encodedHyphen = `${ID.slice(0, 8)}%2D${ID.slice(9)}`;
    expect(cleanEventId(encodedHyphen)).toBe(encodedHyphen);
    expect(isPublicEventUuid(cleanEventId(encodedHyphen))).toBe(false);
  });

  it("leaves a truncated id short of a uuid", () => {
    const truncated = `${ID.slice(0, 23)}\n${ID.slice(23, 34)}`;
    expect(cleanEventId(truncated)).toBe(ID.slice(0, 34));
    expect(isPublicEventUuid(cleanEventId(truncated))).toBe(false);
    expect(isPublicEventUuid(cleanEventId(broken(`${ID}%0A`)))).toBe(false);
  });
});

describe("canonicalPublicEventRedirect", () => {
  it("308 target keeps the flyer or og suffix and the query string", () => {
    const dirty = `${ID.slice(0, 23)}%0A${ID.slice(23)}`;
    expect(canonicalPublicEventRedirect(`/event/${dirty}`, "?utm_source=program&utm_medium=print")).toBe(
      `/event/${ID}?utm_source=program&utm_medium=print`
    );
    expect(canonicalPublicEventRedirect(`/event/${dirty}/flyer`, "?utm_source=bulletin")).toBe(
      `/event/${ID}/flyer?utm_source=bulletin`
    );
    expect(canonicalPublicEventRedirect(`/event/${ID.slice(0, 23)}\n${ID.slice(23)}/opengraph-image`, "")).toBe(
      `/event/${ID}/opengraph-image`
    );
  });

  it("does not redirect a clean uuid, an uppercase uuid, or a truncated id", () => {
    expect(canonicalPublicEventRedirect(`/event/${ID}`, "?utm_source=program")).toBeNull();
    expect(canonicalPublicEventRedirect(`/event/${UPPER}/flyer`, "?x=1")).toBeNull();
    const truncated = ID.slice(0, 30);
    expect(canonicalPublicEventRedirect(`/event/${truncated}%0A${ID.slice(30, 34)}`)).toBeNull();
    expect(isPublicEventUuid(cleanEventId(`${truncated}%0A`))).toBe(false);
  });

  it("keeps the original case when the only change is whitespace", () => {
    expect(canonicalPublicEventRedirect(`/event/${UPPER}%0A`)).toBe(`/event/${UPPER}`);
  });

  it("ignores other routes and refuses to rewrite a suffix that is not a public event page", () => {
    expect(canonicalPublicEventRedirect(`/admin/${ID}%0A`)).toBeNull();
    expect(canonicalPublicEventRedirect(`/event/${ID}%0A/../../login`)).toBeNull();
    expect(canonicalPublicEventRedirect(`/event/${ID}%0A/flyer/extra`)).toBeNull();
  });

  it("builds an absolute 308 destination and preserves the query", () => {
    const src = `https://wardsignup.com/event/${ID.slice(0, 23)}%0A${ID.slice(23)}/flyer?utm_source=program&utm_medium=print`;
    const dest = publicEventRedirectTarget(src);
    expect(dest?.href).toBe(`https://wardsignup.com/event/${ID}/flyer?utm_source=program&utm_medium=print`);
    expect(publicEventRedirectTarget(`https://wardsignup.com/event/${ID}`)).toBeNull();
  });

  it("keeps repeated search params for the page redirect", () => {
    expect(queryStringFromSearchParams({ utm_source: "program", tag: ["a", "b"] })).toBe(
      "?utm_source=program&tag=a&tag=b"
    );
    const dirty = `${ID.slice(0, 23)}\n${ID.slice(23)}`;
    expect(canonicalPublicEventRedirect(`/event/${dirty}/flyer`, queryStringFromSearchParams({ utm_source: "program" }))).toBe(
      `/event/${ID}/flyer?utm_source=program`
    );
  });
});

describe("public copy", () => {
  it("has no dashes", () => {
    for (const line of [EVENT_NOT_FOUND_GUIDANCE, QR_DOWNLOAD_HINT, COPY_LINK_LINE_HINT]) {
      expect(line).not.toMatch(DASHES);
      expect(line).not.toMatch(/-/);
    }
  });
});

describe("middleware event id redirect", () => {
  it("returns 308 to the canonical event url", async () => {
    jest.resetModules();
    const { middleware } = await import("@/middleware");
    const req = new NextRequest(
      `https://wardsignup.com/event/${ID.slice(0, 23)}%0A${ID.slice(23)}/flyer?utm_source=program`
    );
    const res = await middleware(req);
    expect(res.status).toBe(308);
    expect(res.headers.get("location")).toBe(
      `https://wardsignup.com/event/${ID}/flyer?utm_source=program`
    );
  });

  it("does not redirect a clean event url", async () => {
    jest.resetModules();
    const { middleware } = await import("@/middleware");
    const req = new NextRequest(`https://wardsignup.com/event/${ID}?utm_source=program`);
    const res = await middleware(req);
    expect(res.status).not.toBe(308);
    expect(res.headers.get("location")).toBeNull();
  });
});
