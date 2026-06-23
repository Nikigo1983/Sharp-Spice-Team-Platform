-- Calendar notifications PR #1 — per-event reminder opt-out
alter table calendar_events
  add column if not exists send_reminders boolean not null default true;
