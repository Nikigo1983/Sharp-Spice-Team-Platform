-- Цикл согласования задач: исполнитель → проверка автором → доработка (повторяемо)

alter table tasks drop constraint if exists tasks_status_check;

alter table tasks add constraint tasks_status_check check (
  status in (
    'new',
    'in_progress',
    'pending_approval',
    'needs_revision',
    'completed'
  )
);

alter table tasks
  add column if not exists review_history jsonb not null default '[]'::jsonb;
