import { NextResponse } from 'next/server';
import { isGcalSyncFeatureEnabled } from '@/lib/gcal-feature';
import { verifyState, exchangeCode, encryptToken } from '@/lib/google-oauth';
import { createServiceRoleClient } from '@/lib/supabase-admin';

/**
 * GET /api/integrations/google/callback
 * OAuth callback handler. Exchange code for tokens and store connection.
 */
export async function GET(request: Request) {
  if (!isGcalSyncFeatureEnabled()) {
    return NextResponse.redirect('/settings?error=gcal_disabled');
  }

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('[google/callback] OAuth error:', error);
      return NextResponse.redirect('/settings?error=gcal_oauth_denied');
    }

    if (!code || !stateParam) {
      return NextResponse.redirect('/settings?error=gcal_missing_params');
    }

    // Verify state
    const state = verifyState(stateParam);
    if (!state) {
      console.error('[google/callback] Invalid or expired state');
      return NextResponse.redirect('/settings?error=gcal_invalid_state');
    }

    // Exchange code for tokens
    const tokens = await exchangeCode(code);
    
    if (!tokens.refresh_token) {
      console.error('[google/callback] No refresh token received');
      return NextResponse.redirect('/settings?error=gcal_no_refresh_token');
    }

    // Get user info from Google to get email
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      }
    );

    if (!userInfoResponse.ok) {
      throw new Error('Failed to get user info from Google');
    }

    const userInfo = await userInfoResponse.json();
    const googleEmail = userInfo.email;

    // Encrypt refresh token
    const refreshTokenEnc = encryptToken(tokens.refresh_token);

    // Store connection (upsert)
    const admin = createServiceRoleClient();
    const { error: dbError } = await admin
      .from('google_calendar_connections' as never)
      .upsert({
        user_id: state.userId,
        organization_id: state.orgId,
        google_email: googleEmail,
        refresh_token_enc: refreshTokenEnc,
        scopes: tokens.scope,
        revoked_at: null,
        last_error: null,
      } as never, {
        onConflict: 'user_id,organization_id,google_email',
      });

    if (dbError) {
      console.error('[google/callback] DB error:', dbError);
      return NextResponse.redirect('/settings?error=gcal_db_error');
    }

    // Success - redirect to return path
    const redirectUrl = new URL(state.returnPath, url.origin);
    redirectUrl.searchParams.set('gcal_connected', '1');
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[google/callback] error:', err);
    return NextResponse.redirect('/settings?error=gcal_internal_error');
  }
}
