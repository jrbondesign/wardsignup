-- Optional event leader (name + email). When leader_email is set, the leader
-- receives an email (with an .ics attachment) each time someone signs up.
-- NOT exposed via get_public_campaign — the email is PII and that RPC is
-- readable by anon.

ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS leader_name text;
ALTER TABLE public.campaigns ADD COLUMN IF NOT EXISTS leader_email text;

COMMENT ON COLUMN public.campaigns.leader_name IS
  'Optional display name of the leader assigned to this event (e.g. "Bro. Dunaway").';
COMMENT ON COLUMN public.campaigns.leader_email IS
  'When set, this address is emailed (with an .ics calendar attachment) each time someone signs up. Never exposed publicly.';
