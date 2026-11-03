/**
 * @jest-environment node
 */
import { MAX_SCRUB_LENGTH, scrubDeep, scrubError, scrubExceptionEvent, scrubProperties, scrubText } from "@/lib/pii-scrub";

describe("scrubText", () => {
  it("redacts plain and URL encoded email addresses", () => {
    expect(scrubText("Resend rejected to=jane.doe+ward@example.org")).toBe("Resend rejected to=[email]");
    expect(scrubText("GET /api/x?email=jane%40example.org&x=1")).toBe("GET /api/x?email=[email]&x=1");
  });

  it("drops Postgres Key (...)=(...) values but keeps the columns", () => {
    const msg = 'duplicate key value violates unique constraint "signups_email_key" Key (event_id, email)=(42, jane@example.org) already exists.';
    expect(scrubText(msg)).toBe(
      'duplicate key value violates unique constraint "signups_email_key" Key (event_id, email)=([redacted]) already exists.',
    );
    expect(scrubText("Key (name)=(Jane Smith) already exists")).toBe("Key (name)=([redacted]) already exists");
  });

  it("redacts JWTs, bearer tokens and provider keys", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(scrubText(`token ${jwt} expired`)).toBe("token [jwt] expired");
    expect(scrubText("Authorization: Bearer abcDEF123456789xyz")).toBe("Authorization: Bearer [token]");
    expect(scrubText("bad key re_AbCdEf123456789012345678")).toBe("bad key [secret]");
    expect(scrubText("bad key sb_secret_AbCdEf1234567890abcdef")).toBe("bad key [secret]");
  });

  it("redacts secrets in query strings", () => {
    expect(scrubText("callback?code=4/0AbCdEf&state=xyz")).toBe("callback?code=[redacted]&state=xyz");
    expect(scrubText("https://x.test/cb?access_token=abc123&ok=1")).toBe("https://x.test/cb?access_token=[redacted]&ok=1");
  });

  it("redacts long hex and random looking base64 runs", () => {
    expect(scrubText("hash 0123456789abcdef0123456789abcdef done")).toBe("hash [hex] done");
    expect(scrubText("blob Zm9vYmFyQmF6UXV4MTIzNDU2Nzg5MEFiQ2RFZkdoSWpLbE1u end")).toBe("blob [secret] end");
  });

  it("redacts phone numbers with separators and E.164 numbers", () => {
    expect(scrubText("call (480) 555-0123 now")).toBe("call [phone] now");
    expect(scrubText("call +1 480-555-0123 now")).toBe("call [phone] now");
    expect(scrubText("sms to +14805550123 failed")).toBe("sms to [phone] failed");
    expect(scrubText("took 1730650000123 ms")).toBe("took 1730650000123 ms");
  });

  it("keeps prose like status code=500 but redacts the same name in a query string", () => {
    expect(scrubText("upstream status code=500")).toBe("upstream status code=500");
    expect(scrubText("/cb?code=abc")).toBe("/cb?code=[redacted]");
  });

  it("stays fast on huge inputs and truncates past the cap", () => {
    for (const big of ["a".repeat(200_000), "a.".repeat(100_000), "A1".repeat(100_000), "x@".repeat(100_000)]) {
      const start = Date.now();
      const out = scrubText(big);
      expect(Date.now() - start).toBeLessThan(500);
      expect(out.length).toBeLessThanOrEqual(MAX_SCRUB_LENGTH + 20);
    }
    const long = `${"a ".repeat(MAX_SCRUB_LENGTH)}jane@example.org`;
    expect(scrubText(long)).not.toContain("jane@example.org");
    expect(scrubText(long).endsWith("…[truncated]")).toBe(true);
  });

  it("leaves ordinary error text, UUIDs and stack positions alone", () => {
    const stack = [
      "Error: relation does not exist",
      "    at handler (/var/task/.next/server/app/api/signups/route.js:12:345)",
      "    at async /var/task/node_modules/next/dist/compiled/next-server/app-route.runtime.prod.js:6:38417",
    ].join("\n");
    expect(scrubText(stack)).toBe(stack);
    expect(scrubText("event 3f2c1a9e-8b7d-4c6e-9f10-112233445566 not found")).toBe(
      "event 3f2c1a9e-8b7d-4c6e-9f10-112233445566 not found",
    );
    expect(scrubText("")).toBe("");
  });
});

