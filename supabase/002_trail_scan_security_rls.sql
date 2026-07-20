-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 002
-- Helper functions, validation triggers and Row Level Security
-- Run after 001_trail_scan_core_schema.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) UPDATED_AT TRIGGER
-- ------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'profiles',
    'organizations',
    'organization_members',
    'events',
    'race_categories',
    'runners',
    'scan_points',
    'scan_point_categories',
    'staff_assignments',
    'devices',
    'scan_exceptions',
    'race_results'
  ]
  LOOP
    EXECUTE format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    EXECUTE format(
      'create trigger trg_%I_updated_at before update on public.%I '
      || 'for each row execute function public.set_updated_at()',
      t,
      t
    );
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 2) CREATE PROFILE AFTER AUTH SIGNUP
-- ------------------------------------------------------------

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email)
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles for existing users.
insert into public.profiles (id, display_name)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'display_name', u.email)
from auth.users u
on conflict (id) do nothing;

-- ------------------------------------------------------------
-- 3) ACCESS HELPER FUNCTIONS
-- ------------------------------------------------------------

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.platform_role = 'SUPER_ADMIN'
      and p.is_active = true
  );
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
    );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
        and om.role_code = any(p_roles)
    );
$$;

create or replace function public.can_view_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.events e
      join public.organization_members om
        on om.organization_id = e.organization_id
      where e.id = p_event_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
    )
    or exists (
      select 1
      from public.staff_assignments sa
      where sa.event_id = p_event_id
        and sa.user_id = (select auth.uid())
        and sa.is_active = true
        and (sa.valid_from is null or sa.valid_from <= now())
        and (sa.valid_until is null or sa.valid_until >= now())
    );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.events e
      join public.organization_members om
        on om.organization_id = e.organization_id
      where e.id = p_event_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
        and om.role_code = any(array[
          'OWNER',
          'ORG_ADMIN',
          'EVENT_ADMIN',
          'RACE_DIRECTOR'
        ]::text[])
    );
$$;

create or replace function public.can_manage_results(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.events e
      join public.organization_members om
        on om.organization_id = e.organization_id
      where e.id = p_event_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
        and om.role_code = any(array[
          'OWNER',
          'ORG_ADMIN',
          'EVENT_ADMIN',
          'RACE_DIRECTOR',
          'RESULT_ADMIN'
        ]::text[])
    );
$$;

create or replace function public.can_scan_point(p_scan_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_platform_admin()
    or exists (
      select 1
      from public.scan_points sp
      join public.events e on e.id = sp.event_id
      join public.organization_members om
        on om.organization_id = e.organization_id
      where sp.id = p_scan_point_id
        and om.user_id = (select auth.uid())
        and om.status = 'ACTIVE'
        and om.role_code = any(array[
          'OWNER',
          'ORG_ADMIN',
          'EVENT_ADMIN',
          'RACE_DIRECTOR'
        ]::text[])
    )
    or exists (
      select 1
      from public.staff_assignments sa
      where sa.scan_point_id = p_scan_point_id
        and sa.user_id = (select auth.uid())
        and sa.is_active = true
        and sa.role_code in (
          'SCAN_SUPERVISOR',
          'START_STAFF',
          'CP_STAFF',
          'FINISH_STAFF'
        )
        and (sa.valid_from is null or sa.valid_from <= now())
        and (sa.valid_until is null or sa.valid_until >= now())
    );
$$;

-- ------------------------------------------------------------
-- 4) SAFE RPC: CREATE ORGANIZATION + OWNER MEMBERSHIP
-- ------------------------------------------------------------

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_timezone text default 'Asia/Bangkok'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_organization_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if nullif(btrim(p_name), '') is null then
    raise exception 'Organization name is required';
  end if;

  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,62}$' then
    raise exception 'Invalid organization slug';
  end if;

  insert into public.organizations (
    name,
    slug,
    timezone,
    created_by
  )
  values (
    btrim(p_name),
    lower(p_slug),
    coalesce(nullif(btrim(p_timezone), ''), 'Asia/Bangkok'),
    v_user_id
  )
  returning id into v_organization_id;

  insert into public.organization_members (
    organization_id,
    user_id,
    role_code,
    status,
    created_by
  )
  values (
    v_organization_id,
    v_user_id,
    'OWNER',
    'ACTIVE',
    v_user_id
  );

  return v_organization_id;
