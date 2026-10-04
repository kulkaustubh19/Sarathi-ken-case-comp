-- Run AFTER 202610040001_login_users.sql. Safe to run again.
alter table public.login_users add column if not exists user_name text;
alter table public.login_users add column if not exists drive_folder_url text;
alter table public.login_users add column if not exists storage_consent_at timestamptz;
alter table public.login_users add column if not exists storage_consent_version text;
create table if not exists public.drive_connections (
  user_id uuid primary key references public.login_users(id) on delete cascade,
  google_sub text not null,
  google_email text not null,
  repository_folder_id text not null,
  created_at timestamptz not null default now()
);
create table if not exists public.health_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.login_users(id) on delete cascade,
  patient_name text not null,
  document_type text not null,
  doctor_name text not null,
  city text,
  document_date date not null,
  filename text not null,
  original_filename text not null,
  repository_path text not null,
  drive_file_id text not null unique,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  created_at timestamptz not null default now()
);
create table if not exists public.document_access (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.login_users(id) on delete cascade,
  recipient_email text not null,
  status text not null check (status in ('pending_signature','pending_drive','active','revoking','revoked')),
  consent_method text not null check (consent_method in ('prototype','setu_esign')),
  consent_text text not null,
  consent_version text not null default 'healthnest-sharing-v1',
  consent_accepted_at timestamptz not null,
  signed_at timestamptz,
  signature_request_id text,
  signing_url text,
  drive_permission_id text,
  invitation_email_status text not null default 'pending',
  revocation_email_status text not null default 'not_required',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index if not exists document_access_current_idx on public.document_access(owner_id,recipient_email) where status <> 'revoked';
create table if not exists public.healthnest_email_outbox (
  id uuid primary key default gen_random_uuid(),
  access_id uuid not null references public.document_access(id),
  event text not null check (event in ('invitation','revocation')),
  recipient text not null,
  subject text not null,
  body text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique(access_id,event)
);
create index if not exists health_documents_owner_idx on public.health_documents(owner_id);
create index if not exists document_access_recipient_idx on public.document_access(recipient_email,status);
alter table public.drive_connections enable row level security;
alter table public.health_documents enable row level security;
alter table public.document_access enable row level security;
alter table public.healthnest_email_outbox enable row level security;
revoke all on public.drive_connections, public.health_documents, public.document_access, public.healthnest_email_outbox from anon, authenticated;
grant select, insert, update, delete on public.drive_connections, public.health_documents, public.document_access, public.healthnest_email_outbox to service_role;
grant update on public.login_users to service_role;
