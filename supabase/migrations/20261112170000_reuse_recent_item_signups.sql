-- Reuse a recent item signup for the same person so a timeout retry
-- (client 503, then a later resubmit) does not insert a second row.
--
-- Email match when an email is present. When both the request and the
-- existing row have no email, exact case-insensitive name + same quantity
-- on the same item (or custom label) within 30 minutes is reused. Two
-- different people with the same name can still both sign up after the
-- window, or on a first-time signup if their names differ.

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
  req_email text;
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

  req_email := NULLIF(trim(COALESCE(p_member_email, '')), '');

  SELECT *
    INTO new_row
  FROM public.item_signups s
  WHERE s.campaign_id = p_campaign_id
    AND s.signed_up_at >= now() - interval '30 minutes'
    AND s.quantity = qty
    AND (
      (p_item_id IS NOT NULL AND s.item_id = p_item_id)
      OR (p_item_id IS NULL AND label IS NOT NULL AND s.custom_label = label)
    )
    AND (
      (
        req_email IS NOT NULL
        AND s.member_email IS NOT NULL
        AND lower(trim(s.member_email)) = lower(req_email)
      )
      OR (
        req_email IS NULL
        AND (s.member_email IS NULL OR trim(s.member_email) = '')
        AND lower(trim(s.member_name)) = lower(trim(p_member_name))
      )
    )
  ORDER BY s.signed_up_at DESC
  LIMIT 1;

  IF FOUND THEN
    RETURN new_row;
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
    req_email,
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
