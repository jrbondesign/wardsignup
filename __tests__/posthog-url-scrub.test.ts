import {
  maskReplayNetworkRequest,
  REDACTED_VALUE,
  scrubAuthParams,
  scrubAuthParamsDeep,
  scrubAuthParamsFromEvent,
} from "@/lib/posthog-url-scrub";

const R = REDACTED_VALUE;

describe("scrubAuthParams", () => {
  it("removes token_hash from a magic link callback and keeps other params", () => {
    expect(
      scrubAuthParams("https://www.wardsignup.com/auth/callback?token_hash=pkce_abc123XYZ&type=magiclink&next=%2Fdashboard"),
    ).toBe(`https://www.wardsignup.com/auth/callback?token_hash=${R}&type=magiclink&next=%2Fdashboard`);
  });

  it("removes PKCE and OAuth codes", () => {
    expect(scrubAuthParams("/auth/callback?code=4f2b-77aa-9c")).toBe(`/auth/callback?code=${R}`);
    expect(scrubAuthParams("/auth/callback?utm_source=email&code=abc&ref=x")).toBe(
      `/auth/callback?utm_source=email&code=${R}&ref=x`,
    );
  });

  it("removes implicit grant tokens in the hash", () => {
    expect(
      scrubAuthParams(
        "https://x.test/auth/callback#access_token=eyJhbGciOi.eyJzdWIi.sig&expires_in=3600&refresh_token=r3fr35h&token_type=bearer&type=magiclink",
      ),
    ).toBe(
      `https://x.test/auth/callback#access_token=${R}&expires_in=3600&refresh_token=${R}&token_type=bearer&type=magiclink`,
    );
  });

  it("removes an org invite token nested and URL encoded inside next", () => {
    const url =
      "https://x.test/auth/callback?token_hash=th1&type=email&next=%2Forgs%2Faccept%3Ftoken%3Dinvite123%26foo%3Dbar";
    expect(scrubAuthParams(url)).toBe(
      `https://x.test/auth/callback?token_hash=${R}&type=email&next=%2Forgs%2Faccept%3Ftoken%3D${R}%26foo%3Dbar`,
    );
  });

  it("handles double encoded nesting", () => {
    expect(scrubAuthParams("/a?next=%252Fx%253Ftoken_hash%253Dsecret%2526a%253D1")).toBe(
      `/a?next=%252Fx%253Ftoken_hash%253D${R}%2526a%253D1`,
    );
  });

  it("is case insensitive on the name", () => {
    expect(scrubAuthParams("/cb?Token_Hash=abc")).toBe(`/cb?Token_Hash=${R}`);
  });

  it("leaves look alike params and plain URLs untouched", () => {
    const urls = [
      "https://www.wardsignup.com/event/123?ref=share&utm_campaign=ward",
      "/auth/callback?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid",
      "/x?zipcode=84101&promo_code=FREE&token_type=bearer",
      "/x?type=magiclink",
      "status code=500",
      "",
    ];
    for (const u of urls) expect(scrubAuthParams(u)).toBe(u);
  });

  it("leaves empty values alone and is idempotent", () => {
    expect(scrubAuthParams("/cb?code=&a=1")).toBe("/cb?code=&a=1");
    const once = scrubAuthParams("/cb?token_hash=abc&code=def");
    expect(scrubAuthParams(once)).toBe(once);
  });

  it("passes non strings through", () => {
    expect(scrubAuthParams(undefined as unknown as string)).toBeUndefined();
    expect(scrubAuthParams(42 as unknown as string)).toBe(42);
  });
});

describe("scrubAuthParamsDeep", () => {
  it("scrubs nested strings without mutating the input", () => {
    const input = { a: "/cb?code=x", b: [{ c: "/cb?token=y" }], n: 1, z: null };
    const out = scrubAuthParamsDeep(input);
    expect(out).toEqual({ a: `/cb?code=${R}`, b: [{ c: `/cb?token=${R}` }], n: 1, z: null });
    expect(input.a).toBe("/cb?code=x");
  });

  it("scrubs object keys, as $$heatmap keys data by page URL", () => {
    const out = scrubAuthParamsDeep({ $heatmap_data: { "https://x.test/auth/callback?token_hash=abc": [{ x: 1 }] } });
    expect(out).toEqual({ $heatmap_data: { [`https://x.test/auth/callback?token_hash=${R}`]: [{ x: 1 }] } });
  });
});

