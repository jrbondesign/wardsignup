import { NextResponse } from 'next/server';
import { isGcalSyncFeatureEnabled, isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import { verifyState, exchangeCode, encryptToken, listCalendars } from '@/lib/google-oauth';
import { persistGoogleCalendarConnection } from '@/lib/google-calendar-connection';
import { createServiceRoleClient } from '@/lib/supabase-admin';
import { getPostHogClient } from '@/lib/posthog-server';

async function resolveGoogleEmail(accessToken: string): Promise<string | null> {
  try {
    const userInfoResponse = await fetch(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (userInfoResponse.ok) {
      const userInfo = await userInfoResponse.json();
      if (typeof userInfo.email === 'string' && userInfo.email.includes('@')) {
        return userInfo.email;
      }
    }
  } catch (err) {
    console.error('[google/callback] userinfo lookup failed:', err);
  }

  // Calendar scopes alone: primary calendar id is usually the account email.
  try {
    const calendars = await listCalendars(accessToken);
    const primary = (calendars.items || []).find((cal: { primary?: boolean; id?: string }) => cal.primary);
    if (typeof primary?.id === 'string' && primary.id.includes('@')) {
      return primary.id;
    }
    const emailLike = (calendars.items || []).find(
      (cal: { id?: string }) => typeof cal.id === 'string' && cal.id.includes('@'),
    );
    if (typeof emailLike?.id === 'string') {
      return emailLike.id;
    }
  } catch (err) {
    console.error('[google/callback] calendar email fallback failed:', err);
  }

  return null;
}

/**
 * GET /api/integrations/google/callback
 * OAuth callback handler. Exchange code for tokens and store connection.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { origin } = url;

  if (!isGcalSyncFeatureEnabled()) {
    return NextResponse.redirect(new URL('/settings/organization?error=gcal_disabled', origin));
  }

  try {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    if (error) {
      console.error('[google/callback] OAuth error:', error);
      return NextResponse.redirect(new URL('/settings/organization?error=gcal_oauth_denied', origin));
    }

    if (!code || !stateParam) {
      return NextResponse.redirect(new URL('/settings/organization?error=gcal_missing_params', origin));
    }

    // Verify state
    const state = verifyState(stateParam);
    if (!state) {
      console.error('[google/callback] Invalid or expired state');
      return NextResponse.redirect(new URL('/settings/organization?error=gcal_invalid_state', origin));
    }

    const failRedirect = (code: string) => {
      const fail = new URL(state.returnPath || '/settings/organization', origin);
      fail.searchParams.set('error', code);
      return NextResponse.redirect(fail.toString());
    };

    // Require org allowlist check
    if (!isGcalSyncEnabledForOrg(state.orgId)) {
      console.error('[google/callback] Org not in allowlist:', state.orgId);
      return failRedirect('gcal_org_not_enabled');
    }

    // Exchange code for tokens
    let tokens;
    try {
      tokens = await exchangeCode(code);
    } catch (err: any) {
      console.error('[google/callback] Token exchange failed:', err);
      const errorMsg = err.message || String(err);
      
      // Check for common OAuth errors
      if (errorMsg.includes('invalid_grant') || errorMsg.includes('expired') || errorMsg.includes('revoked')) {
        return failRedirect('gcal_token_revoked');
      }
      
      return failRedirect('gcal_token_exchange_failed');
    }
    
    if (!tokens.refresh_token) {
      console.error('[google/callback] No refresh token received');
      return failRedirect('gcal_no_refresh_token');
    }

    const googleEmail = await resolveGoogleEmail(tokens.access_token);
    if (!googleEmail) {
      console.error('[google/callback] Could not resolve Google account email');
      return failRedirect('gcal_token_exchange_failed');
    }

    // Encrypt refresh token
    const refreshTokenEnc = encryptToken(tokens.refresh_token);

    // Update the existing org connection (including expired rows) rather than
    // inserting a second row keyed on google_email.
    const admin = createServiceRoleClient();
    const { error: dbError } = await persistGoogleCalendarConnection(admin, {
      userId: state.userId,
      organizationId: state.orgId,
      googleEmail,
      refreshTokenEnc,
      scopes: tokens.scope || '',
    });

    if (dbError) {
      console.error('[google/callback] DB error:', dbError);
      return failRedirect('gcal_db_error');
    }
    
    // Fire PostHog event for successful connection
    const posthog = getPostHogClient();
    posthog.capture({
      distinctId: state.userId,
      event: 'gcal_connected',
      properties: {
        google_email: googleEmail,
        organization_id: state.orgId,
      },
    });

    // Success - redirect to return path
    const redirectUrl = new URL(state.returnPath, origin);
    redirectUrl.searchParams.set('gcal_connected', '1');
    return NextResponse.redirect(redirectUrl.toString());
  } catch (err) {
    console.error('[google/callback] error:', err);
    return NextResponse.redirect(new URL('/settings/organization?error=gcal_internal_error', origin));
  }
}
