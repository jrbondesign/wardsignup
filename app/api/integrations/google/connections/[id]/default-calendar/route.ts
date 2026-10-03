import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import { createServiceRoleClient } from '@/lib/supabase-admin';

/**
 * PATCH /api/integrations/google/connections/[id]/default-calendar
 * Update the default calendar for an organization
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthFromRequest(request);
    if (!auth.ok) {
      return NextResponse.json({ error: auth.message }, { status: auth.status });
    }

    const { user } = auth;
    const { id: connectionId } = await params;
    const body = await request.json();

    const { calendar_id, calendar_name } = body;

    if (typeof calendar_id !== 'string' || typeof calendar_name !== 'string') {
      return NextResponse.json(
        { error: 'Please provide a calendar ID and name.' },
        { status: 400 }
      );
    }

    // Get the connection to verify ownership and org
    const admin = createServiceRoleClient();
    const { data: connection, error: fetchError } = await admin
      .from('google_calendar_connections' as never)
      .select('*')
      .eq('id', connectionId)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: 'Connection not found.' },
        { status: 404 }
      );
    }

    const conn = connection as any;

    // Verify the user owns this connection
    if (conn.user_id !== user.id) {
      return NextResponse.json(
        { error: 'You do not have permission to modify this connection.' },
        { status: 403 }
      );
    }

    // Verify org is in allowlist
    if (!isGcalSyncEnabledForOrg(conn.organization_id)) {
      return NextResponse.json(
        { error: 'Calendar sync is not enabled for this organization.' },
        { status: 403 }
      );
    }

    // Update the default calendar
    const { error: updateError } = await admin
      .from('google_calendar_connections' as never)
      .update({
        default_calendar_id: calendar_id,
        default_calendar_name: calendar_name,
      } as never)
      .eq('id', connectionId);

    if (updateError) {
      console.error('[default-calendar] Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to save default calendar.' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[default-calendar] error:', err);
    return NextResponse.json(
      { error: 'Internal server error.' },
      { status: 500 }
    );
  }
}
