-- Recreate the two prod-only policies (not in repo migrations) so the local db matches prod before the lockdown.
CREATE POLICY "Enable all for sessions" ON public.sessions FOR ALL TO public USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for event_invites" ON public.event_invites FOR ALL TO public USING (true) WITH CHECK (true);
