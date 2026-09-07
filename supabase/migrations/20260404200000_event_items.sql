-- Event type on campaigns ('spots' = existing behaviour, 'items' = claimable list)
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'spots'
  CHECK (event_type IN ('spots', 'items'));

-- Items/tasks that people can claim for an event
CREATE TABLE IF NOT EXISTS public.campaign_items (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  label        TEXT        NOT NULL CHECK (char_length(label) > 0),
  item_limit   INTEGER     CHECK (item_limit IS NULL OR item_limit > 0),
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_campaign_items_campaign
  ON public.campaign_items (campaign_id, sort_order);

-- Signups for items (separate from session signups)
CREATE TABLE IF NOT EXISTS public.item_signups (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id  UUID        NOT NULL REFERENCES public.campaigns(id) ON DELETE CASCADE,
  item_id      UUID        NOT NULL REFERENCES public.campaign_items(id) ON DELETE CASCADE,
  member_name  TEXT        NOT NULL CHECK (char_length(member_name) > 0),
  member_email TEXT,
  signed_up_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_item_signups_item
  ON public.item_signups (item_id);
CREATE INDEX IF NOT EXISTS idx_item_signups_campaign
  ON public.item_signups (campaign_id);

-- RLS
ALTER TABLE public.campaign_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_signups   ENABLE ROW LEVEL SECURITY;

-- campaign_items: anyone can read, owner can write/delete
CREATE POLICY "Public read campaign_items"
  ON public.campaign_items FOR SELECT USING (true);

CREATE POLICY "Owner insert campaign_items"
  ON public.campaign_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.created_by = auth.uid() OR c.user_email = auth.email())
    )
  );

CREATE POLICY "Owner delete campaign_items"
  ON public.campaign_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.created_by = auth.uid() OR c.user_email = auth.email())
    )
  );

-- item_signups: anyone can read and insert (public signup page), owner can delete
CREATE POLICY "Public read item_signups"
  ON public.item_signups FOR SELECT USING (true);

CREATE POLICY "Public insert item_signups"
  ON public.item_signups FOR INSERT WITH CHECK (true);

CREATE POLICY "Owner delete item_signups"
  ON public.item_signups FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.created_by = auth.uid() OR c.user_email = auth.email())
    )
  );

GRANT ALL ON public.campaign_items TO service_role;
GRANT ALL ON public.item_signups   TO service_role;
GRANT SELECT, INSERT ON public.campaign_items TO anon, authenticated;
GRANT SELECT, INSERT ON public.item_signups   TO anon, authenticated;
GRANT DELETE ON public.campaign_items TO authenticated;
GRANT DELETE ON public.item_signups   TO authenticated;
