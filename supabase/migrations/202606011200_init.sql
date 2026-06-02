-- CallanApp 初始占位（在 Supabase 项目 callanApp 的 SQL Editor 或 CLI 中执行）

create table if not exists public.app_meta (
  id text primary key default 'default',
  created_at timestamptz not null default now()
);

comment on table public.app_meta is 'CallanApp bootstrap table';
