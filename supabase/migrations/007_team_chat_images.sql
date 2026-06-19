-- Командный чат: изображения (вставка скриншота / фото)
alter table team_chat_messages
  add column if not exists image_url text;

alter table team_chat_messages
  drop constraint if exists team_chat_messages_message_type_check;

alter table team_chat_messages
  add constraint team_chat_messages_message_type_check
  check (message_type in ('text', 'voice', 'image'));

insert into storage.buckets (id, name, public)
values ('team-chat-images', 'team-chat-images', false)
on conflict (id) do nothing;
