/**
 * @jest-environment node
 */

import {
  signState,
  verifyState,
  encryptToken,
  decryptToken,
  buildAuthUrl,
  type OAuthState,
} from "@/lib/google-oauth";
import { randomBytes } from "crypto";

describe("OAuth state signing", () => {
  it("signs and verifies valid state", () => {
    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() + 60000, // 1 minute from now
    };

    const signed = signState(state);
    expect(typeof signed).toBe("string");
    expect(signed).toContain(".");

    const verified = verifyState(signed);
    expect(verified).toEqual(state);
  });

  it("rejects tampered state", () => {
    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() + 60000,
    };

    const signed = signState(state);
    const tampered = signed.replace("user-123", "user-999");

    const verified = verifyState(tampered);
    expect(verified).toBeNull();
  });

  it("rejects expired state", () => {
    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() - 1000, // Expired 1 second ago
    };

    const signed = signState(state);
    const verified = verifyState(signed);
    expect(verified).toBeNull();
  });

  it("rejects malformed state", () => {
    expect(verifyState("not-a-valid-state")).toBeNull();
    expect(verifyState("no-dot")).toBeNull();
    expect(verifyState("")).toBeNull();
  });
});

describe("Token encryption", () => {
  const originalKey = process.env.GOOGLE_TOKEN_ENC_KEY;

  beforeAll(() => {
    // Set a test encryption key (32 bytes base64)
    const testKey = randomBytes(32).toString("base64");
    process.env.GOOGLE_TOKEN_ENC_KEY = testKey;
  });

  afterAll(() => {
    if (originalKey) {
      process.env.GOOGLE_TOKEN_ENC_KEY = originalKey;
    } else {
      delete process.env.GOOGLE_TOKEN_ENC_KEY;
    }
  });

  it("encrypts and decrypts tokens correctly", () => {
    const plaintext = "ya29.a0AfH6SMBxxx-refresh-token-here-xxx";

    const encrypted = encryptToken(plaintext);
    expect(typeof encrypted).toBe("string");
    expect(encrypted).toContain("."); // Contains IV, auth tag, ciphertext
    expect(encrypted).not.toContain(plaintext); // Not plaintext

    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext", () => {
    const plaintext = "ya29.a0AfH6SMBxxx-refresh-token-here-xxx";

    const encrypted1 = encryptToken(plaintext);
    const encrypted2 = encryptToken(plaintext);

    expect(encrypted1).not.toBe(encrypted2); // Different IVs
    expect(decryptToken(encrypted1)).toBe(plaintext);
    expect(decryptToken(encrypted2)).toBe(plaintext);
  });

  it("rejects tampered ciphertext", () => {
    const plaintext = "ya29.a0AfH6SMBxxx-refresh-token-here-xxx";
    const encrypted = encryptToken(plaintext);

    // Tamper with the ciphertext
    const parts = encrypted.split(".");
    parts[2] = parts[2].slice(0, -1) + "X"; // Change last character
    const tampered = parts.join(".");

    expect(() => decryptToken(tampered)).toThrow();
  });

  it("rejects malformed encrypted token", () => {
    expect(() => decryptToken("not-encrypted")).toThrow();
    expect(() => decryptToken("no.dots.here")).toThrow();
  });

  it("throws when encryption key is missing", () => {
    const saved = process.env.GOOGLE_TOKEN_ENC_KEY;
    delete process.env.GOOGLE_TOKEN_ENC_KEY;

    expect(() => encryptToken("test")).toThrow("GOOGLE_TOKEN_ENC_KEY not set");

    process.env.GOOGLE_TOKEN_ENC_KEY = saved;
  });

  it("throws when encryption key is wrong length", () => {
    const saved = process.env.GOOGLE_TOKEN_ENC_KEY;
    process.env.GOOGLE_TOKEN_ENC_KEY = randomBytes(16).toString("base64"); // Only 16 bytes

    expect(() => encryptToken("test")).toThrow("must be 32 bytes");

    process.env.GOOGLE_TOKEN_ENC_KEY = saved;
  });
});

describe("buildAuthUrl", () => {
  const originalClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;

  beforeAll(() => {
    process.env.GOOGLE_OAUTH_CLIENT_ID = "test-client-id.apps.googleusercontent.com";
  });

  afterAll(() => {
    if (originalClientId) {
      process.env.GOOGLE_OAUTH_CLIENT_ID = originalClientId;
    } else {
      delete process.env.GOOGLE_OAUTH_CLIENT_ID;
    }
  });

  it("builds valid OAuth URL with signed state", () => {
    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() + 60000,
    };

    const url = buildAuthUrl(state);

    expect(url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url).toContain("client_id=test-client-id.apps.googleusercontent.com");
    expect(url).toContain("access_type=offline");
    expect(url).toContain("prompt=consent");
    expect(url).toContain("state=");

    // Extract and verify state
    const urlObj = new URL(url);
    const stateParam = urlObj.searchParams.get("state");
    expect(stateParam).toBeTruthy();

    const verified = verifyState(stateParam!);
    expect(verified).toEqual(state);
  });

  it("includes required scopes", () => {
    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() + 60000,
    };

    const url = buildAuthUrl(state);

    expect(url).toContain("calendar.events");
    expect(url).toContain("calendar.calendarlist.readonly");
    expect(url).not.toContain("userinfo.email");
    expect(url).not.toContain("openid");
  });

  it("throws when client ID is missing", () => {
    const saved = process.env.GOOGLE_OAUTH_CLIENT_ID;
    delete process.env.GOOGLE_OAUTH_CLIENT_ID;

    const state: OAuthState = {
      userId: "user-123",
      orgId: "org-456",
      nonce: "abc123",
      returnPath: "/settings",
      expiresAt: Date.now() + 60000,
    };

    expect(() => buildAuthUrl(state)).toThrow("GOOGLE_OAUTH_CLIENT_ID not set");

    process.env.GOOGLE_OAUTH_CLIENT_ID = saved;
  });
});
