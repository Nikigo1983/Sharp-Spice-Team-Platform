-- Optional CRM client link for video meetings
-- Apply in Supabase → SQL Editor after 017

alter table calendar_events
  add column if not exists linked_client_id text,
  add column if not exists linked_client_name text;
