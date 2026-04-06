create table if not exists public.ai_provider_settings (
  provider text primary key check (provider in ('deepseek', 'gemini', 'openai', 'qwen', 'moonshot')),
  api_key text not null default '',
  model text not null,
  updated_at timestamptz not null default now()
);

alter table public.ai_provider_settings enable row level security;

revoke all on public.ai_provider_settings from anon, authenticated;
