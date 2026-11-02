-- =============================================================================
-- 009 — Your own recipe photos
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- Photos live in Supabase Storage (file storage next to the database), in a
-- bucket called recipe-photos. The recipe row just keeps the photo's URL in
-- image_url, the same column imported recipes already use.
--
-- Every file goes in a folder named after its owner:  <user id>/<random>.jpg
-- The policies below check that folder name, so you can only add, replace or
-- delete files in your own folder.
-- =============================================================================

-- A PUBLIC bucket: anyone with a photo's URL can view it, without logging in.
-- It has to be, so link previews in iMessage/WhatsApp can show it. The file
-- names are random, so nobody can list or guess other photos.
-- Limits are enforced by Storage itself: JPEGs only (the app converts every
-- photo to JPEG first), at most 5 MB.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recipe-photos', 'recipe-photos', true, 5 * 1024 * 1024, array['image/jpeg'])
on conflict (id) do nothing;

-- storage.foldername('abc/123.jpg') = {abc}, so [1] is the top folder.
create policy "upload photos to your own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "replace your own photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "delete your own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
