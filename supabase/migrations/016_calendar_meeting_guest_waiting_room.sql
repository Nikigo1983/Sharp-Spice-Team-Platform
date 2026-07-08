-- Guest waiting room for external video meeting participants
-- Apply in Supabase → SQL Editor after merge

alter table calendar_events
  add column if not exists guest_waiting_room boolean not null default true;

create table if not exists calendar_meeting_guest_admissions (
  id text primary key,
  event_id text not null references calendar_events(id) on delete cascade,
  invite_id text not null references calendar_meeting_guest_invites(id) on delete cascade,
  guest_id text not null,
  display_name text not null,
  status text not null check (status in ('pending', 'admitted', 'rejected', 'left')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id text
);

create index if not exists calendar_meeting_guest_admissions_event_status_idx
  on calendar_meeting_guest_admissions (event_id, status, created_at desc);

create index if not exists calendar_meeting_guest_admissions_guest_idx
  on calendar_meeting_guest_admissions (guest_id, created_at desc);
