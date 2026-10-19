/**
 * @jest-environment node
 */
const mockIsFeatureEnabled = jest.fn();
jest.mock("posthog-node", () => ({
  PostHog: jest.fn().mockImplementation(() => ({ isFeatureEnabled: mockIsFeatureEnabled })),
}));

import {
  FLAG_COVER_IMAGES,
  FLAG_GCAL_SYNC,
  __resetOrgFlagCacheForTests,
  allowlistOrFlag,
  isOrgFlagEnabled,
  type FlagClient,
} from "@/lib/posthog-flags";
import { isCoverImageEnabledForOrgOrFlag, isGcalSyncEnabledForOrgOrFlag } from "@/lib/org-feature-gates";
import { combineOrgFeatures } from "@/lib/org-features-client";

const ORG = "11111111-2222-4333-8444-555555555555";
const OTHER = "99999999-2222-4333-8444-555555555555";

const client = (impl: FlagClient["isFeatureEnabled"]): FlagClient => ({ isFeatureEnabled: jest.fn(impl) });

const ENV = { ...process.env };
beforeEach(() => {
  __resetOrgFlagCacheForTests();
  mockIsFeatureEnabled.mockReset();
  process.env = { ...ENV, NEXT_PUBLIC_POSTHOG_KEY: "phc_test" };
  delete process.env.POSTHOG_FLAGS_DISABLED;
  jest.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  (console.error as jest.Mock).mockRestore?.();
});
afterAll(() => {
  process.env = ENV;
});

describe("isOrgFlagEnabled (fails closed)", () => {
  it("true only for a literal true", async () => {
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => true) })).resolves.toBe(true);
    __resetOrgFlagCacheForTests();
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => false) })).resolves.toBe(false);
    __resetOrgFlagCacheForTests();
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => undefined) })).resolves.toBe(false);
    __resetOrgFlagCacheForTests();
    await expect(
      isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => "variant" as unknown as boolean) }),
    ).resolves.toBe(false);
  });

  it("false when PostHog throws or rejects", async () => {
    await expect(
      isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => { throw new Error("503"); }) }),
    ).resolves.toBe(false);
    await expect(
      isOrgFlagEnabled(FLAG_COVER_IMAGES, ORG, {
        client: { isFeatureEnabled: () => { throw new Error("sync throw"); } },
      }),
    ).resolves.toBe(false);
  });

  it("false when PostHog hangs past the timeout, and the timeout is not cached", async () => {
    const hang = client(() => new Promise<boolean>(() => {}));
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: hang, timeoutMs: 10 })).resolves.toBe(false);
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: client(async () => true) })).resolves.toBe(true);
  });

  it("false with no org, a non uuid org, no client, no key, or the env off switch", async () => {
    const on = client(async () => true);
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, null, { client: on })).resolves.toBe(false);
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, "not-a-uuid", { client: on })).resolves.toBe(false);
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: null })).resolves.toBe(false);
    process.env.POSTHOG_FLAGS_DISABLED = "1";
    await expect(isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: on })).resolves.toBe(false);
    expect(on.isFeatureEnabled).not.toHaveBeenCalled();
  });

  it("targets org:<id> with org_id inline and sends no $feature_flag_called events", async () => {
    const c = client(async () => true);
    await isOrgFlagEnabled(FLAG_COVER_IMAGES, ORG, { client: c });
    expect(c.isFeatureEnabled).toHaveBeenCalledWith(FLAG_COVER_IMAGES, `org:${ORG}`, {
      personProperties: { org_id: ORG },
      sendFeatureFlagEvents: false,
      disableGeoip: true,
    });
  });

  it("caches a real answer for a minute", async () => {
    let t = 1_000;
    const c = client(async () => true);
    await isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: c, now: () => t });
    await isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: c, now: () => t });
    expect(c.isFeatureEnabled).toHaveBeenCalledTimes(1);
    t += 61_000;
    await isOrgFlagEnabled(FLAG_GCAL_SYNC, ORG, { client: c, now: () => t });
    expect(c.isFeatureEnabled).toHaveBeenCalledTimes(2);
  });
});

