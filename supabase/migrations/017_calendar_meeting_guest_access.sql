-- Guest access limits and optional password for external participants
-- Apply in Supabase → SQL Editor after merge

alter table calendar_events
  add column if not exists guest_max_count int
    check (guest_max_count is null or (guest_max_count >= 1 and guest_max_count <= 50)),
  add column if not exists guest_access_password_hash text;

update calendar_events
set guest_max_count = 10
where event_type = 'video_meeting' and guest_max_count is null;
