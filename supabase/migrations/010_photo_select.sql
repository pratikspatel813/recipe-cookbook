-- =============================================================================
-- 010 — Let people see their own photo files (needed to delete or replace them)
--
-- Run once in Supabase: SQL Editor → New query → paste → Run.
--
-- 009 let you upload, replace and delete files in your own folder. But
-- Storage first LOOKS UP a file before deleting or replacing it, and that
-- lookup is a select. With no select rule, the lookup finds nothing, so
-- deletes quietly do nothing. Viewing photos by URL is unaffected: the bucket
-- is public, which skips these rules.
-- =============================================================================

create policy "see your own photo files" on storage.objects
  for select to authenticated
  using (bucket_id = 'recipe-photos' and (storage.foldername(name))[1] = auth.uid()::text);
