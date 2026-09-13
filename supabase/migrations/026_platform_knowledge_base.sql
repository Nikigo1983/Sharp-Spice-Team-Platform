-- Platform knowledge base (structured tables for future scale).
-- Runtime v1 also stores via app_state when these tables are not yet applied.

create table if not exists kb_libraries (
  id text primary key,
  slug text not null unique,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists kb_folders (
  id text primary key,
  library_id text not null references kb_libraries (id) on delete cascade,
  parent_id text references kb_folders (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  source_drive_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_folders_library_parent_idx
  on kb_folders (library_id, parent_id, sort_order);

create table if not exists kb_articles (
  id text primary key,
  library_id text not null references kb_libraries (id) on delete cascade,
  folder_id text references kb_folders (id) on delete set null,
  title text not null,
  body text not null default '',
  status text not null default 'published'
    check (status in ('draft', 'published')),
  source_drive_id text,
  source_mime_type text,
  updated_by_user_id text,
  updated_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists kb_articles_library_folder_idx
  on kb_articles (library_id, folder_id, updated_at desc);

create unique index if not exists kb_articles_source_drive_id_uidx
  on kb_articles (source_drive_id)
  where source_drive_id is not null;

insert into kb_libraries (id, slug, title)
values (
  'lib-client-knowledge',
  'client_knowledge',
  'База знаний для клиентов'
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('knowledge-base', 'knowledge-base', false)
on conflict (id) do nothing;
