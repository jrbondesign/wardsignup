/**
 * Google Calendar sync engine — syncs campaign signups to Google Calendar events.
 * Core algorithm: load sync config + sessions + signups, diff against existing
 * Google events by content_hash, then POST/PATCH/DELETE as needed.
 * 
 * Idempotent and safe to call any number of times. Never throws into callers.
 */

import { createClient } from '@supabase/supabase-js';
import { refreshAccessToken } from './google-oauth';
import { createHash } from 'crypto';
import { getPostHogClient } from './posthog-server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SyncResult {
  success: boolean;
  error?: string;
  lastSyncedAt?: string;
  eventsCreated?: number;
  eventsUpdated?: number;
  eventsDeleted?: number;
}

interface GoogleEvent {
  summary: string;
  description: string;
  start: {
    dateTime: string;
    timeZone: string;
  };
  end: {
    dateTime: string;
    timeZone: string;
  };
  extendedProperties?: {
    private?: {
      wardsignup_session_id?: string;
    };
  };
  attendees?: Array<{ email: string }>;
}

interface SessionWithSignups {
  id: string;
  start_time: string;
  end_time: string;
  label: string | null;
  signups: Array<{
    member_name: string;
    member_email: string | null;
    member_phone: string | null;
    guest_names: string[];
    signup_note: string | null;
  }>;
}

/**
 * Sync a campaign's signups to Google Calendar.
 * Safe to call from any context — never throws, returns error in result.
 */
export async function syncCampaignCalendar(campaignId: string): Promise<SyncResult> {
  try {
    // 1. Load sync config
    const { data: syncConfig, error: syncError } = await supabase
      .from('campaign_calendar_sync')
      .select('*, connection:google_calendar_connections(*)')
      .eq('campaign_id', campaignId)
      .single();

    if (syncError || !syncConfig) {
      return { success: false, error: 'No sync config found' };
    }

    if (!syncConfig.enabled) {
      return { success: false, error: 'Sync disabled' };
    }

    const connection = syncConfig.connection as any;
    if (!connection || connection.revoked_at) {
      const errorMsg = 'Connection revoked';
      await supabase
        .from('campaign_calendar_sync')
        .update({ last_error: errorMsg, last_synced_at: new Date().toISOString() })
        .eq('campaign_id', campaignId);
      
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: connection?.user_id || 'unknown',
        event: 'gcal_sync_error',
        properties: {
          campaign_id: campaignId,
          error: errorMsg,
        },
      });
      
      return { success: false, error: errorMsg };
    }

    // 2. Get fresh access token
    let accessToken: string;
    try {
      const tokenResponse = await refreshAccessToken(connection.refresh_token_enc);
      accessToken = tokenResponse.access_token;
    } catch (err: any) {
      const errorMsg = err.message || String(err);
      
      // Mark as revoked if invalid_grant
      if (errorMsg.includes('invalid_grant')) {
        await supabase
          .from('google_calendar_connections')
          .update({ revoked_at: new Date().toISOString(), last_error: 'Invalid grant - reauthorization needed' })
          .eq('id', connection.id);
      }

      await supabase
        .from('campaign_calendar_sync')
        .update({ last_error: errorMsg, last_synced_at: new Date().toISOString() })
        .eq('campaign_id', campaignId);
      
      const posthog = getPostHogClient();
      posthog.capture({
        distinctId: connection.user_id,
        event: 'gcal_sync_error',
        properties: {
          campaign_id: campaignId,
          error: errorMsg,
          is_invalid_grant: errorMsg.includes('invalid_grant'),
        },
      });
      
      return { success: false, error: errorMsg };
    }

    // 3. Load campaign, sessions, and signups
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, name, event_timezone, leader_name, leader_email')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return { success: false, error: 'Campaign not found' };
    }

    const { data: sessions, error: sessionsError } = await supabase
      .from('sessions')
      .select(`
        id,
        start_time,
        end_time,
        label,
        signups (
          member_name,
          member_email,
          member_phone,
          guest_names,
          signup_note
        )
      `)
      .eq('campaign_id', campaignId)
      .gte('start_time', new Date().toISOString()) // Future sessions only
      .order('start_time');

    if (sessionsError) {
      return { success: false, error: `Failed to load sessions: ${sessionsError.message}` };
    }

    const sessionsWithSignups = (sessions || []) as SessionWithSignups[];

    // 4. Load existing event links
    const { data: existingLinks, error: linksError } = await supabase
      .from('calendar_event_links')
      .select('*')
      .eq('campaign_id', campaignId);

    if (linksError) {
      return { success: false, error: `Failed to load event links: ${linksError.message}` };
    }

    const linksBySession = new Map(
      (existingLinks || []).map((link: any) => [link.session_id, link])
    );

    // 5. Sync each session
    let eventsCreated = 0;
    let eventsUpdated = 0;
    let eventsDeleted = 0;

    for (const session of sessionsWithSignups) {
      const hasSignups = session.signups && session.signups.length > 0;
      const existingLink = linksBySession.get(session.id);

      if (!hasSignups) {
        // Delete event if it exists
        if (existingLink) {
          try {
            await deleteGoogleEvent(
              accessToken,
              syncConfig.calendar_id,
              existingLink.google_event_id
            );
            await supabase
              .from('calendar_event_links')
              .delete()
              .eq('session_id', session.id);
            eventsDeleted++;
          } catch (err: any) {
            console.error(`Failed to delete event for session ${session.id}:`, err);
          }
        }
        continue;
      }

      // Build desired event
      const event = buildGoogleEvent(
        campaign,
        session,
        syncConfig.invite_leader
      );
      const contentHash = computeContentHash(event);

      if (!existingLink) {
        // Create new event
        try {
          const createdEvent = await createGoogleEvent(
            accessToken,
            syncConfig.calendar_id,
            event
          );
          await supabase
            .from('calendar_event_links')
            .insert({
              session_id: session.id,
              campaign_id: campaignId,
              google_event_id: createdEvent.id,
              calendar_id: syncConfig.calendar_id,
              content_hash: contentHash,
            });
          eventsCreated++;
        } catch (err: any) {
          console.error(`Failed to create event for session ${session.id}:`, err);
        }
      } else if (existingLink.content_hash !== contentHash) {
        // Update existing event
        try {
          await updateGoogleEvent(
            accessToken,
            syncConfig.calendar_id,
            existingLink.google_event_id,
            event
          );
          await supabase
            .from('calendar_event_links')
            .update({ content_hash: contentHash, synced_at: new Date().toISOString() })
            .eq('session_id', session.id);
          eventsUpdated++;
        } catch (err: any) {
          console.error(`Failed to update event for session ${session.id}:`, err);
        }
      }
      // else: content unchanged, skip
    }

    // 6. Clean up orphaned links (sessions that no longer exist)
    const sessionIds = new Set(sessionsWithSignups.map(s => s.id));
    for (const link of (existingLinks || [])) {
      if (!sessionIds.has(link.session_id)) {
        try {
          await deleteGoogleEvent(
            accessToken,
            syncConfig.calendar_id,
            link.google_event_id
          );
          await supabase
            .from('calendar_event_links')
            .delete()
            .eq('session_id', link.session_id);
          eventsDeleted++;
        } catch (err: any) {
          console.error(`Failed to delete orphaned event for session ${link.session_id}:`, err);
        }
      }
    }

    // 7. Update sync status
    await supabase
      .from('campaign_calendar_sync')
      .update({
        last_synced_at: new Date().toISOString(),
        last_error: null,
      })
      .eq('campaign_id', campaignId);

    const lastSyncedAt = new Date().toISOString();

    return {
      success: true,
      lastSyncedAt,
      eventsCreated,
      eventsUpdated,
      eventsDeleted,
    };
  } catch (err: any) {
    const errorMsg = err.message || String(err);
    
    // Try to record error (best effort)
    try {
      await supabase
        .from('campaign_calendar_sync')
        .update({
          last_error: errorMsg,
          last_synced_at: new Date().toISOString(),
        })
        .eq('campaign_id', campaignId);
    } catch {
      // Ignore — already in error state
    }

    return { success: false, error: errorMsg };
  }
}