describe("scrubAuthParamsFromEvent", () => {
  const callback = "https://preview.wardsignup.com/auth/callback?token_hash=fake123&type=magiclink";

  it("scrubs $pageview URL properties and person props", () => {
    const event = {
      event: "$pageview",
      uuid: "u1",
      properties: {
        $current_url: callback,
        $pathname: "/auth/callback",
        $referrer: callback,
        $session_entry_url: callback,
        $elements_chain: `a:href="${callback}"nth-child="1"`,
        $host: "preview.wardsignup.com",
        count: 3,
      },
      $set_once: { $initial_current_url: callback, $initial_pathname: "/auth/callback" },
      $set: { $current_url: callback },
    };
    const out = scrubAuthParamsFromEvent(event);
    const clean = `https://preview.wardsignup.com/auth/callback?token_hash=${R}&type=magiclink`;
    expect(out.properties.$current_url).toBe(clean);
    expect(out.properties.$referrer).toBe(clean);
    expect(out.properties.$session_entry_url).toBe(clean);
    expect(out.properties.$elements_chain).not.toContain("fake123");
    expect(out.properties.$pathname).toBe("/auth/callback");
    expect(out.properties.count).toBe(3);
    expect(out.$set_once.$initial_current_url).toBe(clean);
    expect(out.$set.$current_url).toBe(clean);
    expect(out.uuid).toBe("u1");
    expect(JSON.stringify(out)).not.toContain("fake123");
  });

  it("never drops an event", () => {
    expect(scrubAuthParamsFromEvent(null)).toBeNull();
    const plain = { event: "signup_completed", properties: { $current_url: "https://x.test/e/1?ref=a" } };
    expect(scrubAuthParamsFromEvent(plain)).toEqual(plain);
  });

  it("only rewrites page hrefs inside replay snapshot data", () => {
    const dom = { type: 2, data: { node: { text: "token_hash=keep-dom-as-is" } } };
    const meta = { type: 4, data: { href: callback, width: 100, height: 100 } };
    const out = scrubAuthParamsFromEvent({
      event: "$snapshot",
      properties: { $session_id: "s1", $current_url: callback, $snapshot_data: [dom, meta] },
    });
    const data = out.properties.$snapshot_data as Array<{ data: Record<string, unknown> }>;
    expect(data[0]).toBe(dom);
    expect(data[1].data.href).toBe(`https://preview.wardsignup.com/auth/callback?token_hash=${R}&type=magiclink`);
    expect(data[1].data.width).toBe(100);
    expect(out.properties.$current_url).not.toContain("fake123");
    expect(meta.data.href).toBe(callback);
  });
});

describe("maskReplayNetworkRequest", () => {
  it("scrubs the request URL and the replay href passed as name", () => {
    expect(maskReplayNetworkRequest({ name: "/auth/callback/exchange?token_hash=abc&type=email" }).name).toBe(
      `/auth/callback/exchange?token_hash=${R}&type=email`,
    );
    expect(maskReplayNetworkRequest({ name: "/api/signups/cancel/lookup?token=t1", url: "/x?code=c" })).toMatchObject({
      name: `/api/signups/cancel/lookup?token=${R}`,
      url: `/x?code=${R}`,
    });
  });

  it("keeps the SDK body deny list that a custom mask function turns off", () => {
    const out = maskReplayNetworkRequest({
      name: "https://abc.supabase.co/auth/v1/token?grant_type=pkce",
      requestBody: '{"auth_code":"x","code_verifier":"y"}',
      responseBody: '{"access_token":"eyJ...","refresh_token":"r"}',
    });
    expect(out.requestBody).toMatch(/redacted/);
    expect(out.responseBody).toMatch(/redacted/);
    expect(JSON.stringify(out)).not.toContain('"r"');
  });

  it("redacts card numbers and SSNs like the SDK", () => {
    expect(maskReplayNetworkRequest({ name: "/x", requestBody: "4111 1111 1111 1111" }).requestBody).toMatch(/redacted/);
    expect(maskReplayNetworkRequest({ name: "/x", responseBody: "123-45-6789" }).responseBody).toMatch(/redacted/);
  });

  it("leaves ordinary requests alone", () => {
    const req = { name: "/api/events/123?ref=share", requestBody: '{"name":"Bishop"}', responseBody: undefined, duration: 12 };
    expect(maskReplayNetworkRequest(req)).toEqual(req);
  });
});
