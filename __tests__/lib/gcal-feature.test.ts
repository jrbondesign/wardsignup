/**
 * @jest-environment node
 */

import {
  isGcalSyncEnabledForOrg,
  isGcalSyncFeatureEnabled,
  isGcalSyncUIEnabled,
} from "@/lib/gcal-feature";

describe("isGcalSyncEnabledForOrg", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns false when flag is off", () => {
    process.env.FEATURE_GCAL_SYNC = "0";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7";
    
    expect(isGcalSyncEnabledForOrg("50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7")).toBe(false);
  });

  it("returns false when flag is missing", () => {
    delete process.env.FEATURE_GCAL_SYNC;
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7";
    
    expect(isGcalSyncEnabledForOrg("50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7")).toBe(false);
  });

  it("returns false when flag is on but allowlist is empty", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "";
    
    expect(isGcalSyncEnabledForOrg("50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7")).toBe(false);
  });

  it("returns false when flag is on but allowlist is missing", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    delete process.env.FEATURE_GCAL_SYNC_ORG_IDS;
    
    expect(isGcalSyncEnabledForOrg("50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7")).toBe(false);
  });

  it("returns true when flag is on and org is in allowlist", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7";
    
    expect(isGcalSyncEnabledForOrg("50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7")).toBe(true);
  });

  it("returns false when flag is on but org is not in allowlist", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "50acfa4e-d6c5-44e4-93e1-a77c7d2b60c7";
    
    expect(isGcalSyncEnabledForOrg("other-org-id")).toBe(false);
  });

  it("handles multiple orgs in allowlist", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = "org-1,org-2,org-3";
    
    expect(isGcalSyncEnabledForOrg("org-1")).toBe(true);
    expect(isGcalSyncEnabledForOrg("org-2")).toBe(true);
    expect(isGcalSyncEnabledForOrg("org-3")).toBe(true);
    expect(isGcalSyncEnabledForOrg("org-4")).toBe(false);
  });

  it("handles whitespace in allowlist", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    process.env.FEATURE_GCAL_SYNC_ORG_IDS = " org-1 , org-2 , org-3 ";
    
    expect(isGcalSyncEnabledForOrg("org-1")).toBe(true);
    expect(isGcalSyncEnabledForOrg("org-2")).toBe(true);
  });
});

describe("isGcalSyncFeatureEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns true when flag is 1", () => {
    process.env.FEATURE_GCAL_SYNC = "1";
    expect(isGcalSyncFeatureEnabled()).toBe(true);
  });

  it("returns false when flag is 0", () => {
    process.env.FEATURE_GCAL_SYNC = "0";
    expect(isGcalSyncFeatureEnabled()).toBe(false);
  });

  it("returns false when flag is missing", () => {
    delete process.env.FEATURE_GCAL_SYNC;
    expect(isGcalSyncFeatureEnabled()).toBe(false);
  });
});

describe("isGcalSyncUIEnabled", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("returns false when client flag is off", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "0";
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = "org-1";
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(false);
  });

  it("returns false when client flag is missing", () => {
    delete process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC;
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = "org-1";
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(false);
  });

  it("returns true when client flag is on and no org provided", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    
    expect(isGcalSyncUIEnabled()).toBe(true);
  });

  it("returns false when client flag is on, org provided, but allowlist is empty", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = "";
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(false);
  });

  it("returns false when client flag is on, org provided, but allowlist is missing", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    delete process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS;
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(false);
  });

  it("returns true when client flag is on and org is in allowlist", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = "org-1,org-2";
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(true);
    expect(isGcalSyncUIEnabled("org-2")).toBe(true);
  });

  it("returns false when client flag is on but org is not in allowlist", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = "org-1";
    
    expect(isGcalSyncUIEnabled("org-3")).toBe(false);
  });

  it("handles whitespace in client allowlist", () => {
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC = "1";
    process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS = " org-1 , org-2 ";
    
    expect(isGcalSyncUIEnabled("org-1")).toBe(true);
    expect(isGcalSyncUIEnabled("org-2")).toBe(true);
  });
});
