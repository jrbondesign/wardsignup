-- Allow owners to update their campaign items (label, limit, sort_order)
GRANT UPDATE ON public.campaign_items TO authenticated;

CREATE POLICY "Owner update campaign_items"
  ON public.campaign_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.created_by = auth.uid() OR c.user_email = auth.email())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.campaigns c
      WHERE c.id = campaign_id
        AND (c.created_by = auth.uid() OR c.user_email = auth.email())
    )
  );
