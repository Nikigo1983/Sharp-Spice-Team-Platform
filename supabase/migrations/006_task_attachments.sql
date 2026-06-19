-- Вложения к задачам (метаданные в JSONB, файлы — в Storage)
alter table tasks
  add column if not exists attachments jsonb not null default '[]'::jsonb;

insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;
