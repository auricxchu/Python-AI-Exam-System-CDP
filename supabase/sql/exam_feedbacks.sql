create extension if not exists pgcrypto;

insert into storage.buckets (id, name, public)
values ('exam-feedbacks', 'exam-feedbacks', false)
on conflict (id) do update
set public = excluded.public;

create table if not exists public.exam_feedback_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_id text not null unique,
  created_at timestamptz not null default now(),
  status text not null default 'open',
  category text not null check (category in ('technical', 'grading', 'other')),
  message text not null,
  student_id text not null,
  student_name text not null,
  exam_title text not null,
  exam_started_at timestamptz,
  exam_finished_at timestamptz,
  score numeric(6, 2),
  ai_provider text,
  report_url text,
  storage_path text,
  exam_context jsonb not null default '{}'::jsonb,
  client_context jsonb not null default '{}'::jsonb
);

create index if not exists exam_feedback_tickets_created_at_idx
  on public.exam_feedback_tickets (created_at desc);

create index if not exists exam_feedback_tickets_student_id_idx
  on public.exam_feedback_tickets (student_id);

create index if not exists exam_feedback_tickets_status_idx
  on public.exam_feedback_tickets (status);

alter table public.exam_feedback_tickets enable row level security;

drop policy if exists "Public can create exam feedback tickets" on public.exam_feedback_tickets;
create policy "Public can create exam feedback tickets"
on public.exam_feedback_tickets
for insert
to anon, authenticated
with check (true);

drop policy if exists "Authenticated can read exam feedback tickets" on public.exam_feedback_tickets;
create policy "Authenticated can read exam feedback tickets"
on public.exam_feedback_tickets
for select
to authenticated
using (true);

drop policy if exists "Public can upload exam feedback files" on storage.objects;
create policy "Public can upload exam feedback files"
on storage.objects
for insert
to anon, authenticated
with check (bucket_id = 'exam-feedbacks');

drop policy if exists "Authenticated can read exam feedback files" on storage.objects;
create policy "Authenticated can read exam feedback files"
on storage.objects
for select
to authenticated
using (bucket_id = 'exam-feedbacks');
