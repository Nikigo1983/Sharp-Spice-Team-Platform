-- Назначение задач на одного или нескольких сотрудников
alter table tasks
  add column if not exists assignees jsonb not null default '[]'::jsonb;
