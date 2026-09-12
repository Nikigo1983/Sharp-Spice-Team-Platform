-- Документы клиента: метаданные в таблице, файлы — в Storage

create table if not exists client_documents (
  id text primary key,
  client_id text not null,
  file_name text not null,
  content_type text not null,
  size_bytes integer not null,
  uploaded_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists client_documents_client_created_idx
  on client_documents (client_id, created_at desc);

insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;
