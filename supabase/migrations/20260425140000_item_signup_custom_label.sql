-- Allow attendees to add a custom write-in item that the organizer didn't list
-- (e.g. "a trailer", "a generator"). When custom_label is set, item_id is NULL.

ALTER TABLE public.item_signups
  ADD COLUMN IF NOT EXISTS custom_label TEXT;

ALTER TABLE public.item_signups
  ALTER COLUMN item_id DROP NOT NULL;

ALTER TABLE public.item_signups
  ADD CONSTRAINT item_signups_target_chk
  CHECK (item_id IS NOT NULL OR (custom_label IS NOT NULL AND char_length(custom_label) > 0));

-- Public can insert custom write-ins (organizer/owner inserts also remain allowed)
DROP POLICY IF EXISTS "Public insert custom item_signups" ON public.item_signups;
CREATE POLICY "Public insert custom item_signups"
  ON public.item_signups FOR INSERT
  WITH CHECK (
    custom_label IS NOT NULL
    AND char_length(custom_label) > 0
    AND char_length(custom_label) <= 200
  );
