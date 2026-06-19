-- Командный чат: документы (PDF, Word, Excel и т.д.)
alter table team_chat_messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_content_type text,
  add column if not exists file_size integer;

alter table team_chat_messages
  drop constraint if exists team_chat_messages_message_type_check;

alter table team_chat_messages
  add constraint team_chat_messages_message_type_check
  check (message_type in ('text', 'voice', 'image', 'file'));

insert into storage.buckets (id, name, public)
values ('team-chat-files', 'team-chat-files', false)
on conflict (id) do nothing;