end;
$$;

-- ------------------------------------------------------------
-- 5) SAFE RPC: CHANGE ACTUAL START TIME WITH HISTORY
-- ------------------------------------------------------------

create or replace function public.set_actual_start_time(
  p_race_category_id uuid,
  p_actual_start_at timestamptz,
  p_reason text
)
returns public.race_categories
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.race_categories;
  v_previous timestamptz;
begin
  select *
  into v_category
  from public.race_categories rc
  where rc.id = p_race_category_id;

  if v_category.id is null then
    raise exception 'Race category not found';
  end if;

  if not public.can_manage_event(v_category.event_id) then
    raise exception 'Permission denied';
  end if;

  if p_actual_start_at is null then
    raise exception 'Actual start time is required';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'Reason is required';
  end if;

  v_previous := v_category.actual_start_at;

  update public.race_categories
  set actual_start_at = p_actual_start_at
  where id = p_race_category_id
  returning * into v_category;

  insert into public.race_start_time_history (
    organization_id,
    event_id,
    race_category_id,
    scheduled_start_at,
    previous_actual_start_at,
    new_actual_start_at,
    reason,
    changed_by
  )
  values (
    v_category.organization_id,
    v_category.event_id,
    v_category.id,
    v_category.scheduled_start_at,
    v_previous,
    p_actual_start_at,
    btrim(p_reason),
    (select auth.uid())
  );

  return v_category;
end;
$$;

-- ------------------------------------------------------------
-- 6) DATA CONSISTENCY VALIDATION
-- ------------------------------------------------------------

create or replace function public.validate_trail_scan_references()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_event_org uuid;
  v_category_event uuid;
  v_category_org uuid;
  v_point_event uuid;
  v_point_org uuid;
  v_runner_event uuid;
  v_runner_org uuid;
  v_runner_category uuid;
