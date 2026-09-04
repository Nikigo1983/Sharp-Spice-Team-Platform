-- Password reset tokens for client portal (self-service). Isolated from employee auth.

create table if not exists client_portal_password_resets (
  id text primary key,
  user_id text not null references client_portal_users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists client_portal_password_resets_user_idx
  on client_portal_password_resets (user_id, created_at desc);
