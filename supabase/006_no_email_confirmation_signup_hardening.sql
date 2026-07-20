-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 006
-- Signup hardening for NO EMAIL CONFIRMATION + Admin approval.
-- Run after 001-005. Safe to run repeatedly.
-- ============================================================

begin;

alter table public.profiles
  add column if not exists email text,
  add column if not exists approval_status text not null default 'PENDING',
  add column if not exists requested_org_code text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists last_login_at timestamptz;

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('PENDING','APPROVED','REJECTED','SUSPENDED'));

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id, display_name, email, requested_org_code,
    platform_role, approval_status, is_active,
    created_at, updated_at
  ) values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'),''), split_part(new.email,'@',1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'requested_org_code'),''),
    'USER','PENDING',false,
    coalesce(new.created_at,now()),now()
  )
  on conflict (id) do update set
    display_name=coalesce(excluded.display_name,public.profiles.display_name),
    email=excluded.email,
    requested_org_code=coalesce(excluded.requested_org_code,public.profiles.requested_org_code),
    updated_at=now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Repair missing profiles for Auth users that were created while the trigger was absent/broken.
insert into public.profiles (
  id,display_name,email,requested_org_code,
  platform_role,approval_status,is_active,created_at,updated_at
)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'),''),split_part(u.email,'@',1)),
  u.email,
  nullif(trim(u.raw_user_meta_data ->> 'requested_org_code'),''),
  'USER','PENDING',false,coalesce(u.created_at,now()),now()
from auth.users u
on conflict (id) do update set
  display_name=coalesce(excluded.display_name,public.profiles.display_name),
  email=excluded.email,
  requested_org_code=coalesce(excluded.requested_org_code,public.profiles.requested_org_code),
  updated_at=now();

-- Authenticated users may repair only their own missing profile.
create or replace function public.ensure_my_profile()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user auth.users%rowtype;
  v_profile public.profiles%rowtype;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_user from auth.users where id=auth.uid();
  if v_user.id is null then raise exception 'AUTH_USER_NOT_FOUND'; end if;

  insert into public.profiles (
    id,display_name,email,requested_org_code,
    platform_role,approval_status,is_active,created_at,updated_at
  ) values (
    v_user.id,
    coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'display_name'),''),split_part(v_user.email,'@',1)),
    v_user.email,
    nullif(trim(v_user.raw_user_meta_data ->> 'requested_org_code'),''),
    'USER','PENDING',false,coalesce(v_user.created_at,now()),now()
  )
  on conflict (id) do update set
    display_name=coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'display_name'),''),public.profiles.display_name),
    email=v_user.email,
    requested_org_code=coalesce(nullif(trim(v_user.raw_user_meta_data ->> 'requested_org_code'),''),public.profiles.requested_org_code),
    updated_at=now()
  returning * into v_profile;

  return to_jsonb(v_profile);
end;
$$;

alter table public.profiles enable row level security;
drop policy if exists profiles_select_access on public.profiles;
drop policy if exists profiles_select_self_or_platform_admin on public.profiles;
create policy profiles_select_access on public.profiles
for select to authenticated
using (
  id=auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1 from public.organization_members target_membership
    where target_membership.user_id=profiles.id
      and target_membership.status='ACTIVE'
      and public.can_manage_org_staff(target_membership.organization_id)
  )
);

revoke all on function public.ensure_my_profile() from public;
grant execute on function public.ensure_my_profile() to authenticated;

commit;

-- IMPORTANT (Supabase Dashboard setting, not SQL):
-- Authentication > Sign In / Providers > Email
--   Enable Email Provider = ON
--   Allow new users to sign up = ON
--   Confirm email = OFF
-- New users still receive profiles.approval_status='PENDING' and is_active=false.
