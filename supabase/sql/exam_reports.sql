-- Exam report records
-- Maps to ExamReportRow interface in cloudService.ts
create table if not exists public.exam_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_id text not null,
  student_name text not null,
  score numeric(6, 2) not null default 0,
  report_url text not null default '',
  report_json jsonb not null default '{}'::jsonb
);

alter table public.exam_reports enable row level security;

-- Students submit their own reports
create policy "Public can insert exam_reports"
  on public.exam_reports
  for insert
  to anon, authenticated
  with check (true);

-- Teacher dashboard reads all reports
create policy "Public can read exam_reports"
  on public.exam_reports
  for select
  to anon, authenticated
  using (true);

-- Teacher can delete reports
create policy "Public can delete exam_reports"
  on public.exam_reports
  for delete
  to anon, authenticated
  using (true);

create index if not exists exam_reports_created_at_idx
  on public.exam_reports (created_at desc);

create index if not exists exam_reports_student_id_idx
  on public.exam_reports (student_id);