begin
  if tg_table_name = 'race_categories' then
    select e.organization_id into v_event_org
    from public.events e where e.id = new.event_id;

    if v_event_org is distinct from new.organization_id then
      raise exception 'race_categories.organization_id does not match event';
    end if;

  elsif tg_table_name = 'runners' then
    select e.organization_id into v_event_org
    from public.events e where e.id = new.event_id;

    select rc.event_id, rc.organization_id
    into v_category_event, v_category_org
    from public.race_categories rc where rc.id = new.race_category_id;

    if v_event_org is distinct from new.organization_id
       or v_category_event is distinct from new.event_id
       or v_category_org is distinct from new.organization_id then
      raise exception 'Runner organization/event/category mismatch';
    end if;

  elsif tg_table_name = 'scan_points' then
    select e.organization_id into v_event_org
    from public.events e where e.id = new.event_id;

    if v_event_org is distinct from new.organization_id then
      raise exception 'scan_points.organization_id does not match event';
    end if;

  elsif tg_table_name = 'scan_point_categories' then
    select sp.event_id, sp.organization_id
    into v_point_event, v_point_org
    from public.scan_points sp where sp.id = new.scan_point_id;

    select rc.event_id, rc.organization_id
    into v_category_event, v_category_org
    from public.race_categories rc where rc.id = new.race_category_id;

    if v_point_event is distinct from new.event_id
       or v_category_event is distinct from new.event_id
       or v_point_org is distinct from new.organization_id
       or v_category_org is distinct from new.organization_id then
      raise exception 'Scan point and race category must belong to the same event';
    end if;

  elsif tg_table_name = 'staff_assignments' then
    select e.organization_id into v_event_org
    from public.events e where e.id = new.event_id;

    if new.scan_point_id is not null then
      select sp.event_id, sp.organization_id
      into v_point_event, v_point_org
      from public.scan_points sp where sp.id = new.scan_point_id;
    end if;

    if v_event_org is distinct from new.organization_id
       or (new.scan_point_id is not null and v_point_event is distinct from new.event_id)
       or (new.scan_point_id is not null and v_point_org is distinct from new.organization_id) then
      raise exception 'Staff assignment organization/event/scan point mismatch';
    end if;

  elsif tg_table_name = 'devices' then
    select e.organization_id into v_event_org
    from public.events e where e.id = new.event_id;

    if new.scan_point_id is not null then
      select sp.event_id, sp.organization_id
      into v_point_event, v_point_org
      from public.scan_points sp where sp.id = new.scan_point_id;
    end if;

    if v_event_org is distinct from new.organization_id
       or (new.scan_point_id is not null and v_point_event is distinct from new.event_id)
       or (new.scan_point_id is not null and v_point_org is distinct from new.organization_id) then
      raise exception 'Device organization/event/scan point mismatch';
    end if;

  elsif tg_table_name = 'scan_logs' then
    select sp.event_id, sp.organization_id
    into v_point_event, v_point_org
    from public.scan_points sp where sp.id = new.scan_point_id;

    if new.runner_id is not null then
      select r.event_id, r.organization_id, r.race_category_id
      into v_runner_event, v_runner_org, v_runner_category
      from public.runners r where r.id = new.runner_id;
    end if;

    if v_point_event is distinct from new.event_id
       or v_point_org is distinct from new.organization_id
       or (new.runner_id is not null and v_runner_event is distinct from new.event_id)
       or (new.runner_id is not null and v_runner_org is distinct from new.organization_id)
       or (new.runner_id is not null and new.race_category_id is distinct from v_runner_category) then
      raise exception 'Scan log organization/event/runner/scan point mismatch';
    end if;

  elsif tg_table_name = 'race_results' then
    select r.event_id, r.organization_id, r.race_category_id
    into v_runner_event, v_runner_org, v_runner_category
    from public.runners r where r.id = new.runner_id;

    if v_runner_event is distinct from new.event_id
       or v_runner_org is distinct from new.organization_id
       or v_runner_category is distinct from new.race_category_id then
      raise exception 'Race result organization/event/category mismatch';
    end if;
  end if;

  return new;
end;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'race_categories',
    'runners',
    'scan_points',
    'scan_point_categories',
    'staff_assignments',
    'devices',
    'scan_logs',
    'race_results'
  ]
  LOOP
    EXECUTE format('drop trigger if exists trg_%I_validate_refs on public.%I', t, t);
    EXECUTE format(
      'create trigger trg_%I_validate_refs before insert or update on public.%I '
      || 'for each row execute function public.validate_trail_scan_references()',
      t,
      t
    );
  END LOOP;
END
$$;

-- ------------------------------------------------------------
-- 7) ROW LEVEL SECURITY
-- ------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_members enable row level security;
alter table public.events enable row level security;
alter table public.race_categories enable row level security;
alter table public.race_start_time_history enable row level security;
alter table public.runners enable row level security;
alter table public.scan_points enable row level security;
alter table public.scan_point_categories enable row level security;
alter table public.staff_assignments enable row level security;
alter table public.devices enable row level security;
alter table public.scan_logs enable row level security;
alter table public.offline_sync_batches enable row level security;
alter table public.scan_exceptions enable row level security;
alter table public.race_results enable row level security;
alter table public.result_adjustments enable row level security;
alter table public.audit_logs enable row level security;

-- Drop policy helper block for repeatable development runs.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'organizations',
        'organization_members',
        'events',
        'race_categories',
        'race_start_time_history',
        'runners',
        'scan_points',
        'scan_point_categories',
        'staff_assignments',
        'devices',
        'scan_logs',
        'offline_sync_batches',
        'scan_exceptions',
        'race_results',
        'result_adjustments',
        'audit_logs'
      )
  LOOP
    EXECUTE format(
      'drop policy if exists %I on %I.%I',
      r.policyname,
      r.schemaname,
      r.tablename
    );
  END LOOP;
END
$$;

