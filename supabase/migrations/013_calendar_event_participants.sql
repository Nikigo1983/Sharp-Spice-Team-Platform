-- Video meeting invite lists (selected participants or all team)
-- Apply in Supabase → SQL Editor after merge

alter table calendar_events
  add column if not exists video_invite_mode text
  check (video_invite_mode is null or video_invite_mode in ('all_team', 'selected'));

create table if not exists calendar_event_participants (
  event_id text not null references calendar_events(id) on delete cascade,
  user_id text not null,
  primary key (event_id, user_id)
);

create index if not exists calendar_event_participants_user_idx
  on calendar_event_participants (user_id, event_id);