/**
 * Build a Google Calendar event from campaign + session + signups.
 */
function buildGoogleEvent(
  campaign: any,
  session: SessionWithSignups,
  inviteLeader: boolean
): GoogleEvent {
  const signups = session.signups || [];
  const timezone = campaign.event_timezone || 'America/Denver';

  // Title: event name + first signup name (or "Multiple signups")
  const firstName = signups[0]?.member_name || 'Unknown';
  const title = signups.length === 1
    ? `${campaign.name} — ${firstName}`
    : `${campaign.name} — ${firstName} + ${signups.length - 1} more`;

  // Description: member details + admin link
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://wardsignup.com';
  const adminUrl = `${siteUrl}/admin/${campaign.id}`;
  
  let description = `${campaign.name}\n\n`;
  
  if (session.label) {
    description += `Time slot: ${session.label}\n\n`;
  }

  description += 'Signups:\n';
  for (const signup of signups) {
    description += `\n• ${signup.member_name}`;
    if (signup.member_phone) {
      description += `\n  Phone: ${signup.member_phone}`;
    }
    if (signup.member_email) {
      description += `\n  Email: ${signup.member_email}`;
    }
    if (signup.guest_names && signup.guest_names.length > 0) {
      description += `\n  Guests: ${signup.guest_names.join(', ')}`;
    }
    if (signup.signup_note) {
      description += `\n  Note: ${signup.signup_note}`;
    }
  }

  description += `\n\nManage signups: ${adminUrl}`;

  const event: GoogleEvent = {
    summary: title,
    description,
    start: {
      dateTime: session.start_time,
      timeZone: timezone,
    },
    end: {
      dateTime: session.end_time,
      timeZone: timezone,
    },
    extendedProperties: {
      private: {
        wardsignup_session_id: session.id,
      },
    },
  };

  // Add leader as attendee if enabled
  if (inviteLeader && campaign.leader_email) {
    event.attendees = [{ email: campaign.leader_email }];
  }

  return event;
}

/**
 * Compute content hash for diff detection.
 */
function computeContentHash(event: GoogleEvent): string {
  const canonical = JSON.stringify({
    summary: event.summary,
    description: event.description,
    start: event.start,
    end: event.end,
    attendees: event.attendees || [],
  });
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

/**
 * Create a Google Calendar event.
 */
async function createGoogleEvent(
  accessToken: string,
  calendarId: string,
  event: GoogleEvent
): Promise<any> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create event: ${error}`);
  }

  return response.json();
}

/**
 * Update a Google Calendar event.
 */
async function updateGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  event: GoogleEvent
): Promise<any> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update event: ${error}`);
  }

  return response.json();
}

/**
 * Delete a Google Calendar event.
 */
async function deleteGoogleEvent(
  accessToken: string,
  calendarId: string,
  eventId: string
): Promise<void> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404) {
    const error = await response.text();
    throw new Error(`Failed to delete event: ${error}`);
  }
}
