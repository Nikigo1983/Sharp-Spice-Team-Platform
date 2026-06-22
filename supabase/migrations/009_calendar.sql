-- Calendar MVP — persisted events (personal + company)
-- Apply in Supabase → SQL Editor after merge PR #1

create table if not exists calendar_events (
  id text primary key,
  company_id text not null default 'sharp-spice',
  scope text not null check (scope in ('personal', 'company')),
  owner_user_id text,
  title text not null,
  description text not null default '',
  event_type text not null default 'general',
  start_at timestamptz not null,
  end_at timestamptz not null,
  all_day boolean not null default false,
  location text not null default '',
  created_by_user_id text not null,
  created_by_name text not null,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scope <> 'personal' or owner_user_id is not null),
  check (end_at >= start_at)
);

create index if not exists calendar_events_range_idx
  on calendar_events (company_id, start_at, end_at);

create index if not exists calendar_events_personal_idx
  on calendar_events (owner_user_id, start_at)
  where scope = 'personal';

create index if not exists calendar_events_company_idx
  on calendar_events (company_id, start_at)
  where scope = 'company';
