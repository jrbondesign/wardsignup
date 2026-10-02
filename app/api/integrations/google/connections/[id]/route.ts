import { NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { isGcalSyncFeatureEnabled, isGcalSyncEnabledForOrg } from '@/lib/gcal-feature';
import { revokeToken } from '@/lib/google-oauth';
import { createServiceRoleClient } from '@/lib/supabase-admin';

/**
 * DELETE /api/integrations/google/connections/:id
 * Revoke and delete a Google Calendar connection.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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
    const { id: connectionId } = await params;

    // Get connection (verify ownership)
    const admin = createServiceRoleClient();
    const { data: connection, error: fetchError } = await admin
      .from('google_calendar_connections' as never)
      .select('*')
      .eq('id', connectionId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !connection) {
      return NextResponse.json(
        { error: 'Connection not found' },
        { status: 404 }
      );
    }

    // Require org allowlist check
    if (!isGcalSyncEnabledForOrg((connection as any).organization_id)) {
      return NextResponse.json(
        { error: 'Google Calendar sync is not enabled for this organization' },
        { status: 403 }
      );
    }

    // Revoke token at Google (best effort)
    try {
      await revokeToken((connection as any).refresh_token_enc);
    } catch (err) {
      console.error('[google/connections/delete] Token revocation failed:', err);
      // Continue anyway - we'll mark it revoked in our DB
    }

    // Mark as revoked and disable dependent sync configs
    const { error: revokeError } = await admin
      .from('google_calendar_connections' as never)
      .update({
        revoked_at: new Date().toISOString(),
      } as never)
      .eq('id', connectionId);

    if (revokeError) {
      console.error('[google/connections/delete] DB error:', revokeError);
      return NextResponse.json(
        { error: 'Failed to revoke connection' },
        { status: 500 }
      );
    }

    // Disable all campaign syncs using this connection
    await admin
      .from('campaign_calendar_sync' as never)
      .update({
        enabled: false,
        last_error: 'Connection was disconnected',
      } as never)
      .eq('connection_id', connectionId);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[google/connections/delete] error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
