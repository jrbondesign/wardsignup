/** Matches Supabase/postgrest GenericRelationship (manual schema; no FK metadata in repo). */
export type TableRelationship = {
  foreignKeyName: string;
  columns: string[];
  isOneToOne?: boolean;
  referencedRelation: string;
  referencedColumns: string[];
};

/** Row shape for signups (also RPC `create_signup_if_capacity` return type). */
export interface SignupRow {
  id: string;
  session_id: string;
  campaign_id: string;
  member_name: string;
  member_email: string | null;
  member_phone: string | null;
  signed_up_at: string;
  reminder_sent_at: string | null;
  /** Names of additional people the registrant is bringing. Each name = 1 extra person against capacity. */
  guest_names: string[];
}

export interface Database {
  public: {
    Tables: {
      campaigns: {
        Row: {
          id: string;
          name: string;
          description: string | null;
          user_email: string | null;
          created_by: string | null;
          created_at: string;
          organizer_digest_enabled: boolean;
          organizer_instant_notify_enabled: boolean;
          organizer_last_digest_sent_at: string | null;
          organizer_last_instant_notify_at: string | null;
          brand_id: string;
          public_host: string | null;
          event_timezone: string | null;
          show_signups_publicly: boolean;
          cover_image_url: string | null;
          event_type: string;
          allow_guests: boolean;
          show_capacity_publicly: boolean;
          event_date: string | null;
          event_end_date: string | null;
          event_start_time: string | null;
          event_end_time: string | null;
          event_times: { label: string; time: string }[];
          event_locations: { label: string; address: string }[];
          /** items: ISO date strings ("YYYY-MM-DD") for events that span several
           *  dates (e.g. 3 Thursdays). Display-only — one claim covers them all. */
          event_dates: string[];
          /** Nullable during PR 1/2 rollout; becomes NOT NULL in PR 3. */
          organization_id: string | null;
          /** Optional assigned leader — when leader_email is set, they get an
           *  email (with .ics attachment) on every signup. Never public. */
          leader_name: string | null;
          leader_email: string | null;
        };
        Insert: {
          id?: string;
          name: string;
          description?: string | null;
          user_email?: string | null;
          created_by?: string | null;
          created_at?: string;
          organizer_digest_enabled?: boolean;
          organizer_instant_notify_enabled?: boolean;
          organizer_last_digest_sent_at?: string | null;
          organizer_last_instant_notify_at?: string | null;
          brand_id?: string;
          public_host?: string | null;
          event_timezone?: string | null;
          show_signups_publicly?: boolean;
          cover_image_url?: string | null;
          event_type?: string;
          allow_guests?: boolean;
          show_capacity_publicly?: boolean;
          event_date?: string | null;
          event_end_date?: string | null;
          event_start_time?: string | null;
          event_end_time?: string | null;
          event_times?: { label: string; time: string }[];
          event_locations?: { label: string; address: string }[];
          event_dates?: string[];
          organization_id?: string | null;
          leader_name?: string | null;
          leader_email?: string | null;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string | null;
          user_email?: string | null;
          created_by?: string | null;
          created_at?: string;
          organizer_digest_enabled?: boolean;
          organizer_instant_notify_enabled?: boolean;
          organizer_last_digest_sent_at?: string | null;
          organizer_last_instant_notify_at?: string | null;
          brand_id?: string;
          public_host?: string | null;
          event_timezone?: string | null;
          show_signups_publicly?: boolean;
          cover_image_url?: string | null;
          event_type?: string;
          allow_guests?: boolean;
          show_capacity_publicly?: boolean;
          event_date?: string | null;
          event_end_date?: string | null;
          event_start_time?: string | null;
          event_end_time?: string | null;
          event_times?: { label: string; time: string }[];
          event_locations?: { label: string; address: string }[];
          event_dates?: string[];
          organization_id?: string | null;
          leader_name?: string | null;
          leader_email?: string | null;
        };
        Relationships: TableRelationship[];
      };
      organizations: {
        Row: {
          id: string;
          brand_id: string;
          name: string;
          created_by: string;
          owner_id: string;
          created_at: string;
          needs_naming: boolean;
        };
        Insert: {
          id?: string;
          brand_id: string;
          name: string;
          created_by: string;
          owner_id: string;
          created_at?: string;
          needs_naming?: boolean;
        };
        Update: {
          id?: string;
          brand_id?: string;
          name?: string;
          created_by?: string;
          owner_id?: string;
          created_at?: string;
          needs_naming?: boolean;
        };
        Relationships: TableRelationship[];
      };
      organization_members: {
        Row: {
          id: string;
          organization_id: string;
          user_id: string | null;
          invited_email: string;
          invited_by: string;
          role: 'owner' | 'admin';
          status: 'pending' | 'accepted' | 'revoked';
          accept_token: string | null;
          token_expires_at: string | null;
          created_at: string;
          accepted_at: string | null;
          transfer_on_accept: boolean;
        };
        Insert: {
          id?: string;
          organization_id: string;
          user_id?: string | null;
          invited_email: string;
          invited_by: string;
          role: 'owner' | 'admin';
          status?: 'pending' | 'accepted' | 'revoked';
          accept_token?: string | null;
          token_expires_at?: string | null;
          created_at?: string;
          accepted_at?: string | null;
          transfer_on_accept?: boolean;
        };
        Update: {
          id?: string;
          organization_id?: string;
          user_id?: string | null;
          invited_email?: string;
          invited_by?: string;
          role?: 'owner' | 'admin';
          status?: 'pending' | 'accepted' | 'revoked';
          accept_token?: string | null;
          token_expires_at?: string | null;
          created_at?: string;
          accepted_at?: string | null;
          transfer_on_accept?: boolean;
        };
        Relationships: TableRelationship[];
      };
      /** Composite PK (user_id, brand_id): one membership per site brand. */
      organizer_profiles: {
        Row: {
          user_id: string;
          brand_id: string;
          created_at: string;
          logo_url: string | null;
          email_lower: string | null;
        };
        Insert: {
          user_id: string;
          brand_id: string;
          created_at?: string;
          logo_url?: string | null;
          email_lower?: string | null;
        };
        Update: {
          user_id?: string;
          brand_id?: string;
          created_at?: string;
          logo_url?: string | null;
          email_lower?: string | null;
        };
        Relationships: TableRelationship[];
      };
      event_invites: {
        Row: {
          id: string;
          campaign_id: string;
          inviter_id: string;
          invitee_email: string;
          invitee_name: string | null;
          message: string | null;
          sent_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          inviter_id: string;
          invitee_email: string;
          invitee_name?: string | null;
          message?: string | null;
          sent_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          inviter_id?: string;
          invitee_email?: string;
          invitee_name?: string | null;
          message?: string | null;
          sent_at?: string;
        };
        Relationships: TableRelationship[];
      };
      sessions: {
        Row: {
          id: string;
          campaign_id: string;
          day_of_week: number;
          time: string;
          end_time: string | null;
          capacity: number;
          location: string | null;
          notes: string | null;
          session_date: string | null;
          /** Optional name for a per-date claimable slot (e.g. "Class 1"). */
          label: string | null;
          /** Optional grouping header for the slot (e.g. "Men's Side"). */
          section: string | null;
          /** Explicit display order within a campaign (organizer drag-reorder). */
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          day_of_week: number;
          time: string;
          end_time?: string | null;
          capacity: number;
          location?: string | null;
          notes?: string | null;
          session_date?: string | null;
          label?: string | null;
          section?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string;
          day_of_week?: number;
          time?: string;
          end_time?: string | null;
          capacity?: number;
          location?: string | null;
          notes?: string | null;
          session_date?: string | null;
          label?: string | null;
          section?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: TableRelationship[];
      };
      welcome_email_sent: {
        Row: {
          user_id: string;
          brand_id: string;
          sent_at: string;
          email_lower: string | null;
        };
        Insert: {
          user_id: string;
          brand_id: string;
          sent_at?: string;
          email_lower?: string | null;
        };
        Update: {
          user_id?: string;
          brand_id?: string;
          sent_at?: string;
          email_lower?: string | null;
        };
        Relationships: TableRelationship[];
      };
      creator_signup_notification_log: {
        Row: {
          email: string;
          notified_at: string;
        };
        Insert: {
          email: string;
          notified_at?: string;
        };
        Update: {
          email?: string;
          notified_at?: string;
        };
        Relationships: TableRelationship[];
      };
      signups: {
        Row: SignupRow;
        Insert: {
          id?: string;
          session_id: string;
          campaign_id: string;
          member_name: string;
          member_email?: string | null;
          member_phone?: string | null;
          signed_up_at?: string;
          reminder_sent_at?: string | null;
          guest_names?: string[];
        };
        Update: {
          id?: string;
          session_id?: string;
          campaign_id?: string;
          member_name?: string;
          member_email?: string | null;
          member_phone?: string | null;
          signed_up_at?: string;
          reminder_sent_at?: string | null;
          guest_names?: string[];
        };
        Relationships: TableRelationship[];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      get_public_campaign: {
        Args: { campaign_id: string };
        Returns: {
          id: string;
          name: string;
          description: string | null;
          cover_image_url: string | null;
          organizer_logo_url: string | null;
          event_date: string | null;
          event_end_date: string | null;
          event_start_time: string | null;
          event_end_time: string | null;
          event_times: { label: string; time: string }[];
          event_locations: { label: string; address: string }[];
          event_type: string;
          show_signups_publicly: boolean;
          allow_guests: boolean;
          show_capacity_publicly: boolean;
        }[];
      };
      create_signup_if_capacity: {
        Args: {
          p_session_id: string;
          p_campaign_id: string;
          p_member_name: string;
          p_member_email: string | null;
          p_member_phone: string | null;
          p_guest_names?: string[];
        };
        Returns: SignupRow;
      };
      try_consume_signup_rate: {
        Args: { p_ip_hash: string; p_bucket: string; p_max: number };
        Returns: boolean;
      };
      try_consume_action_rate: {
        Args: {
          p_action: string;
          p_ip_hash: string;
          p_bucket: string;
          p_max: number;
        };
        Returns: boolean;
      };
      try_claim_cron_run: {
        Args: { p_job: string; p_bucket: string };
        Returns: boolean;
      };
      metrics_total_capacity: {
        Args: Record<string, never>;
        Returns: number;
      };
      metrics_creator_breakdown: {
        Args: Record<string, never>;
        Returns: {
          organizer_email: string;
          event_count: number;
          session_count: number;
          signup_count: number;
        }[];
      };
      try_claim_welcome_email: {
        Args: { p_user_id: string; p_brand_id: string };
        Returns: boolean;
      };
      try_insert_creator_signup_notification: {
        Args: { p_email: string };
        Returns: boolean;
      };
      transfer_organization_ownership: {
        Args: { p_org_id: string; p_new_owner_user_id: string };
        Returns: void;
      };
    };
  };
}

export type Campaign = Database['public']['Tables']['campaigns']['Row'];
export type Event = Campaign; // Alias for better semantics
export type EventInvite = Database['public']['Tables']['event_invites']['Row'];
export type Organization = Database['public']['Tables']['organizations']['Row'];
export type OrganizationMember = Database['public']['Tables']['organization_members']['Row'];
export type Session = Database['public']['Tables']['sessions']['Row'];
export type Signup = Database['public']['Tables']['signups']['Row'];

export interface SessionWithSignups extends Session {
  signups: Signup[];
}

export type EventType = 'spots' | 'items' | 'rsvp';

export interface CampaignItem {
  id: string;
  campaign_id: string;
  label: string;
  item_limit: number | null;
  /** Optional grouping header (e.g. "Women's Side"). null = ungrouped. */
  section: string | null;
  sort_order: number;
  created_at: string;
}

export interface ItemSignup {
  id: string;
  campaign_id: string;
  item_id: string;
  member_name: string;
  member_email: string | null;
  signup_note: string | null;
  quantity: number;
  signed_up_at: string;
}

export interface CampaignItemWithSignups extends CampaignItem {
  item_signups: Pick<ItemSignup, 'id' | 'member_name' | 'member_email' | 'signup_note' | 'quantity'>[];
}
