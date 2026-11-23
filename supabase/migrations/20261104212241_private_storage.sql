-- Requires Supabase Storage. Buckets remain private.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('student-photos','student-photos',false,2097152,array['image/jpeg','image/png','image/webp']),
('student-documents','student-documents',false,5242880,array['application/pdf','image/jpeg','image/png']),
('medical-documents','medical-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict(id) do nothing;
create policy institutional_file_read on storage.objects for select to authenticated using(
(bucket_id in ('student-photos','student-documents') and (select private.can('files.read'))) or (bucket_id='medical-documents' and (select private.can('medical.read'))));
create policy institutional_file_insert on storage.objects for insert to authenticated with check(
(bucket_id in ('student-photos','student-documents') and (select private.can('files.write'))) or (bucket_id='medical-documents' and (select private.can('medical.write'))));
create policy institutional_file_update on storage.objects for update to authenticated using(
(bucket_id in ('student-photos','student-documents') and (select private.can('files.write'))) or (bucket_id='medical-documents' and (select private.can('medical.write')))) with check(
(bucket_id in ('student-photos','student-documents') and (select private.can('files.write'))) or (bucket_id='medical-documents' and (select private.can('medical.write'))));
-- No browser-side DELETE. Use a reviewed server operation and audit downloads.