describe("scrubProperties", () => {
  it("scrubs strings and passes other values through", () => {
    expect(scrubProperties({ a: "x@y.co", n: 3, b: true, z: null })).toEqual({ a: "[email]", n: 3, b: true, z: null });
  });
});

describe("scrubError", () => {
  it("returns a scrubbed copy of an Error, message, stack and cause, without mutating it", () => {
    const cause = new Error("send failed for bob@example.com");
    const err = new Error("signup failed for jane@example.org", { cause });
    const copy = scrubError(err);
    expect(copy).not.toBe(err);
    expect(copy.message).toBe("signup failed for [email]");
    expect(copy.stack).toContain("signup failed for [email]");
    expect(copy.stack).not.toContain("jane@example.org");
    expect((copy as { cause?: Error }).cause?.message).toBe("send failed for [email]");
    expect(err.message).toBe("signup failed for jane@example.org");
  });

  it("keeps the error name", () => {
    const err = new TypeError("bad");
    expect(scrubError(err).name).toBe("TypeError");
  });

  it("turns a PostgREST error object into a scrubbed Error", () => {
    const copy = scrubError({ code: "23505", message: "Key (email)=(a@b.co) already exists", details: null });
    expect(copy).toBeInstanceOf(Error);
    expect(copy.message).toBe("Key (email)=([redacted]) already exists");
    expect(copy.name).toBe("Error 23505");
  });

  it("handles strings and other values", () => {
    expect(scrubError("oops a@b.co").message).toBe("oops [email]");
    expect(scrubError({ to: "a@b.co" }).message).toBe('{"to":"[email]"}');
    expect(scrubError(42).message).toBe("42");
  });
});

describe("scrubExceptionEvent", () => {
  it("scrubs $exception properties and leaves other properties and events alone", () => {
    const event = {
      event: "$exception",
      properties: {
        $exception_list: [{ type: "Error", value: "no account for jane@example.org", stacktrace: { frames: [{ filename: "app.js", lineno: 1 }] } }],
        $exception_message: "no account for jane@example.org",
        $current_url: "https://wardsignup.com/x",
      },
    };
    const out = scrubExceptionEvent(event);
    expect(out.properties.$exception_list).toEqual([
      { type: "Error", value: "no account for [email]", stacktrace: { frames: [{ filename: "app.js", lineno: 1 }] } },
    ]);
    expect(out.properties.$exception_message).toBe("no account for [email]");
    expect(out.properties.$current_url).toBe("https://wardsignup.com/x");
    expect(event.properties.$exception_message).toBe("no account for jane@example.org");

    const other = { event: "$pageview", properties: { note: "a@b.co" } };
    expect(scrubExceptionEvent(other)).toBe(other);
    expect(scrubExceptionEvent(null)).toBeNull();
  });

  it("scrubs page URLs on exception events", () => {
    const out = scrubExceptionEvent({
      event: "$exception",
      properties: { $current_url: "https://wardsignup.com/x?email=jane@example.org&token=abc", $referrer: "https://mail.test/?u=bob@example.com" },
    });
    expect(out.properties.$current_url).toBe("https://wardsignup.com/x?email=[email]&token=[redacted]");
    expect(out.properties.$referrer).toBe("https://mail.test/?u=[email]");
  });
});

describe("scrubDeep", () => {
  it("replaces values nested past the depth cap instead of sending them unscrubbed", () => {
    let deep: unknown = "jane@example.org";
    for (let i = 0; i < 20; i++) deep = { next: deep };
    expect(JSON.stringify(scrubDeep(deep))).not.toContain("jane@example.org");
    expect(JSON.stringify(scrubDeep(deep))).toContain("[truncated]");
  });
});
