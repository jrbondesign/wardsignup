-- Per-date claimable "class" slots for the Scheduled Sessions (spots) type.
--
-- A session can now carry an optional human label (e.g. "Class 1") and a section
-- header (e.g. "Men's Side"). This lets one date hold a SET of named, grouped
-- slots — each with its own capacity — instead of just anonymous time slots.
-- Both nullable: every existing session keeps working unchanged (time-only slot).
--
-- NOTE (multi-brand): all brands currently share Supabase `wqmpllurnofdsfditrpo`,
-- so a single `supabase db push` covers wardsignup + ministrysignup + orgsignup.

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS label   TEXT,
  ADD COLUMN IF NOT EXISTS section TEXT;
