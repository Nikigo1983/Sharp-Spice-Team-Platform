-- Online presence (heartbeat), separate from team_chat_last_seen

create table if not exists user_presence (
  user_id text primary key,
  last_active_at timestamptz not null default now()
);

create index if not exists user_presence_last_active_idx
  on user_presence (last_active_at desc);
