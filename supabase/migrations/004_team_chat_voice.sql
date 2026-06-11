-- Голосовые сообщения в командном чате
alter table team_chat_messages
  add column if not exists message_type text not null default 'text'
    check (message_type in ('text', 'voice')),
  add column if not exists audio_url text,
  add column if not exists audio_duration_ms integer;

-- Приватное хранилище аудио (раздача через API платформы)
insert into storage.buckets (id, name, public)
values ('team-chat-audio', 'team-chat-audio', false)
on conflict (id) do nothing;
