-- Storage buckets for exam assets and reports
-- Supabase requires buckets to exist + have RLS policies for public access

-- Image bucket for question assets
insert into storage.buckets (id, name, public)
values ('exam-assets', 'exam-assets', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read exam-assets"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'exam-assets');

create policy "Public can upload exam-assets"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'exam-assets');

-- Report bucket for exam report files
insert into storage.buckets (id, name, public)
values ('exam-reports', 'exam-reports', true)
on conflict (id) do update set public = excluded.public;

create policy "Public can read exam-reports"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'exam-reports');

create policy "Public can upload exam-reports"
  on storage.objects
  for insert
  to anon, authenticated
  with check (bucket_id = 'exam-reports');

create policy "Public can delete exam-reports"
  on storage.objects
  for delete
  to anon, authenticated
  using (bucket_id = 'exam-reports');
