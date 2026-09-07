-- Step 2: Create event-media Supabase Storage bucket + RLS policies
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'event-media',
  'event-media',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Public read: anyone can view uploaded images
CREATE POLICY "Public read event-media"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'event-media');

-- Authenticated users can upload to their own folder ({user_id}/...)
CREATE POLICY "Authenticated upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can replace their own objects
CREATE POLICY "Authenticated update own objects"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Authenticated users can delete their own objects
CREATE POLICY "Authenticated delete own objects"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'event-media'
    AND auth.role() = 'authenticated'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
