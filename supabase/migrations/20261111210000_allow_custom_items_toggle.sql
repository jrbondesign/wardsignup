-- Organizer on/off switch for the "I'm also bringing…" write-in box on items
-- events. Default true, so every existing event keeps the box.
--
-- Enforcement when an organizer turns it off:
--   * create_item_signup_if_capacity (the only public insert path; anon and
--     authenticated have no INSERT grant on item_signups since 20260927220000)
--     rejects any custom_label with CUSTOM_ITEMS_DISABLED.
--   * The old RLS policy "Public insert custom item_signups" was dropped in
--     20260927220000 and is not recreated here, because recreating it would
--     reopen a direct public insert path. If some database still has it, it
--     is replaced with a copy that also requires allow_custom_items = true.
--   * get_public_campaign returns allow_custom_items so the public page can
--     hide the box. It is appended as the last column; nothing else changes.
--
-- Idempotent / safe to re-run.

ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS allow_custom_items boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.campaigns.allow_custom_items IS
  'Items events: when false, attendees cannot add their own write-in items (custom_label).';

-- ---------------------------------------------------------------------------
-- Public event row: same columns as before plus allow_custom_items.
-- Return type changes, so drop and recreate. get_public_event_page reads it
-- with pc.* inside a SQL function body, which is resolved at call time.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_public_campaign(uuid);

CREATE OR REPLACE FUNCTION public.get_public_campaign(campaign_id uuid)
RETURNS TABLE(
  id uuid,
  name text,
  description text,
  cover_image_url text,
  organizer_logo_url text,
  event_date date,
  event_end_date date,
  event_start_time text,
  event_end_time text,
  event_times jsonb,
  event_locations jsonb,
  event_type text,
  show_signups_publicly boolean,
  allow_guests boolean,
  show_capacity_publicly boolean,
  event_dates jsonb,
  allow_custom_items boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id,
    c.name,
    c.description,
    c.cover_image_url,
    op.logo_url AS organizer_logo_url,
    c.event_date,
    c.event_end_date,
    c.event_start_time,
    c.event_end_time,
    c.event_times,
    c.event_locations,
    c.event_type,
    c.show_signups_publicly,
    c.allow_guests,
    c.show_capacity_publicly,
    c.event_dates,
    c.allow_custom_items
  FROM public.campaigns c
  LEFT JOIN public.organizer_profiles op
    ON op.user_id = c.created_by
   AND op.brand_id = c.brand_id
  WHERE c.id = campaign_id;
$$;

REVOKE ALL ON FUNCTION public.get_public_campaign(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Item signup RPC: unchanged except write-ins are refused when the organizer
-- turned them off. Listed item signups are not affected.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_item_signup_if_capacity(
  p_campaign_id uuid,
  p_member_name text,
  p_item_id uuid DEFAULT NULL,
  p_member_email text DEFAULT NULL,
  p_signup_note text DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_custom_label text DEFAULT NULL
)
RETURNS public.item_signups
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item_campaign uuid;
  item_cap int;
  claimed int;
  qty int;
  label text;
  custom_allowed boolean;
  new_row public.item_signups;
BEGIN
  IF p_campaign_id IS NULL THEN
    RAISE EXCEPTION 'CAMPAIGN_REQUIRED';
  END IF;

  IF p_member_name IS NULL OR char_length(trim(p_member_name)) = 0 THEN
    RAISE EXCEPTION 'NAME_REQUIRED';
  END IF;

  qty := COALESCE(p_quantity, 1);
  IF qty < 1 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY';
  END IF;

  label := NULLIF(trim(COALESCE(p_custom_label, '')), '');
  IF label IS NOT NULL AND char_length(label) > 200 THEN
    RAISE EXCEPTION 'LABEL_TOO_LONG';
  END IF;

  IF p_item_id IS NULL AND label IS NULL THEN
    RAISE EXCEPTION 'ITEM_OR_LABEL_REQUIRED';
  END IF;

  SELECT c.allow_custom_items
    INTO custom_allowed
  FROM public.campaigns c
  WHERE c.id = p_campaign_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';
  END IF;

  IF label IS NOT NULL AND custom_allowed IS FALSE THEN
    RAISE EXCEPTION 'CUSTOM_ITEMS_DISABLED';
  END IF;

  IF p_item_id IS NOT NULL THEN
    SELECT ci.campaign_id, ci.item_limit
      INTO item_campaign, item_cap
    FROM public.campaign_items ci
    WHERE ci.id = p_item_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'ITEM_NOT_FOUND';
    END IF;

    IF item_campaign IS DISTINCT FROM p_campaign_id THEN
      RAISE EXCEPTION 'CAMPAIGN_MISMATCH';
    END IF;

    SELECT COALESCE(SUM(quantity), 0)::int
      INTO claimed
    FROM public.item_signups
    WHERE item_id = p_item_id;

    IF item_cap IS NOT NULL AND claimed + qty > item_cap THEN
      RAISE EXCEPTION 'ITEM_FULL';
    END IF;
  END IF;

  INSERT INTO public.item_signups (
    item_id,
    campaign_id,
    member_name,
    member_email,
    signup_note,
    quantity,
    custom_label
  )
  VALUES (
    p_item_id,
    p_campaign_id,
    trim(p_member_name),
    NULLIF(trim(COALESCE(p_member_email, '')), ''),
    NULLIF(trim(COALESCE(p_signup_note, '')), ''),
    qty,
    label
  )
  RETURNING * INTO new_row;

  RETURN new_row;
END;
$$;

REVOKE ALL ON FUNCTION public.create_item_signup_if_capacity(
  uuid, text, uuid, text, text, integer, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_item_signup_if_capacity(
  uuid, text, uuid, text, text, integer, text
) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_item_signup_if_capacity(
  uuid, text, uuid, text, text, integer, text
) TO service_role;

-- ---------------------------------------------------------------------------
-- Legacy RLS policy: only touched if it still exists somewhere.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'item_signups'
      AND policyname = 'Public insert custom item_signups'
  ) THEN
    DROP POLICY "Public insert custom item_signups" ON public.item_signups;
    CREATE POLICY "Public insert custom item_signups"
      ON public.item_signups FOR INSERT
      WITH CHECK (
        custom_label IS NOT NULL
        AND char_length(custom_label) > 0
        AND char_length(custom_label) <= 200
        AND EXISTS (
          SELECT 1 FROM public.campaigns c
          WHERE c.id = item_signups.campaign_id
            AND c.allow_custom_items
        )
      );
  END IF;
END $$;
