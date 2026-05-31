-- 1. Add avatar_url column to dashboard_persons
ALTER TABLE public.dashboard_persons
ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create public storage bucket for member avatars
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-avatars', 'member-avatars', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage policies
DROP POLICY IF EXISTS "Member avatars are publicly accessible" ON storage.objects;
CREATE POLICY "Member avatars are publicly accessible"
ON storage.objects FOR SELECT
USING (bucket_id = 'member-avatars');

DROP POLICY IF EXISTS "Authenticated can upload member avatars" ON storage.objects;
CREATE POLICY "Authenticated can upload member avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'member-avatars');

DROP POLICY IF EXISTS "Authenticated can update member avatars" ON storage.objects;
CREATE POLICY "Authenticated can update member avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'member-avatars');

DROP POLICY IF EXISTS "Authenticated can delete member avatars" ON storage.objects;
CREATE POLICY "Authenticated can delete member avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'member-avatars');