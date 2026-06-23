-- Calendar notifications PR #1 — idempotent delivery log for 24h / 1h reminders

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
