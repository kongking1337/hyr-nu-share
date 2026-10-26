-- Photo upload (task 5 in docs/mvp-plan.md).
--
-- Photos live in the public Storage bucket "listing-images". Each user uploads
-- only into their own folder: <user id>/<random uuid>.webp (or .jpg). The browser
-- shrinks photos to WebP, or JPEG where WebP can't be created, before upload (which
-- also strips GPS data); the bucket accepts only those two types, up to 2 MB.
-- A listing stores those paths in `images`; older listings keep their full URLs.
-- New photos on a listing must come from the owner's own folder, so nobody can
-- hotlink other sites or borrow someone else's photos.
-- Safe to run more than once.

-- 1. The bucket ----------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('listing-images', 'listing-images', true, 2097152, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Users manage files in their own folder only ----------------------------------

DROP POLICY IF EXISTS "listing_images_own_read" ON storage.objects;
CREATE POLICY "listing_images_own_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "listing_images_own_insert" ON storage.objects;
CREATE POLICY "listing_images_own_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "listing_images_own_update" ON storage.objects;
CREATE POLICY "listing_images_own_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text)
  WITH CHECK (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "listing_images_own_delete" ON storage.objects;
CREATE POLICY "listing_images_own_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'listing-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Listings may only use the owner's own uploads (max 8) -----------------------

CREATE OR REPLACE FUNCTION private.listings_images_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  img text;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  IF COALESCE(array_length(NEW.images, 1), 0) > 8 THEN
    RAISE EXCEPTION 'Högst 8 bilder per annons';
  END IF;
  FOREACH img IN ARRAY COALESCE(NEW.images, '{}') LOOP
    CONTINUE WHEN img ~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}\.(webp|jpg)$');
    CONTINUE WHEN TG_OP = 'UPDATE' AND img = ANY (OLD.images);
    RAISE EXCEPTION 'Bilder måste laddas upp via Hyrkoll';
  END LOOP;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION private.listings_images_guard() FROM PUBLIC, anon;

CREATE OR REPLACE TRIGGER listings_images_guard BEFORE INSERT OR UPDATE OF images ON public.listings
  FOR EACH ROW EXECUTE FUNCTION private.listings_images_guard();
