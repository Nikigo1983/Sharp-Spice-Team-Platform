-- Guest invite links for external video meeting participants
-- Apply in Supabase → SQL Editor after merge

create table if not exists calendar_meeting_guest_invites (
  id text primary key,
  event_id text not null references calendar_events(id) on delete cascade,
  token text not null unique,
  created_by_user_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists calendar_meeting_guest_invites_event_idx
  on calendar_meeting_guest_invites (event_id, created_at desc);

create unique index if not exists calendar_meeting_guest_invites_active_event_idx
  on calendar_meeting_guest_invites (event_id)
  where enabled = true and revoked_at is null;

alter table calendar_meeting_audit
  add column if not exists participant_type text not null default 'team'
  check (participant_type in ('team', 'guest'));
