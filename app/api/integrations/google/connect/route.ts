import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncFeatureEnabled, isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import {
  buildAuthUrl,
  sanitizeReturnPath,
  OAUTH_NONCE_COOKIE,
  type OAuthState,
} from '@/lib/google-oauth';
import { userIsAcceptedOrgMember } from '@/lib/campaign-access';
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

    const { user, supabase } = auth;
    const url = new URL(request.url);
    const orgId = url.searchParams.get('org_id');
    const returnPath = sanitizeReturnPath(url.searchParams.get('return_path'));

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

    if (!(await userIsAcceptedOrgMember(supabase, user, orgId))) {
      return NextResponse.json(
        { error: 'You are not a member of this organization' },
        { status: 403 }
      );
    }

    const state: OAuthState = {
      userId: user.id,
      orgId,
      nonce: randomBytes(16).toString('hex'),
      returnPath,
      expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    };

    const authUrl = buildAuthUrl(state);
    const response = NextResponse.json({ url: authUrl });
    // Callback requires this cookie to match state.nonce, so a signed state
    // cannot be replayed in another person's browser.
    response.cookies.set(OAUTH_NONCE_COOKIE, state.nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/integrations/google/callback',
      maxAge: 10 * 60,
    });
    return response;
  } catch (err) {
    console.error('[google/connect] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
