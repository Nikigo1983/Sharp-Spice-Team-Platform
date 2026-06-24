-- Assignee progress reports (comment + optional file) on tasks
-- Apply in Supabase → SQL Editor after merge

alter table tasks
  add column if not exists progress_reports jsonb not null default '[]'::jsonb;
