-- Run in the Supabase SQL Editor before deploying the Render service.
-- Health data is available only to the authenticated owner via RLS.
create table if not exists public.pt_tracker_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pt_tracker_data enable row level security;
revoke all on public.pt_tracker_data from anon;
grant select, insert, update, delete on public.pt_tracker_data to authenticated;
grant all on public.pt_tracker_data to service_role;
drop policy if exists "read own tracker" on public.pt_tracker_data;
create policy "read own tracker" on public.pt_tracker_data for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "create own tracker" on public.pt_tracker_data;
create policy "create own tracker" on public.pt_tracker_data for insert to authenticated
  with check ((select auth.uid()) = user_id);
drop policy if exists "update own tracker" on public.pt_tracker_data;
create policy "update own tracker" on public.pt_tracker_data for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
drop policy if exists "delete own tracker" on public.pt_tracker_data;
create policy "delete own tracker" on public.pt_tracker_data for delete to authenticated
  using ((select auth.uid()) = user_id);

-- These service-only tables are never readable through the browser Data API.
create table if not exists public.pt_shares (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot jsonb not null,
  expires_at timestamptz not null,
  revoked boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pt_shares_owner_idx on public.pt_shares(user_id);
alter table public.pt_shares enable row level security;
revoke all on public.pt_shares from anon, authenticated;

create table if not exists public.pt_reminders (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.pt_reminders enable row level security;
revoke all on public.pt_reminders from anon, authenticated;

create table if not exists public.pt_audit (
  id bigint generated always as identity primary key,
  user_id uuid,
  event text not null check (event in ('account_created','login','export','data_deleted','account_deleted','share_created','share_revoked')),
  created_at timestamptz not null default now()
);
create index if not exists pt_audit_created_idx on public.pt_audit(created_at);
alter table public.pt_audit enable row level security;
revoke all on public.pt_audit from anon, authenticated;
grant all on public.pt_shares, public.pt_reminders, public.pt_audit to service_role;
grant usage, select on sequence public.pt_audit_id_seq to service_role;

