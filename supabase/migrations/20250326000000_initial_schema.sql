-- Initial database schema for Ward Signup application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Campaigns (Events) table
CREATE TABLE IF NOT EXISTS public.campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    user_email TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Sessions table
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
    time TEXT NOT NULL,
    capacity INTEGER NOT NULL CHECK (capacity > 0),
    location TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Signups table
CREATE TABLE IF NOT EXISTS public.signups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    member_name TEXT NOT NULL,
    member_email TEXT,
    member_phone TEXT,
    signed_up_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event invites table
CREATE TABLE IF NOT EXISTS public.event_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    campaign_id UUID NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
    inviter_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    invitee_email TEXT NOT NULL,
    invitee_name TEXT,
    message TEXT,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id ON public.sessions(campaign_id);
CREATE INDEX IF NOT EXISTS idx_signups_session_id ON public.signups(session_id);
CREATE INDEX IF NOT EXISTS idx_signups_campaign_id ON public.signups(campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_invites_campaign_id ON public.event_invites(campaign_id);
CREATE INDEX IF NOT EXISTS idx_event_invites_invitee_email ON public.event_invites(invitee_email);

-- Enable Row Level Security (RLS)
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_invites ENABLE ROW LEVEL SECURITY;

-- RLS Policies for campaigns
-- Users can read their own campaigns
CREATE POLICY "Users can read their own campaigns"
    ON public.campaigns FOR SELECT
    USING (
        auth.uid() = created_by OR
        auth.jwt()->>'email' = user_email
    );

-- Users can insert their own campaigns
CREATE POLICY "Users can insert their own campaigns"
    ON public.campaigns FOR INSERT
    WITH CHECK (auth.uid() = created_by);

-- Users can update their own campaigns
CREATE POLICY "Users can update their own campaigns"
    ON public.campaigns FOR UPDATE
    USING (
        auth.uid() = created_by OR
        auth.jwt()->>'email' = user_email
    );

-- Users can delete their own campaigns
CREATE POLICY "Users can delete their own campaigns"
    ON public.campaigns FOR DELETE
    USING (auth.uid() = created_by);

-- RLS Policies for sessions
-- Anyone can read sessions (for public signup page)
CREATE POLICY "Anyone can read sessions"
    ON public.sessions FOR SELECT
    USING (true);

-- Only campaign owners can insert sessions
CREATE POLICY "Campaign owners can insert sessions"
    ON public.sessions FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Only campaign owners can update sessions
CREATE POLICY "Campaign owners can update sessions"
    ON public.sessions FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Only campaign owners can delete sessions
CREATE POLICY "Campaign owners can delete sessions"
    ON public.sessions FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- RLS Policies for signups
-- Anyone can read signups (campaign owners need to see them)
CREATE POLICY "Anyone can read signups"
    ON public.signups FOR SELECT
    USING (true);

-- Anyone can insert signups (public signup)
CREATE POLICY "Anyone can insert signups"
    ON public.signups FOR INSERT
    WITH CHECK (true);

-- Only campaign owners can update signups
CREATE POLICY "Campaign owners can update signups"
    ON public.signups FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Only campaign owners can delete signups
CREATE POLICY "Campaign owners can delete signups"
    ON public.signups FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- RLS Policies for event_invites
-- Campaign owners can read invites for their campaigns
CREATE POLICY "Campaign owners can read their event invites"
    ON public.event_invites FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Campaign owners can insert invites
CREATE POLICY "Campaign owners can insert event invites"
    ON public.event_invites FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Campaign owners can update invites
CREATE POLICY "Campaign owners can update event invites"
    ON public.event_invites FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );

-- Campaign owners can delete invites
CREATE POLICY "Campaign owners can delete event invites"
    ON public.event_invites FOR DELETE
    USING (
        EXISTS (
            SELECT 1 FROM public.campaigns
            WHERE id = campaign_id
            AND (created_by = auth.uid() OR user_email = auth.jwt()->>'email')
        )
    );
