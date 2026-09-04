-- Client portal (new channel). Isolated from Formgrid / Google Sheets CRM.
-- Does not touch client_notes, app_state lead-review keys, or Sheets tables.

create table if not exists client_portal_invitations (
  id text primary key,
  token text not null unique,
  email text not null,
  first_name text not null,
  preferred_locale text not null default 'ru'
    check (preferred_locale in ('ru', 'en')),
  created_by_user_id text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'revoked'))
);

create index if not exists client_portal_invitations_email_idx
  on client_portal_invitations (lower(email));

create index if not exists client_portal_invitations_created_at_idx
  on client_portal_invitations (created_at desc);

create table if not exists client_portal_users (
  id text primary key,
  email text not null unique,
  first_name text not null,
  preferred_locale text not null default 'ru'
    check (preferred_locale in ('ru', 'en')),
  invitation_id text references client_portal_invitations (id) on delete set null,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_portal_users_email_idx
  on client_portal_users (lower(email));

create table if not exists client_portal_questionnaires (
  id text primary key,
  client_portal_user_id text not null references client_portal_users (id) on delete cascade,
  invitation_id text references client_portal_invitations (id) on delete set null,
  email text not null,
  first_name text not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted')),
  answers jsonb not null default '{}'::jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz
);

create unique index if not exists client_portal_questionnaires_user_uidx
  on client_portal_questionnaires (client_portal_user_id);

create index if not exists client_portal_questionnaires_submitted_idx
  on client_portal_questionnaires (submitted_at desc nulls last)
  where status = 'submitted';

-- Files live under prefix client-portal/ inside the existing private bucket.
insert into storage.buckets (id, name, public)
values ('task-attachments', 'task-attachments', false)
on conflict (id) do nothing;
