-- Organizer brand (tenant) + campaign public host for correct links in emails/crons

CREATE TABLE IF NOT EXISTS public.organizer_profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    brand_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizer_profiles_brand_id ON public.organizer_profiles(brand_id);

ALTER TABLE public.organizer_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own organizer profile"
    ON public.organizer_profiles FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users insert own organizer profile"
    ON public.organizer_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own organizer profile"
    ON public.organizer_profiles FOR UPDATE
    USING (auth.uid() = user_id);

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS brand_id TEXT NOT NULL DEFAULT 'wardsignup';

ALTER TABLE public.campaigns
    ADD COLUMN IF NOT EXISTS public_host TEXT;

UPDATE public.campaigns
SET public_host = 'wardsignup.com'
WHERE public_host IS NULL;

INSERT INTO public.organizer_profiles (user_id, brand_id)
SELECT DISTINCT created_by, 'wardsignup'
FROM public.campaigns
WHERE created_by IS NOT NULL
ON CONFLICT (user_id) DO NOTHING;
