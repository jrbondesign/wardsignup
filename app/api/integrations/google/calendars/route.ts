import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import { refreshAccessToken, listCalendars } from '@/lib/google-oauth';
import { createServiceRoleClient } from '@/lib/supabase-admin';

/**
 * GET /api/integrations/google/calendars?org_id=...
 * List calendars for the user's connection in this org.
 */
export async function GET(request: Request) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { user } = auth;
    const url = new URL(request.url);
    const orgId = url.searchParams.get('org_id');

    if (!orgId) {
      return NextResponse.json({ error: 'org_id required' }, { status: 400 });
    }

    if (!isGcalSyncEnabledForOrg(orgId)) {
      return NextResponse.json(
        { error: 'Google Calendar sync is not enabled for this organization' },
        { status: 403 }
      );
    }

    // Get user's connection for this org
    const admin = createServiceRoleClient();
    const { data: connection, error: fetchError } = await admin
      .from('google_calendar_connections' as never)
      .select('*')
      .eq('user_id', user.id)
      .eq('organization_id', orgId)
      .is('revoked_at', null)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: 'No Google Calendar connection found' },
        { status: 404 }
      );
    }

    // Refresh access token
    const tokens = await refreshAccessToken((connection as any).refresh_token_enc);

    // List calendars
    const calendarsData = await listCalendars(tokens.access_token);

    // Return simplified calendar list
    const calendars = (calendarsData.items || []).map((cal: any) => ({
      id: cal.id,
      summary: cal.summary,
      primary: cal.primary || false,
      accessRole: cal.accessRole,
    }));

    return NextResponse.json({ calendars });
  } catch (err) {
    console.error('[google/calendars] error:', err);
    
    // Check if it's an invalid_grant error (token revoked)
    if (err instanceof Error && err.message.includes('invalid_grant')) {
      return NextResponse.json(
        { error: 'Connection expired or revoked', revoked: true },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch calendars' },
      { status: 500 }
    );
  }
}
