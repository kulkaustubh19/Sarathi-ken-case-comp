-- Durable prototype state for Vercel. Server service role only; never expose its key.
create table if not exists public.sarathi_demo_state (
  key text primary key, payload jsonb not null, revision bigint not null default 1,
  expires_at timestamptz, updated_at timestamptz not null default now()
);
alter table public.sarathi_demo_state enable row level security;
revoke all on public.sarathi_demo_state from anon, authenticated;
grant select, insert, update, delete on public.sarathi_demo_state to service_role;
create or replace function public.sarathi_write_state(state_key text, expected_revision bigint, next_payload jsonb, expiry timestamptz default null)
returns table(applied boolean) language plpgsql security invoker set search_path = public as $$
declare changed integer;
begin
  if expected_revision = 0 then
    insert into sarathi_demo_state(key,payload,revision,expires_at) values(state_key,next_payload,1,expiry) on conflict do nothing;
  else
    update sarathi_demo_state set payload=next_payload, revision=revision+1, expires_at=expiry, updated_at=now() where key=state_key and revision=expected_revision;
  end if;
  get diagnostics changed = row_count;
  return query select changed = 1;
end $$;
revoke all on function public.sarathi_write_state(text,bigint,jsonb,timestamptz) from public, anon, authenticated;
grant execute on function public.sarathi_write_state(text,bigint,jsonb,timestamptz) to service_role;
create table if not exists public.sarathi_agent_events (
  id uuid primary key, run_id text not null, user_id text, created_at timestamptz not null,
  expires_at timestamptz not null, type text not null, details jsonb not null
);
create index if not exists sarathi_agent_events_expiry on public.sarathi_agent_events(expires_at);
create index if not exists sarathi_agent_events_owner on public.sarathi_agent_events(user_id,created_at);
alter table public.sarathi_agent_events enable row level security;
revoke all on public.sarathi_agent_events from anon, authenticated;
grant select, insert, delete on public.sarathi_agent_events to service_role;
insert into storage.buckets(id,name,public,file_size_limit) values('sarathi-demo','sarathi-demo',false,4194304)
on conflict(id) do update set public=false,file_size_limit=4194304;

-- Enable Supabase Cron (pg_cron) in the dashboard, then run these statements separately:
-- select cron.schedule('sarathi-expired-traces','* * * * *',
-- $$delete from public.sarathi_agent_events where expires_at <= now();
-- delete from public.sarathi_demo_state where expires_at <= now();$$);
-- Expired temporary state is inaccessible immediately; Cron removes it within a minute.
