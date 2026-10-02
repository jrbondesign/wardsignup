/**
 * Google Calendar sync feature gate (dual kill switch + org allowlist).
 * Follows the same pattern as AI event create.
 *
 * Requirements for feature to be enabled for an org:
 * 1. FEATURE_GCAL_SYNC=1 (server)
 * 2. NEXT_PUBLIC_FEATURE_GCAL_SYNC=1 (client, for UI gating)
 * 3. Org UUID is in FEATURE_GCAL_SYNC_ORG_IDS allowlist (server)
 * 4. Org UUID is in NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS allowlist (client)
 *
 * Both server and client allowlists must contain the same orgs for consistency.
 * Default: flags off, allowlists empty — safe with keys present but feature dark.
 */

/**
 * Server-side check: is Google Calendar sync enabled for this org?
 */
export function isGcalSyncEnabledForOrg(orgId: string): boolean {
  // Server flag must be exactly "1"
  if (process.env.FEATURE_GCAL_SYNC !== '1') {
    return false;
  }

  // Allowlist: comma-separated org UUIDs; empty/unset = nobody
  const allowlistRaw = process.env.FEATURE_GCAL_SYNC_ORG_IDS || '';
  const allowlist = allowlistRaw
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  if (allowlist.length === 0) {
    return false;
  }

  return allowlist.includes(orgId);
}

/**
 * Client-side check: is Google Calendar sync UI visible?
 * When orgId is provided, also checks the client org allowlist.
 * When orgId is omitted, only checks the global client flag.
 */
export function isGcalSyncUIEnabled(orgId?: string): boolean {
  // Client flag must be exactly "1"
  if (process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC !== '1') {
    return false;
  }

  // If no org provided, just check the flag
  if (!orgId) {
    return true;
  }

  // Check client allowlist: comma-separated org UUIDs; empty/unset = nobody
  const allowlistRaw = process.env.NEXT_PUBLIC_FEATURE_GCAL_SYNC_ORG_IDS || '';
  const allowlist = allowlistRaw
    .split(',')
    .map(id => id.trim())
    .filter(id => id.length > 0);

  if (allowlist.length === 0) {
    return false;
  }

  return allowlist.includes(orgId);
}

/**
 * Server-side check: is the feature globally enabled at all?
 * Use this for routes that need to return 404/503 when feature is off.
 */
export function isGcalSyncFeatureEnabled(): boolean {
  return process.env.FEATURE_GCAL_SYNC === '1';
}
