-- RESTART Registration System - isolated registration platform patch
-- Applied to Supabase project: tnvwdseomwzosjeemapd
-- Tables for this subsystem use prefix restart_

alter table public.restart_participants
  add column if not exists title text,
  add column if not exists address text,
  add column if not exists emergency_phone text,
  add column if not exists emergency_relation text;

create or replace function public.restart_admin_session_status()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select private.restart_is_admin();
$$;

revoke all on function public.restart_admin_session_status() from public;
revoke all on function public.restart_admin_session_status() from anon;
grant execute on function public.restart_admin_session_status() to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='storage' and tablename='objects'
      and policyname='restart_slips_public_insert'
  ) then
    create policy "restart_slips_public_insert"
    on storage.objects for insert
    to anon, authenticated
    with check (
      bucket_id='restart-slips'
      and name ~ '^[0-9a-fA-F-]{36}/[0-9a-zA-Z._-]+$'
    );
  end if;
end $$;

-- restart_create_registration(jsonb) is hardened in production to:
-- 1) validate Event open/close status server-side
-- 2) calculate/verify category + package pricing server-side
-- 3) validate payment schedule total
-- 4) validate beneficiary total = 100% when enabled
-- 5) reject duplicate beneficiary ID and runner/beneficiary same ID


-- Dedicated registration admin authorization (decoupled from RRIH/Trail Scan)
create table if not exists public.restart_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'ADMIN' check (role in ('ADMIN','VIEWER')),
  active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restart_admin_users enable row level security;

create or replace function private.restart_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.restart_admin_users a
    where a.user_id = auth.uid() and a.active = true and a.role = 'ADMIN'
  );
$$;

revoke all on public.restart_admin_users from anon, authenticated;
