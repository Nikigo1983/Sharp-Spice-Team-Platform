-- Internal video meetings — event type + join/leave audit
-- Apply in Supabase → SQL Editor after merge PR #1 (before PR #3 staging smoke)

alter table calendar_events
  drop constraint if exists calendar_events_event_type_check;

alter table calendar_events
  add constraint calendar_events_event_type_check
  check (event_type in ('general', 'video_meeting'));

create table if not exists calendar_meeting_audit (
  id text primary key,
  event_id text not null references calendar_events(id) on delete cascade,
  user_id text not null,
  user_name text not null,
  room_name text not null,
  action text not null check (action in ('joined', 'left')),
  occurred_at timestamptz not null default now()
);

create index if not exists calendar_meeting_audit_event_idx
  on calendar_meeting_audit (event_id, occurred_at desc);

create index if not exists calendar_meeting_audit_user_idx
  on calendar_meeting_audit (user_id, occurred_at desc);
