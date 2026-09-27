-- H2 + H3: hide public names/notes when show_signups_publicly is off,
-- close anon/authenticated INSERT on item_signups, and add an atomic
-- item-signup RPC (service_role only). Idempotent / safe to re-run.

-- ---------------------------------------------------------------------------
-- H2 — public views honor campaigns.show_signups_publicly
-- Capacity columns (ids, quantity, timestamps) stay visible so pages can
-- compute remaining spots. Names, notes, guests, and write-in labels are
-- null when the organizer has public signups off.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.signups_public
WITH (security_invoker = false) AS
SELECT
    s.id,
    s.session_id,
    s.campaign_id,
    CASE WHEN c.show_signups_publicly THEN s.member_name ELSE NULL END AS member_name,
    CASE WHEN c.show_signups_publicly THEN s.signup_note ELSE NULL END AS signup_note,
    CASE WHEN c.show_signups_publicly THEN s.guest_names ELSE NULL END AS guest_names,
    s.signed_up_at
FROM public.signups s
JOIN public.campaigns c ON c.id = s.campaign_id;

GRANT SELECT ON public.signups_public TO anon, authenticated;

CREATE OR REPLACE VIEW public.item_signups_public
WITH (security_invoker = false) AS
SELECT
    s.id,
    s.item_id,
    s.campaign_id,
    CASE WHEN c.show_signups_publicly THEN s.member_name ELSE NULL END AS member_name,
    CASE WHEN c.show_signups_publicly THEN s.custom_label ELSE NULL END AS custom_label,
    CASE WHEN c.show_signups_publicly THEN s.signup_note ELSE NULL END AS signup_note,
    s.quantity,
    s.signed_up_at
FROM public.item_signups s
JOIN public.campaigns c ON c.id = s.campaign_id;

GRANT SELECT ON public.item_signups_public TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- H3 — no direct public inserts; capacity is enforced in an RPC
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Public insert item_signups" ON public.item_signups;
DROP POLICY IF EXISTS "Public insert custom item_signups" ON public.item_signups;

REVOKE INSERT ON public.item_signups FROM anon;
REVOKE INSERT ON public.item_signups FROM authenticated;

GRANT ALL ON public.item_signups TO service_role;

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

  IF NOT EXISTS (SELECT 1 FROM public.campaigns c WHERE c.id = p_campaign_id) THEN
    RAISE EXCEPTION 'CAMPAIGN_NOT_FOUND';
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