-- Profiles
create policy profiles_select_self_or_platform_admin
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or public.is_platform_admin()
);

-- Organizations
create policy organizations_select_members
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

create policy organizations_update_admins
on public.organizations
for update
to authenticated
using (public.has_org_role(id, array['OWNER', 'ORG_ADMIN']::text[]))
with check (public.has_org_role(id, array['OWNER', 'ORG_ADMIN']::text[]));

create policy organizations_delete_owner
on public.organizations
for delete
to authenticated
using (public.has_org_role(id, array['OWNER']::text[]));

-- Organization members
create policy organization_members_select_members
on public.organization_members
for select
to authenticated
using (public.is_org_member(organization_id));

create policy organization_members_insert_admins
on public.organization_members
for insert
to authenticated
with check (
  public.has_org_role(organization_id, array['OWNER', 'ORG_ADMIN']::text[])
);

create policy organization_members_update_admins
on public.organization_members
for update
to authenticated
using (
  public.has_org_role(organization_id, array['OWNER', 'ORG_ADMIN']::text[])
)
with check (
  public.has_org_role(organization_id, array['OWNER', 'ORG_ADMIN']::text[])
);

create policy organization_members_delete_admins
on public.organization_members
for delete
to authenticated
using (
  public.has_org_role(organization_id, array['OWNER', 'ORG_ADMIN']::text[])
);

-- Events
create policy events_select_access
on public.events
for select
to authenticated
using (public.can_view_event(id));

create policy events_insert_org_admins
on public.events
for insert
to authenticated
with check (
  public.has_org_role(
    organization_id,
    array['OWNER', 'ORG_ADMIN', 'EVENT_ADMIN']::text[]
  )
);

create policy events_update_managers
on public.events
for update
to authenticated
using (public.can_manage_event(id))
with check (public.can_manage_event(id));

create policy events_delete_org_admins
on public.events
for delete
to authenticated
using (
  public.has_org_role(
    organization_id,
    array['OWNER', 'ORG_ADMIN']::text[]
  )
);

-- Race categories
create policy categories_select_event_access
on public.race_categories
for select
to authenticated
using (public.can_view_event(event_id));

create policy categories_insert_event_managers
on public.race_categories
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy categories_update_event_managers
on public.race_categories
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy categories_delete_event_managers
on public.race_categories
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Start time history: read only through table; write through RPC.
create policy start_history_select_event_access
on public.race_start_time_history
for select
to authenticated
using (public.can_view_event(event_id));

-- Runners
create policy runners_select_event_access
on public.runners
for select
to authenticated
using (public.can_view_event(event_id));

create policy runners_insert_event_managers
on public.runners
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy runners_update_event_managers
on public.runners
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy runners_delete_event_managers
on public.runners
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Scan points
create policy scan_points_select_event_access
on public.scan_points
for select
to authenticated
using (public.can_view_event(event_id));

create policy scan_points_insert_event_managers
on public.scan_points
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy scan_points_update_event_managers
on public.scan_points
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy scan_points_delete_event_managers
on public.scan_points
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Scan point/category routes
create policy scan_point_categories_select_event_access
on public.scan_point_categories
for select
to authenticated
using (public.can_view_event(event_id));

create policy scan_point_categories_insert_event_managers
on public.scan_point_categories
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy scan_point_categories_update_event_managers
on public.scan_point_categories
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy scan_point_categories_delete_event_managers
on public.scan_point_categories
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Staff assignments
create policy staff_assignments_select_self_or_manager
on public.staff_assignments
for select
to authenticated
using (
  user_id = (select auth.uid())
  or public.can_manage_event(event_id)
);

create policy staff_assignments_insert_managers
on public.staff_assignments
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy staff_assignments_update_managers
on public.staff_assignments
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy staff_assignments_delete_managers
on public.staff_assignments
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Devices
create policy devices_select_event_access
on public.devices
for select
to authenticated
using (public.can_view_event(event_id));

create policy devices_insert_event_managers
on public.devices
for insert
to authenticated
with check (public.can_manage_event(event_id));

