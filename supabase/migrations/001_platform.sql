-- Sharp & Spice Team Platform — initial schema
-- Run in Supabase → SQL Editor → New query → Run

create extension if not exists "pgcrypto";

create table if not exists tasks (
  id text primary key,
  title text not null,
  description text not null default '',
  status text not null check (status in ('new', 'in_progress', 'completed')),
  created_by_user_id text not null,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  due_date date,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  assignees jsonb not null default '[]'::jsonb
);

create index if not exists tasks_updated_at_idx on tasks (updated_at desc);

create table if not exists team_chat_messages (
  id text primary key,
  user_id text not null,
  user_name text not null,
  user_role text not null,
  message_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_chat_messages_created_at_idx
  on team_chat_messages (created_at asc);

create table if not exists team_chat_last_seen (
  user_id text primary key,
  last_seen_at timestamptz not null default now()
);

create table if not exists ai_workspace_chats (
  id text primary key,
  user_id text not null,
  title text not null default 'Новый чат',
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_workspace_chats_user_updated_idx
  on ai_workspace_chats (user_id, updated_at desc);

create table if not exists client_notes (
  id text primary key,
  client_id text not null,
  author text not null,
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_notes_client_created_idx
  on client_notes (client_id, created_at desc);

create table if not exists notifications (
  id text primary key,
  user_id text not null,
  type text not null,
  title text not null,
  message text not null,
  author_name text,
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create table if not exists app_state (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Seed analytics supplement (Visa D demo data)
insert into app_state (key, value)
values (
  'analytics_croatia_supplement',
  '{
    "visaD": [
      {"consulate": "Посольство Хорватии, Москва", "submitted": 24, "approved": 20, "rejected": 4, "avgProcessingDays": 38},
      {"consulate": "Консульство, Санкт-Петербург", "submitted": 11, "approved": 9, "rejected": 2, "avgProcessingDays": 42},
      {"consulate": "Консульство, Новосибирск", "submitted": 6, "approved": 5, "rejected": 1, "avgProcessingDays": 45}
    ]
  }'::jsonb
)
on conflict (key) do nothing;

insert into app_state (key, value)
values ('formgrid_known_leads', '{"initialized": false, "rowKeys": []}'::jsonb)
on conflict (key) do nothing;
