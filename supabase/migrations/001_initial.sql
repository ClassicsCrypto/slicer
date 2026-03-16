-- Slicer — Initial Database Schema
-- Run this in the Supabase SQL editor or via supabase db push

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- JOBS TABLE
-- ============================================================
create table if not exists jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text,
  source_url text,
  r2_key text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'complete', 'failed')),
  options jsonb,
  progress jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Index for user queries
create index if not exists jobs_user_id_idx on jobs (user_id);
create index if not exists jobs_status_idx on jobs (status);
create index if not exists jobs_created_at_idx on jobs (created_at desc);

-- Auto-update updated_at
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger jobs_updated_at
  before update on jobs
  for each row execute function update_updated_at_column();

-- ============================================================
-- CLIPS TABLE
-- ============================================================
create table if not exists clips (
  id uuid primary key default gen_random_uuid(),
  job_id uuid references jobs on delete cascade not null,
  user_id uuid references auth.users not null,
  r2_key text not null,
  thumbnail_r2_key text,
  duration integer,       -- seconds
  start_time integer,     -- seconds from start of source
  end_time integer,       -- seconds from start of source
  subtitle_track jsonb,   -- array of {start, end, text} cues
  created_at timestamptz not null default now()
);

-- Indexes
create index if not exists clips_job_id_idx on clips (job_id);
create index if not exists clips_user_id_idx on clips (user_id);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS
alter table jobs enable row level security;
alter table clips enable row level security;

-- Jobs policies
create policy "Users can view their own jobs"
  on jobs for select using (auth.uid() = user_id);

create policy "Users can insert their own jobs"
  on jobs for insert with check (auth.uid() = user_id);

create policy "Users can update their own jobs"
  on jobs for update using (auth.uid() = user_id);

create policy "Users can delete their own jobs"
  on jobs for delete using (auth.uid() = user_id);

-- Clips policies
create policy "Users can view their own clips"
  on clips for select using (auth.uid() = user_id);

create policy "Users can insert their own clips"
  on clips for insert with check (auth.uid() = user_id);

create policy "Users can update their own clips"
  on clips for update using (auth.uid() = user_id);

create policy "Users can delete their own clips"
  on clips for delete using (auth.uid() = user_id);

-- ============================================================
-- REALTIME SUBSCRIPTIONS
-- ============================================================
-- Enable realtime for the jobs table so the frontend can
-- stream progress updates without polling.
alter publication supabase_realtime add table jobs;
alter publication supabase_realtime add table clips;
