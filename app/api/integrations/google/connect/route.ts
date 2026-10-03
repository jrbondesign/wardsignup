import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncFeatureEnabled, isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import { buildAuthUrl, revokeToken, type OAuthState } from '@/lib/google-oauth';
import { createServiceRoleClient } from '@/lib/supabase-admin';
import { randomBytes } from 'crypto';

/**
 * GET /api/integrations/google/connect
 * Redirects to Google OAuth consent screen.
 */
export async function GET(request: Request) {
  if (!isGcalSyncFeatureEnabled()) {
    return NextResponse.json(
      { error: 'Google Calendar sync is not enabled' },
      { status: 503 }
    );
  }

  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { user } = auth;
    const url = new URL(request.url);
    const orgId = url.searchParams.get('org_id');
    const returnPath = url.searchParams.get('return_path') || '/settings/organization';

    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 });
    }

    // Require org allowlist check
    if (!isGcalSyncEnabledForOrg(orgId)) {
      return NextResponse.json(
        { error: 'Google Calendar sync is not enabled for this organization' },
        { status: 403 }
      );
    }

    // Best-effort: revoke any stored Google grant so reconnect gets a new refresh token.
    try {
      const admin = createServiceRoleClient();
      const { data: existing } = await admin
        .from('google_calendar_connections' as never)
        .select('refresh_token_enc')
        .eq('user_id', user.id)
        .eq('organization_id', orgId);
      for (const row of (existing as { refresh_token_enc?: string }[] | null) ?? []) {
        if (!row.refresh_token_enc) continue;
        try {
          await revokeToken(row.refresh_token_enc);
        } catch (err) {
          console.error('[google/connect] prior token revoke failed:', err);
        }
      }
    } catch (err) {
      console.error('[google/connect] could not load prior connection:', err);
    }

    const state: OAuthState = {
      userId: user.id,
      orgId,
      nonce: randomBytes(16).toString('hex'),
      returnPath,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const authUrl = buildAuthUrl(state);
    return NextResponse.json({ url: authUrl });
  } catch (err) {
    console.error('[google/connect] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