create policy devices_update_event_managers
on public.devices
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

create policy devices_delete_event_managers
on public.devices
for delete
to authenticated
using (public.can_manage_event(event_id));

-- Immutable scan logs: staff may insert only at assigned points.
create policy scan_logs_select_event_access
on public.scan_logs
for select
to authenticated
using (public.can_view_event(event_id));

create policy scan_logs_insert_assigned_staff
on public.scan_logs
for insert
to authenticated
with check (
  public.can_scan_point(scan_point_id)
  and (
    staff_user_id is null
    or staff_user_id = (select auth.uid())
    or public.can_manage_event(event_id)
  )
);

-- Offline sync batches
create policy sync_batches_select_event_access
on public.offline_sync_batches
for select
to authenticated
using (public.can_view_event(event_id));

create policy sync_batches_insert_event_access
on public.offline_sync_batches
for insert
to authenticated
with check (public.can_view_event(event_id));

create policy sync_batches_update_event_managers
on public.offline_sync_batches
for update
to authenticated
using (public.can_manage_event(event_id))
with check (public.can_manage_event(event_id));

-- Exceptions
create policy scan_exceptions_select_event_access
on public.scan_exceptions
for select
to authenticated
using (public.can_view_event(event_id));

create policy scan_exceptions_insert_event_access
on public.scan_exceptions
for insert
to authenticated
with check (
  public.can_view_event(event_id)
  and (
    scan_point_id is null
    or public.can_scan_point(scan_point_id)
    or public.can_manage_event(event_id)
  )
);

create policy scan_exceptions_update_event_managers
on public.scan_exceptions
for update
to authenticated
using (public.can_manage_results(event_id))
with check (public.can_manage_results(event_id));

-- Results
create policy race_results_select_event_access
on public.race_results
for select
to authenticated
using (public.can_view_event(event_id));

create policy race_results_insert_result_managers
on public.race_results
for insert
to authenticated
with check (public.can_manage_results(event_id));

create policy race_results_update_result_managers
on public.race_results
for update
to authenticated
using (public.can_manage_results(event_id))
with check (public.can_manage_results(event_id));

create policy race_results_delete_result_managers
on public.race_results
for delete
to authenticated
using (public.can_manage_results(event_id));

create policy result_adjustments_select_event_access
on public.result_adjustments
for select
to authenticated
using (public.can_view_event(event_id));

create policy result_adjustments_insert_result_managers
on public.result_adjustments
for insert
to authenticated
with check (
  public.can_manage_results(event_id)
  and adjusted_by = (select auth.uid())
);

-- Audit logs are visible to organization administrators.
create policy audit_logs_select_admins
on public.audit_logs
for select
to authenticated
using (
  public.is_platform_admin()
  or (
    organization_id is not null
    and public.has_org_role(
      organization_id,
      array['OWNER', 'ORG_ADMIN', 'EVENT_ADMIN', 'RACE_DIRECTOR']::text[]
    )
  )
);

-- ------------------------------------------------------------
-- 8) FUNCTION PERMISSIONS
-- ------------------------------------------------------------

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.has_org_role(uuid, text[]) from public;
revoke all on function public.can_view_event(uuid) from public;
revoke all on function public.can_manage_event(uuid) from public;
revoke all on function public.can_manage_results(uuid) from public;
revoke all on function public.can_scan_point(uuid) from public;
revoke all on function public.create_organization(text, text, text) from public;
revoke all on function public.set_actual_start_time(uuid, timestamptz, text) from public;

grant execute on function public.is_platform_admin() to authenticated;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.has_org_role(uuid, text[]) to authenticated;
grant execute on function public.can_view_event(uuid) to authenticated;
grant execute on function public.can_manage_event(uuid) to authenticated;
grant execute on function public.can_manage_results(uuid) to authenticated;
grant execute on function public.can_scan_point(uuid) to authenticated;
grant execute on function public.create_organization(text, text, text) to authenticated;
grant execute on function public.set_actual_start_time(uuid, timestamptz, text) to authenticated;

commit;
