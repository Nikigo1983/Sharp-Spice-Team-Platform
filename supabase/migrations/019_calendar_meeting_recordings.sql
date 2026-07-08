-- Video meeting recordings (LiveKit egress → storage)
-- Apply in Supabase → SQL Editor after 018

create table if not exists calendar_meeting_recordings (
  id text primary key,
  event_id text not null references calendar_events(id) on delete cascade,
  egress_id text unique,
  status text not null default 'starting'
    check (status in ('starting', 'active', 'processing', 'complete', 'failed', 'stopped')),
  started_by_user_id text not null,
  started_by_name text not null,
  storage_path text,
  file_name text,
  duration_seconds int,
  file_size_bytes bigint,
  error_message text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists calendar_meeting_recordings_event_idx
  on calendar_meeting_recordings (event_id, started_at desc);

create index if not exists calendar_meeting_recordings_status_idx
  on calendar_meeting_recordings (status, started_at desc);
