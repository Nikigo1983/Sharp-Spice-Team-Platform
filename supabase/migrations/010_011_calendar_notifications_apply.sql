-- Calendar notifications — apply 010 + 011 in one run
-- Supabase Dashboard → SQL Editor → New query → Run

-- 010: per-event reminder opt-out
alter table calendar_events
  add column if not exists send_reminders boolean not null default true;

-- 011: idempotent delivery log (24h / 1h)
create table if not exists calendar_reminder_deliveries (
  id text primary key,
  event_id text not null references calendar_events(id) on delete cascade,
  user_id text not null,
  offset_minutes int not null check (offset_minutes in (1440, 60)),
  fire_at timestamptz not null,
  notification_id text,
  event_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (event_id, user_id, offset_minutes)
);

create index if not exists calendar_reminder_deliveries_fire_idx
  on calendar_reminder_deliveries (fire_at);

create index if not exists calendar_reminder_deliveries_event_idx
  on calendar_reminder_deliveries (event_id);

-- Verification (optional — should return 1 row each)
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'calendar_events'
  and column_name = 'send_reminders';

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'calendar_reminder_deliveries';
