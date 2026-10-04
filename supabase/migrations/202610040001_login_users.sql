-- Prototype identity table. Fixed OTPs do not prove ownership of a phone.
create table if not exists public.login_users (
  id uuid primary key default gen_random_uuid(),
  mobile_number text not null unique check (mobile_number ~ '^\+[1-9][0-9]{7,14}$'),
  email text not null check (char_length(email) <= 254),
  created_at timestamptz not null default now()
);
alter table public.login_users enable row level security;
-- Only the Next.js backend's service role can access these prototype records.
revoke all on public.login_users from anon, authenticated;
grant select, insert on public.login_users to service_role;
comment on table public.login_users is 'Prototype login profiles; phone/email are not ownership-verified.';
