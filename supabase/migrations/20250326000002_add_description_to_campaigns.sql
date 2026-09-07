-- Add description field to campaigns table
ALTER TABLE public.campaigns
ADD COLUMN description TEXT;

-- Comment explaining the field
COMMENT ON COLUMN public.campaigns.description IS 'Optional description providing more details about the event.';