describe("allowlistOrFlag", () => {
  it("allowlisted orgs never call PostHog", async () => {
    const c = client(async () => false);
    await expect(allowlistOrFlag(true, FLAG_GCAL_SYNC, ORG, { client: c })).resolves.toBe(true);
    expect(c.isFeatureEnabled).not.toHaveBeenCalled();
  });
  it("not allowlisted: flag decides; PostHog down means off", async () => {
    await expect(allowlistOrFlag(false, FLAG_GCAL_SYNC, ORG, { client: client(async () => true) })).resolves.toBe(true);
    __resetOrgFlagCacheForTests();
    await expect(
      allowlistOrFlag(false, FLAG_GCAL_SYNC, ORG, { client: client(async () => { throw new Error("down"); }) }),
    ).resolves.toBe(false);
  });
});

describe("isGcalSyncEnabledForOrgOrFlag", () => {
  beforeEach(() => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = ORG;
  });

  it("allowlisted org is on without asking PostHog", async () => {
    await expect(isGcalSyncEnabledForOrgOrFlag(ORG)).resolves.toBe(true);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });
  it("other org is on only when the flag is on", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    await expect(isGcalSyncEnabledForOrgOrFlag(OTHER)).resolves.toBe(true);
    __resetOrgFlagCacheForTests();
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    await expect(isGcalSyncEnabledForOrgOrFlag(OTHER)).resolves.toBe(false);
  });
  it("PostHog error falls back to the allowlist only", async () => {
    mockIsFeatureEnabled.mockRejectedValue(new Error("posthog down"));
    await expect(isGcalSyncEnabledForOrgOrFlag(ORG)).resolves.toBe(true);
    await expect(isGcalSyncEnabledForOrgOrFlag(OTHER)).resolves.toBe(false);
  });
  it("the env kill switch wins over allowlist and flag", async () => {
    process.env.FEATURE_GCAL_SYNC = "0";
    mockIsFeatureEnabled.mockResolvedValue(true);
    await expect(isGcalSyncEnabledForOrgOrFlag(ORG)).resolves.toBe(false);
    await expect(isGcalSyncEnabledForOrgOrFlag(OTHER)).resolves.toBe(false);
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });
  it("no org id is off", async () => {
    await expect(isGcalSyncEnabledForOrgOrFlag(null)).resolves.toBe(false);
  });
});

describe("isCoverImageEnabledForOrgOrFlag", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_FEATURE_COVER_IMAGE_ORG_IDS = ORG;
  });
  it("allowlist, flag, and PostHog down", async () => {
    await expect(isCoverImageEnabledForOrgOrFlag(ORG)).resolves.toBe(true);
    mockIsFeatureEnabled.mockResolvedValueOnce(true);
    await expect(isCoverImageEnabledForOrgOrFlag(OTHER)).resolves.toBe(true);
    __resetOrgFlagCacheForTests();
    mockIsFeatureEnabled.mockRejectedValueOnce(new Error("down"));
    await expect(isCoverImageEnabledForOrgOrFlag(OTHER)).resolves.toBe(false);
  });
  it("no PostHog key means allowlist only", async () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_KEY;
    await expect(isCoverImageEnabledForOrgOrFlag(OTHER)).resolves.toBe(false);
  });
});

describe("combineOrgFeatures (client)", () => {
  const none = { gcalSync: false, coverImages: false };
  it("server answer can only add, never remove", () => {
    expect(combineOrgFeatures({ gcalSync: true, coverImages: true }, { gcalSync: false, coverImages: false }, true)).toEqual({ gcalSync: true, coverImages: true });
    expect(combineOrgFeatures(none, { gcalSync: true, coverImages: true }, true)).toEqual({ gcalSync: true, coverImages: true });
  });
  it("missing, failed or junk server answers mean allowlist only", () => {
    expect(combineOrgFeatures(none, null, true)).toEqual(none);
    expect(combineOrgFeatures(none, undefined, true)).toEqual(none);
    expect(combineOrgFeatures(none, { gcalSync: "true", coverImages: 1 }, true)).toEqual(none);
  });
  it("client gcal kill switch wins", () => {
    expect(combineOrgFeatures({ gcalSync: true, coverImages: false }, { gcalSync: true }, false).gcalSync).toBe(false);
  });
});
