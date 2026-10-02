import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncFeatureEnabled } from '@/lib/gcal-feature';
import { buildAuthUrl, type OAuthState } from '@/lib/google-oauth';
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
    const returnPath = url.searchParams.get('return_path') || '/settings';

    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 });
    }

    const state: OAuthState = {
      userId: user.id,
      orgId,
      nonce: randomBytes(16).toString('hex'),
      returnPath,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const authUrl = buildAuthUrl(state);
    return NextResponse.redirect(authUrl);
  } catch (err) {
    console.error('[google/connect] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
