

-- ==================== 001_trail_scan_core_schema.sql ====================

-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 001
-- Core schema for START / unlimited CHECKPOINTS / FINISH
-- Run once in Supabase SQL Editor on a new project.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) USERS / ORGANIZATIONS
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  platform_role text not null default 'USER'
    check (platform_role in ('USER', 'SUPER_ADMIN')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Asia/Bangkok',
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organizations_slug_format_check
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$')
);

create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null
    check (role_code in (
      'OWNER',
      'ORG_ADMIN',
      'EVENT_ADMIN',
      'RACE_DIRECTOR',
      'RESULT_ADMIN',
      'VIEWER'
    )),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'DISABLED')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

-- ------------------------------------------------------------
-- 2) EVENTS / RACE CATEGORIES
-- ------------------------------------------------------------

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  slug text not null,
  event_code text,
  race_date date not null,
  timezone text not null default 'Asia/Bangkok',
  location_name text,
  location_detail text,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'SETUP', 'ACTIVE', 'FINISHED', 'ARCHIVED')),
  offline_enabled boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug)
);

create table if not exists public.race_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  code text not null,
  name text not null,
  distance_km numeric(8,2) check (distance_km is null or distance_km >= 0),
  bib_prefix text,
  timing_mode text not null default 'GUN'
    check (timing_mode in ('GUN', 'INDIVIDUAL')),
  scheduled_start_at timestamptz,
  actual_start_at timestamptz,
  cutoff_at timestamptz,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code),
  unique (event_id, id)
);

create table if not exists public.race_start_time_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  race_category_id uuid not null references public.race_categories(id) on delete cascade,
  scheduled_start_at timestamptz,
  previous_actual_start_at timestamptz,
  new_actual_start_at timestamptz not null,
  reason text not null,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 3) RUNNERS / QR TOKENS
-- ------------------------------------------------------------

create table if not exists public.runners (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  race_category_id uuid not null references public.race_categories(id),
  bib_number text not null,
  qr_token text not null default encode(gen_random_bytes(12), 'hex'),
  first_name text not null,
  last_name text not null,
  display_name text,
  gender text,
  age_group text,
  status text not null default 'REGISTERED'
    check (status in (
      'REGISTERED',
      'CHECKED_IN',
      'RUNNING',
      'FINISHED',
      'PENDING_REVIEW',
      'DNS',
      'DNF',
      'DSQ',
      'CANCELLED'
    )),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, bib_number),
  unique (event_id, qr_token)
);

-- ------------------------------------------------------------
-- 4) FLEXIBLE SCAN POINTS
-- START, CHECKPOINT and FINISH use the same table.
-- ------------------------------------------------------------

create table if not exists public.scan_points (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  point_type text not null
    check (point_type in ('START', 'CHECKPOINT', 'FINISH')),
  code text not null,
  name text not null,
  display_order integer not null default 0,
  distance_km numeric(8,2) check (distance_km is null or distance_km >= 0),
  latitude numeric(10,7),
  longitude numeric(10,7),
  scheduled_open_at timestamptz,
  scheduled_close_at timestamptz,
  default_cutoff_at timestamptz,
  scan_mode text not null default 'SINGLE'
    check (scan_mode in ('SINGLE', 'IN_OUT', 'MULTI')),
  allow_offline boolean not null default true,
  allow_manual_entry boolean not null default true,
  is_active boolean not null default true,
  show_on_dashboard boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, code),
  unique (event_id, id)
);

-- A scan point may serve one or many race categories.
-- sequence_no is independent for each race category.
create table if not exists public.scan_point_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scan_point_id uuid not null references public.scan_points(id) on delete cascade,
  race_category_id uuid not null references public.race_categories(id) on delete cascade,
  sequence_no integer not null check (sequence_no >= 0),
  is_required boolean not null default true,
  cutoff_at timestamptz,
  opens_at timestamptz,
  closes_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (scan_point_id, race_category_id),
  unique (race_category_id, sequence_no)
);

-- ------------------------------------------------------------
-- 5) STAFF ASSIGNMENTS / DEVICES
-- ------------------------------------------------------------

create table if not exists public.staff_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  scan_point_id uuid references public.scan_points(id) on delete cascade,
  role_code text not null
    check (role_code in (
      'SCAN_SUPERVISOR',
      'START_STAFF',
      'CP_STAFF',
      'FINISH_STAFF',
      'SCAN_VIEWER'
    )),
  can_manual_entry boolean not null default false,
  can_override_warning boolean not null default false,
  is_active boolean not null default true,
  valid_from timestamptz,
  valid_until timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scan_point_id uuid references public.scan_points(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  device_code text not null,
  device_name text,
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'DISABLED', 'RETIRED')),
  manifest_version text,
  last_manifest_at timestamptz,
  server_time_offset_ms integer not null default 0,
  last_seen_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, device_code)
);

-- ------------------------------------------------------------
-- 6) SCAN LOGS / OFFLINE SYNC
-- ------------------------------------------------------------

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  offline_id uuid not null,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  race_category_id uuid references public.race_categories(id),
  runner_id uuid references public.runners(id),
  scan_point_id uuid not null references public.scan_points(id),
  scan_action text not null
    check (scan_action in (
      'START_CHECKIN',
      'START',
      'CP_IN',
      'CP_OUT',
      'FINISH',
      'MANUAL'
    )),
  source text not null default 'CAMERA'
    check (source in (
      'CAMERA',
      'EXTERNAL_SCANNER',
      'MANUAL',
      'IMPORT',
      'OFFLINE_SYNC'
    )),
  device_id uuid references public.devices(id) on delete set null,
  staff_user_id uuid references auth.users(id) on delete set null,
  scanned_at_device timestamptz not null,
  estimated_server_time timestamptz not null,
  received_at timestamptz not null default now(),
  record_status text not null default 'ACCEPTED'
    check (record_status in ('ACCEPTED', 'DUPLICATE', 'PENDING_REVIEW', 'REJECTED')),
  is_offline boolean not null default false,
  sequence_snapshot integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (offline_id)
);

create table if not exists public.offline_sync_batches (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null unique,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  item_count integer not null default 0 check (item_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  conflict_count integer not null default 0 check (conflict_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  status text not null default 'RECEIVED'
    check (status in ('RECEIVED', 'PROCESSING', 'PROCESSED', 'PARTIAL', 'FAILED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_summary text,
  created_at timestamptz not null default now()
);

create table if not exists public.scan_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  scan_log_id uuid references public.scan_logs(id) on delete set null,
  runner_id uuid references public.runners(id) on delete set null,
  scan_point_id uuid references public.scan_points(id) on delete set null,
  exception_type text not null,
  details jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'RESOLVED', 'IGNORED')),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 7) RESULTS / MANUAL ADJUSTMENTS
-- ------------------------------------------------------------

create table if not exists public.race_results (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  race_category_id uuid not null references public.race_categories(id),
  runner_id uuid not null references public.runners(id) on delete cascade,
  official_start_at timestamptz,
  individual_start_at timestamptz,
  finish_at timestamptz,
  elapsed_seconds bigint check (elapsed_seconds is null or elapsed_seconds >= 0),
  result_status text not null default 'PENDING'
    check (result_status in (
      'PENDING',
      'FINISHER',
      'LATE_FINISH',
      'PENDING_REVIEW',
      'DNS',
      'DNF',
      'DSQ'
    )),
  missing_required_points integer not null default 0
    check (missing_required_points >= 0),
  is_manual_override boolean not null default false,
  last_computed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, runner_id)
);

create table if not exists public.result_adjustments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  result_id uuid not null references public.race_results(id) on delete cascade,
  previous_data jsonb not null default '{}'::jsonb,
  new_data jsonb not null default '{}'::jsonb,
  reason text not null,
  adjusted_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  event_id uuid references public.events(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 8) INDEXES
-- ------------------------------------------------------------

create index if not exists idx_org_members_user
  on public.organization_members(user_id, status);

create index if not exists idx_events_org_status
  on public.events(organization_id, status, race_date);

create index if not exists idx_categories_event_active
  on public.race_categories(event_id, is_active, sort_order);

create index if not exists idx_runners_event_category_status
  on public.runners(event_id, race_category_id, status);

create index if not exists idx_runners_event_bib
  on public.runners(event_id, bib_number);

create index if not exists idx_runners_event_qr
  on public.runners(event_id, qr_token);

create index if not exists idx_scan_points_event_type_active
  on public.scan_points(event_id, point_type, is_active, display_order);

create index if not exists idx_scan_point_categories_category_sequence
  on public.scan_point_categories(race_category_id, sequence_no);

create index if not exists idx_staff_assignments_user_event
  on public.staff_assignments(user_id, event_id, is_active);

create index if not exists idx_staff_assignments_point
  on public.staff_assignments(scan_point_id, is_active);

create index if not exists idx_devices_event_point
  on public.devices(event_id, scan_point_id, status);

create index if not exists idx_scan_logs_event_point_time
  on public.scan_logs(event_id, scan_point_id, estimated_server_time desc);

create index if not exists idx_scan_logs_runner_time
  on public.scan_logs(runner_id, estimated_server_time);

create index if not exists idx_scan_logs_event_status
  on public.scan_logs(event_id, record_status, estimated_server_time desc);

create index if not exists idx_sync_batches_device_time
  on public.offline_sync_batches(device_id, started_at desc);

create index if not exists idx_scan_exceptions_event_status
  on public.scan_exceptions(event_id, status, created_at desc);

create index if not exists idx_race_results_event_category_status
  on public.race_results(event_id, race_category_id, result_status);

create index if not exists idx_audit_logs_org_event_time
  on public.audit_logs(organization_id, event_id, created_at desc);

commit;


-- ==================== 002_trail_scan_security_rls.sql ====================

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


-- ==================== 003_trail_scan_rpc.sql ====================

-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 003
-- Safe scanner RPC, offline batch sync and automatic results
-- Run after:
--   001_trail_scan_core_schema.sql
--   002_trail_scan_security_rls.sql
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) CLIENT CLOCK CHECK
-- ------------------------------------------------------------

create or replace function public.get_server_clock()
returns jsonb
language sql
volatile
security invoker
set search_path = ''
as $$
  select jsonb_build_object(
    'server_time', clock_timestamp(),
    'server_epoch_ms', floor(extract(epoch from clock_timestamp()) * 1000)::bigint
  );
$$;

-- ------------------------------------------------------------
-- 2) SAFE RPC: RECORD ONE SCAN
--
-- p_identifier_type:
--   QR  = runners.qr_token
--   BIB = runners.bib_number
--
-- p_requested_action may be NULL. The database resolves it from
-- the scan point type and scan mode.
-- ------------------------------------------------------------

create or replace function public.record_scan(
  p_event_id uuid,
  p_scan_point_id uuid,
  p_identifier text,
  p_identifier_type text default 'QR',
  p_offline_id uuid default null,
  p_scanned_at_device timestamptz default null,
  p_estimated_server_time timestamptz default null,
  p_device_id uuid default null,
  p_source text default 'CAMERA',
  p_requested_action text default null,
  p_is_offline boolean default false,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_point public.scan_points%rowtype;
  v_runner public.runners%rowtype;
  v_category public.race_categories%rowtype;
  v_route public.scan_point_categories%rowtype;
  v_device public.devices%rowtype;
  v_existing public.scan_logs%rowtype;
  v_last_scan public.scan_logs%rowtype;
  v_scan_log public.scan_logs%rowtype;

  v_identifier_type text := upper(coalesce(nullif(btrim(p_identifier_type), ''), 'QR'));
  v_source text := upper(coalesce(nullif(btrim(p_source), ''), 'CAMERA'));
  v_action text;
  v_offline_id uuid := coalesce(p_offline_id, gen_random_uuid());
  v_device_time timestamptz := coalesce(p_scanned_at_device, clock_timestamp());
  v_scan_time timestamptz := coalesce(
    p_estimated_server_time,
    p_scanned_at_device,
    clock_timestamp()
  );

  v_record_status text := 'ACCEPTED';
  v_missing_previous integer := 0;
  v_missing_required integer := 0;
  v_duplicate boolean := false;
  v_cutoff_at timestamptz;
  v_effective_start timestamptz;
  v_individual_start timestamptz;
  v_elapsed_seconds bigint;
  v_result_status text;
  v_warnings jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_event_id is null or p_scan_point_id is null then
    raise exception 'EVENT_AND_SCAN_POINT_REQUIRED';
  end if;

  if nullif(btrim(p_identifier), '') is null then
    raise exception 'RUNNER_IDENTIFIER_REQUIRED';
  end if;

  if v_identifier_type not in ('QR', 'BIB') then
    raise exception 'INVALID_IDENTIFIER_TYPE';
  end if;

  if v_source not in (
    'CAMERA',
    'EXTERNAL_SCANNER',
    'MANUAL',
    'IMPORT',
    'OFFLINE_SYNC'
  ) then
    raise exception 'INVALID_SCAN_SOURCE';
  end if;

  select *
  into v_point
  from public.scan_points sp
  where sp.id = p_scan_point_id
    and sp.event_id = p_event_id;

  if v_point.id is null then
    raise exception 'SCAN_POINT_NOT_FOUND';
  end if;

  if not v_point.is_active then
    raise exception 'SCAN_POINT_DISABLED';
  end if;

  if not public.can_scan_point(v_point.id) then
    raise exception 'SCAN_PERMISSION_DENIED';
  end if;

  if p_is_offline and not v_point.allow_offline then
    raise exception 'OFFLINE_NOT_ALLOWED_AT_THIS_POINT';
  end if;

  if v_source = 'MANUAL' and not v_point.allow_manual_entry then
    raise exception 'MANUAL_ENTRY_NOT_ALLOWED';
  end if;

  -- Idempotency: resending the same offline_id returns the first row.
  select *
  into v_existing
  from public.scan_logs sl
  where sl.offline_id = v_offline_id;

  if v_existing.id is not null then
    if v_existing.event_id is distinct from p_event_id
       or v_existing.scan_point_id is distinct from p_scan_point_id then
      raise exception 'OFFLINE_ID_CONFLICT';
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'scan_log_id', v_existing.id,
      'offline_id', v_existing.offline_id,
      'record_status', v_existing.record_status,
      'scan_action', v_existing.scan_action,
      'scanned_at', v_existing.estimated_server_time
    );
  end if;

  if p_device_id is not null then
    select *
    into v_device
    from public.devices d
    where d.id = p_device_id;

    if v_device.id is null then
      raise exception 'DEVICE_NOT_FOUND';
    end if;

    if v_device.status <> 'ACTIVE' then
      raise exception 'DEVICE_DISABLED';
    end if;

    if v_device.event_id is distinct from p_event_id then
      raise exception 'DEVICE_EVENT_MISMATCH';
    end if;

    if v_device.scan_point_id is not null
       and v_device.scan_point_id is distinct from p_scan_point_id then
      raise exception 'DEVICE_SCAN_POINT_MISMATCH';
    end if;

    if v_device.assigned_user_id is not null
       and v_device.assigned_user_id is distinct from v_user_id
       and not public.can_manage_event(p_event_id) then
      raise exception 'DEVICE_USER_MISMATCH';
    end if;
  end if;

  if v_identifier_type = 'QR' then
    select *
    into v_runner
    from public.runners r
    where r.event_id = p_event_id
      and r.qr_token = btrim(p_identifier);
  else
    select *
    into v_runner
    from public.runners r
    where r.event_id = p_event_id
      and upper(r.bib_number) = upper(btrim(p_identifier));
  end if;

  if v_runner.id is null then
    raise exception 'RUNNER_NOT_FOUND';
  end if;

  select *
  into v_category
  from public.race_categories rc
  where rc.id = v_runner.race_category_id;

  if v_category.id is null or not v_category.is_active then
    raise exception 'RACE_CATEGORY_NOT_AVAILABLE';
  end if;

  select *
  into v_route
  from public.scan_point_categories spc
  where spc.scan_point_id = p_scan_point_id
    and spc.race_category_id = v_runner.race_category_id;

  if v_route.id is null then
    v_record_status := 'REJECTED';
    v_warnings := v_warnings || jsonb_build_array('POINT_NOT_IN_RUNNER_ROUTE');
  end if;

  if v_runner.status = 'CANCELLED' then
    v_record_status := 'REJECTED';
    v_warnings := v_warnings || jsonb_build_array('RUNNER_CANCELLED');
  elsif v_runner.status in ('DNS', 'DNF', 'DSQ') then
    if v_record_status <> 'REJECTED' then
      v_record_status := 'PENDING_REVIEW';
    end if;
    v_warnings := v_warnings || jsonb_build_array('RUNNER_STATUS_' || v_runner.status);
  end if;

  -- Prevent the same visible QR from being recorded repeatedly in a few frames.
  select *
  into v_last_scan
  from public.scan_logs sl
  where sl.runner_id = v_runner.id
    and sl.scan_point_id = p_scan_point_id
    and sl.record_status in ('ACCEPTED', 'PENDING_REVIEW')
  order by sl.estimated_server_time desc
  limit 1;

  if v_last_scan.id is not null
     and v_scan_time >= v_last_scan.estimated_server_time
     and v_scan_time - v_last_scan.estimated_server_time < interval '5 seconds' then
    v_duplicate := true;
  end if;

  -- Resolve action automatically.
  if nullif(btrim(p_requested_action), '') is not null then
    v_action := upper(btrim(p_requested_action));
  elsif v_point.point_type = 'START' then
    v_action := 'START';
  elsif v_point.point_type = 'FINISH' then
    v_action := 'FINISH';
  elsif v_point.scan_mode = 'IN_OUT' then
    if v_last_scan.id is not null and v_last_scan.scan_action = 'CP_IN' then
      v_action := 'CP_OUT';
    else
      v_action := 'CP_IN';
    end if;
  else
    v_action := 'CP_IN';
  end if;

  if v_action not in (
    'START_CHECKIN',
    'START',
    'CP_IN',
    'CP_OUT',
    'FINISH',
    'MANUAL'
  ) then
    raise exception 'INVALID_SCAN_ACTION';
  end if;

  -- MANUAL is a source in normal scanner use. Normalize a requested
  -- MANUAL action to the point-specific action so duplicate checks and
  -- result calculation remain consistent.
  if v_action = 'MANUAL' then
    if v_point.point_type = 'START' then
      v_action := 'START';
    elsif v_point.point_type = 'FINISH' then
      v_action := 'FINISH';
    elsif v_point.scan_mode = 'IN_OUT'
          and v_last_scan.id is not null
          and v_last_scan.scan_action = 'CP_IN' then
      v_action := 'CP_OUT';
    else
      v_action := 'CP_IN';
    end if;
  end if;

  if v_point.point_type = 'START'
     and v_action not in ('START_CHECKIN', 'START', 'MANUAL') then
    raise exception 'ACTION_NOT_ALLOWED_FOR_START';
  end if;

  if v_point.point_type = 'CHECKPOINT'
     and v_action not in ('CP_IN', 'CP_OUT', 'MANUAL') then
    raise exception 'ACTION_NOT_ALLOWED_FOR_CHECKPOINT';
  end if;

  if v_point.point_type = 'CHECKPOINT'
     and v_action = 'CP_OUT'
     and v_point.scan_mode <> 'IN_OUT' then
    raise exception 'CP_OUT_REQUIRES_IN_OUT_MODE';
  end if;

  if v_point.point_type = 'FINISH'
     and v_action not in ('FINISH', 'MANUAL') then
    raise exception 'ACTION_NOT_ALLOWED_FOR_FINISH';
  end if;

  if v_record_status <> 'REJECTED' and v_point.scan_mode <> 'MULTI' then
    if v_duplicate then
      v_record_status := 'DUPLICATE';
    elsif v_point.scan_mode = 'SINGLE' and exists (
      select 1
      from public.scan_logs sl
      where sl.runner_id = v_runner.id
        and sl.scan_point_id = p_scan_point_id
        and sl.scan_action = v_action
        and sl.record_status in ('ACCEPTED', 'PENDING_REVIEW')
    ) then
      v_record_status := 'DUPLICATE';
      v_duplicate := true;
    end if;
  end if;

  if v_route.id is not null and v_route.sequence_no > 0 then
    select count(*)::integer
    into v_missing_previous
    from public.scan_point_categories required_route
    where required_route.race_category_id = v_runner.race_category_id
      and required_route.is_required = true
      and required_route.sequence_no < v_route.sequence_no
      and not exists (
        select 1
        from public.scan_logs passed
        where passed.runner_id = v_runner.id
          and passed.scan_point_id = required_route.scan_point_id
          and passed.record_status in ('ACCEPTED', 'PENDING_REVIEW')
      );

    if v_missing_previous > 0 and v_record_status = 'ACCEPTED' then
      v_record_status := 'PENDING_REVIEW';
      v_warnings := v_warnings || jsonb_build_array('MISSING_PREVIOUS_REQUIRED_POINT');
    end if;
  end if;

  if coalesce(v_route.opens_at, v_point.scheduled_open_at) is not null
     and v_scan_time < coalesce(v_route.opens_at, v_point.scheduled_open_at) then
    if v_record_status = 'ACCEPTED' then
      v_record_status := 'PENDING_REVIEW';
    end if;
    v_warnings := v_warnings || jsonb_build_array('SCAN_POINT_NOT_OPEN_YET');
  end if;

  if coalesce(v_route.closes_at, v_point.scheduled_close_at) is not null
     and v_scan_time > coalesce(v_route.closes_at, v_point.scheduled_close_at) then
    if v_record_status = 'ACCEPTED' then
      v_record_status := 'PENDING_REVIEW';
    end if;
    v_warnings := v_warnings || jsonb_build_array('SCAN_POINT_ALREADY_CLOSED');
  end if;

  v_cutoff_at := coalesce(
    v_route.cutoff_at,
    case when v_point.point_type = 'FINISH' then v_category.cutoff_at end,
    v_point.default_cutoff_at
  );

  if v_cutoff_at is not null and v_scan_time > v_cutoff_at then
    v_warnings := v_warnings || jsonb_build_array('AFTER_CUTOFF');
  end if;

  insert into public.scan_logs (
    offline_id,
    organization_id,
    event_id,
    race_category_id,
    runner_id,
    scan_point_id,
    scan_action,
    source,
    device_id,
    staff_user_id,
    scanned_at_device,
    estimated_server_time,
    record_status,
    is_offline,
    sequence_snapshot,
    notes,
    metadata
  )
  values (
    v_offline_id,
    v_runner.organization_id,
    v_runner.event_id,
    v_runner.race_category_id,
    v_runner.id,
    v_point.id,
    v_action,
    v_source,
    p_device_id,
    v_user_id,
    v_device_time,
    v_scan_time,
    v_record_status,
    coalesce(p_is_offline, false),
    v_route.sequence_no,
    p_notes,
    coalesce(p_metadata, '{}'::jsonb)
      || jsonb_build_object(
        'identifier_type', v_identifier_type,
        'warnings', v_warnings,
        'missing_previous_required_points', v_missing_previous
      )
  )
  returning * into v_scan_log;

  if v_record_status = 'DUPLICATE' then
    insert into public.scan_exceptions (
      organization_id,
      event_id,
      scan_log_id,
      runner_id,
      scan_point_id,
      exception_type,
      details
    )
    values (
      v_runner.organization_id,
      v_runner.event_id,
      v_scan_log.id,
      v_runner.id,
      v_point.id,
      'DUPLICATE_SCAN',
      jsonb_build_object('previous_scan_log_id', v_last_scan.id)
    );
  end if;

  if v_route.id is null then
    insert into public.scan_exceptions (
      organization_id,
      event_id,
      scan_log_id,
      runner_id,
      scan_point_id,
      exception_type,
      details
    )
    values (
      v_runner.organization_id,
      v_runner.event_id,
      v_scan_log.id,
      v_runner.id,
      v_point.id,
      'POINT_NOT_IN_RUNNER_ROUTE',
      jsonb_build_object('race_category_id', v_runner.race_category_id)
    );
  end if;

  if v_missing_previous > 0 then
    insert into public.scan_exceptions (
      organization_id,
      event_id,
      scan_log_id,
      runner_id,
      scan_point_id,
      exception_type,
      details
    )
    values (
      v_runner.organization_id,
      v_runner.event_id,
      v_scan_log.id,
      v_runner.id,
      v_point.id,
      'MISSING_PREVIOUS_REQUIRED_POINT',
      jsonb_build_object('missing_count', v_missing_previous)
    );
  end if;

  if v_cutoff_at is not null and v_scan_time > v_cutoff_at then
    insert into public.scan_exceptions (
      organization_id,
      event_id,
      scan_log_id,
      runner_id,
      scan_point_id,
      exception_type,
      details
    )
    values (
      v_runner.organization_id,
      v_runner.event_id,
      v_scan_log.id,
      v_runner.id,
      v_point.id,
      'AFTER_CUTOFF',
      jsonb_build_object(
        'cutoff_at', v_cutoff_at,
        'scanned_at', v_scan_time
      )
    );
  end if;

  -- Duplicate and rejected scans remain in history but do not change race state.
  if v_record_status not in ('DUPLICATE', 'REJECTED') then
    if v_point.point_type = 'START' then
      if v_action = 'START_CHECKIN' then
        update public.runners
        set status = case
          when status = 'REGISTERED' then 'CHECKED_IN'
          else status
        end
        where id = v_runner.id;
      else
        update public.runners
        set status = case
          when status in ('REGISTERED', 'CHECKED_IN') then 'RUNNING'
          else status
        end
        where id = v_runner.id;

        insert into public.race_results (
          organization_id,
          event_id,
          race_category_id,
          runner_id,
          official_start_at,
          individual_start_at,
          result_status,
          last_computed_at
        )
        values (
          v_runner.organization_id,
          v_runner.event_id,
          v_runner.race_category_id,
          v_runner.id,
          coalesce(v_category.actual_start_at, v_category.scheduled_start_at),
          case when v_category.timing_mode = 'INDIVIDUAL' then v_scan_time end,
          'PENDING',
          clock_timestamp()
        )
        on conflict (event_id, runner_id)
        do update set
          official_start_at = excluded.official_start_at,
          individual_start_at = coalesce(
            public.race_results.individual_start_at,
            excluded.individual_start_at
          ),
          last_computed_at = excluded.last_computed_at,
          updated_at = clock_timestamp();
      end if;

    elsif v_point.point_type = 'CHECKPOINT' then
      update public.runners
      set status = case
        when status in ('REGISTERED', 'CHECKED_IN') then 'RUNNING'
        else status
      end
      where id = v_runner.id;

    elsif v_point.point_type = 'FINISH' then
      select min(sl.estimated_server_time)
      into v_individual_start
      from public.scan_logs sl
      join public.scan_points start_point
        on start_point.id = sl.scan_point_id
      where sl.runner_id = v_runner.id
        and start_point.point_type = 'START'
        and sl.scan_action = 'START'
        and sl.record_status in ('ACCEPTED', 'PENDING_REVIEW');

      if v_category.timing_mode = 'INDIVIDUAL' then
        v_effective_start := v_individual_start;
      else
        v_effective_start := coalesce(
          v_category.actual_start_at,
          v_category.scheduled_start_at
        );
      end if;

      select count(*)::integer
      into v_missing_required
      from public.scan_point_categories required_route
      join public.scan_points required_point
        on required_point.id = required_route.scan_point_id
      where required_route.race_category_id = v_runner.race_category_id
        and required_route.is_required = true
        and required_point.point_type <> 'FINISH'
        and not exists (
          select 1
          from public.scan_logs passed
          where passed.runner_id = v_runner.id
            and passed.scan_point_id = required_route.scan_point_id
            and passed.record_status in ('ACCEPTED', 'PENDING_REVIEW')
        );

      if v_effective_start is null or v_scan_time < v_effective_start then
        v_elapsed_seconds := null;
        v_result_status := 'PENDING_REVIEW';

        insert into public.scan_exceptions (
          organization_id,
          event_id,
          scan_log_id,
          runner_id,
          scan_point_id,
          exception_type,
          details
        )
        values (
          v_runner.organization_id,
          v_runner.event_id,
          v_scan_log.id,
          v_runner.id,
          v_point.id,
          'START_TIME_MISSING_OR_INVALID',
          jsonb_build_object(
            'effective_start_at', v_effective_start,
            'finish_at', v_scan_time
          )
        );
      else
        v_elapsed_seconds := floor(
          extract(epoch from (v_scan_time - v_effective_start))
        )::bigint;

        if v_missing_required > 0 or v_record_status = 'PENDING_REVIEW' then
          v_result_status := 'PENDING_REVIEW';
        elsif v_cutoff_at is not null and v_scan_time > v_cutoff_at then
          v_result_status := 'LATE_FINISH';
        else
          v_result_status := 'FINISHER';
        end if;
      end if;

      insert into public.race_results (
        organization_id,
        event_id,
        race_category_id,
        runner_id,
        official_start_at,
        individual_start_at,
        finish_at,
        elapsed_seconds,
        result_status,
        missing_required_points,
        last_computed_at,
        metadata
      )
      values (
        v_runner.organization_id,
        v_runner.event_id,
        v_runner.race_category_id,
        v_runner.id,
        coalesce(v_category.actual_start_at, v_category.scheduled_start_at),
        v_individual_start,
        v_scan_time,
        v_elapsed_seconds,
        v_result_status,
        v_missing_required,
        clock_timestamp(),
        jsonb_build_object(
          'finish_scan_log_id', v_scan_log.id,
          'finish_cutoff_at', v_cutoff_at
        )
      )
      on conflict (event_id, runner_id)
      do update set
        official_start_at = excluded.official_start_at,
        individual_start_at = coalesce(
          excluded.individual_start_at,
          public.race_results.individual_start_at
        ),
        finish_at = excluded.finish_at,
        elapsed_seconds = excluded.elapsed_seconds,
        result_status = excluded.result_status,
        missing_required_points = excluded.missing_required_points,
        last_computed_at = excluded.last_computed_at,
        metadata = public.race_results.metadata || excluded.metadata,
        updated_at = clock_timestamp();

      update public.runners
      set status = case
        when v_result_status in ('FINISHER', 'LATE_FINISH') then 'FINISHED'
        else 'PENDING_REVIEW'
      end
      where id = v_runner.id;
    end if;
  end if;

  if p_device_id is not null then
    update public.devices
    set last_seen_at = clock_timestamp()
    where id = p_device_id;
  end if;

  insert into public.audit_logs (
    organization_id,
    event_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    after_data
  )
  values (
    v_runner.organization_id,
    v_runner.event_id,
    v_user_id,
    'SCAN_RECORDED',
    'scan_log',
    v_scan_log.id,
    jsonb_build_object(
      'runner_id', v_runner.id,
      'bib_number', v_runner.bib_number,
      'scan_point_id', v_point.id,
      'scan_action', v_action,
      'record_status', v_record_status
    )
  );

  return jsonb_build_object(
    'ok', v_record_status <> 'REJECTED',
    'idempotent', false,
    'scan_log_id', v_scan_log.id,
    'offline_id', v_scan_log.offline_id,
    'record_status', v_record_status,
    'scan_action', v_action,
    'scanned_at', v_scan_time,
    'runner', jsonb_build_object(
      'id', v_runner.id,
      'bib_number', v_runner.bib_number,
      'display_name', coalesce(
        nullif(v_runner.display_name, ''),
        concat_ws(' ', v_runner.first_name, v_runner.last_name)
      ),
      'race_category_id', v_runner.race_category_id
    ),
    'scan_point', jsonb_build_object(
      'id', v_point.id,
      'code', v_point.code,
      'name', v_point.name,
      'point_type', v_point.point_type
    ),
    'warnings', v_warnings,
    'missing_previous_required_points', v_missing_previous,
    'result_status', v_result_status,
    'elapsed_seconds', v_elapsed_seconds
  );
end;
$$;

-- ------------------------------------------------------------
-- 3) SAFE RPC: SYNC AN OFFLINE BATCH
--
-- Example item:
-- {
--   "offline_id": "uuid",
--   "scan_point_id": "uuid",
--   "identifier": "QR_TOKEN",
--   "identifier_type": "QR",
--   "scanned_at_device": "2026-07-18T08:30:00+07:00",
--   "estimated_server_time": "2026-07-18T08:30:03+07:00",
--   "source": "OFFLINE_SYNC",
--   "requested_action": null,
--   "notes": null,
--   "metadata": {}
-- }
-- ------------------------------------------------------------

create or replace function public.sync_scan_batch(
  p_event_id uuid,
  p_device_id uuid,
  p_batch_id uuid,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_device public.devices%rowtype;
  v_item jsonb;
  v_result jsonb;
  v_items_count integer := 0;
  v_success_count integer := 0;
  v_conflict_count integer := 0;
  v_error_count integer := 0;
  v_status text;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if p_event_id is null or p_device_id is null or p_batch_id is null then
    raise exception 'EVENT_DEVICE_AND_BATCH_REQUIRED';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'ITEMS_MUST_BE_JSON_ARRAY';
  end if;

  select *
  into v_device
  from public.devices d
  where d.id = p_device_id
    and d.event_id = p_event_id;

  if v_device.id is null then
    raise exception 'DEVICE_NOT_FOUND';
  end if;

  if v_device.status <> 'ACTIVE' then
    raise exception 'DEVICE_DISABLED';
  end if;

  if v_device.assigned_user_id is not null
     and v_device.assigned_user_id is distinct from v_user_id
     and not public.can_manage_event(p_event_id) then
    raise exception 'DEVICE_USER_MISMATCH';
  end if;

  insert into public.offline_sync_batches (
    batch_id,
    organization_id,
    event_id,
    device_id,
    item_count,
    status
  )
  values (
    p_batch_id,
    v_device.organization_id,
    p_event_id,
    p_device_id,
    jsonb_array_length(p_items),
    'PROCESSING'
  )
  on conflict (batch_id)
  do nothing;

  -- If the batch was already completed, return its stored counters.
  if exists (
    select 1
    from public.offline_sync_batches b
    where b.batch_id = p_batch_id
      and b.status in ('PROCESSED', 'PARTIAL')
  ) then
    return (
      select jsonb_build_object(
        'ok', b.status = 'PROCESSED',
        'idempotent', true,
        'batch_id', b.batch_id,
        'status', b.status,
        'item_count', b.item_count,
        'success_count', b.success_count,
        'conflict_count', b.conflict_count,
        'error_count', b.error_count
      )
      from public.offline_sync_batches b
      where b.batch_id = p_batch_id
    );
  end if;

  for v_item in
    select item
    from jsonb_array_elements(p_items) as batch_items(item)
  loop
    v_items_count := v_items_count + 1;

    begin
      v_result := public.record_scan(
        p_event_id => p_event_id,
        p_scan_point_id => nullif(v_item ->> 'scan_point_id', '')::uuid,
        p_identifier => v_item ->> 'identifier',
        p_identifier_type => coalesce(v_item ->> 'identifier_type', 'QR'),
        p_offline_id => nullif(v_item ->> 'offline_id', '')::uuid,
        p_scanned_at_device => nullif(v_item ->> 'scanned_at_device', '')::timestamptz,
        p_estimated_server_time => nullif(v_item ->> 'estimated_server_time', '')::timestamptz,
        p_device_id => p_device_id,
        p_source => coalesce(v_item ->> 'source', 'OFFLINE_SYNC'),
        p_requested_action => nullif(v_item ->> 'requested_action', ''),
        p_is_offline => true,
        p_notes => nullif(v_item ->> 'notes', ''),
        p_metadata => coalesce(v_item -> 'metadata', '{}'::jsonb)
      );

      if coalesce(v_result ->> 'record_status', '') = 'DUPLICATE'
         or coalesce((v_result ->> 'idempotent')::boolean, false) then
        v_conflict_count := v_conflict_count + 1;
      elsif coalesce((v_result ->> 'ok')::boolean, false) then
        v_success_count := v_success_count + 1;
      else
        v_error_count := v_error_count + 1;
      end if;

    exception
      when others then
        v_error_count := v_error_count + 1;

        if jsonb_array_length(v_errors) < 50 then
          v_errors := v_errors || jsonb_build_array(
            jsonb_build_object(
              'offline_id', v_item ->> 'offline_id',
              'scan_point_id', v_item ->> 'scan_point_id',
              'identifier', v_item ->> 'identifier',
              'error', sqlerrm
            )
          );
        end if;
    end;
  end loop;

  if v_error_count = 0 then
    v_status := 'PROCESSED';
  elsif v_success_count > 0 or v_conflict_count > 0 then
    v_status := 'PARTIAL';
  else
    v_status := 'FAILED';
  end if;

  update public.offline_sync_batches
  set
    item_count = v_items_count,
    success_count = v_success_count,
    conflict_count = v_conflict_count,
    error_count = v_error_count,
    status = v_status,
    completed_at = clock_timestamp(),
    error_summary = case
      when v_error_count > 0 then left(v_errors::text, 4000)
      else null
    end
  where batch_id = p_batch_id;

  update public.devices
  set last_seen_at = clock_timestamp()
  where id = p_device_id;

  return jsonb_build_object(
    'ok', v_status = 'PROCESSED',
    'idempotent', false,
    'batch_id', p_batch_id,
    'status', v_status,
    'item_count', v_items_count,
    'success_count', v_success_count,
    'conflict_count', v_conflict_count,
    'error_count', v_error_count,
    'errors', v_errors
  );
end;
$$;

-- ------------------------------------------------------------
-- 4) FORCE SCAN WRITES THROUGH RPC
-- ------------------------------------------------------------

-- Keep SELECT policies from Migration 002, but remove browser-side
-- INSERT/UPDATE paths. SECURITY DEFINER RPCs above perform validation.
drop policy if exists scan_logs_insert_assigned_staff
  on public.scan_logs;

drop policy if exists sync_batches_insert_event_access
  on public.offline_sync_batches;

drop policy if exists sync_batches_update_event_managers
  on public.offline_sync_batches;

revoke insert, update, delete on public.scan_logs
  from anon, authenticated;

revoke insert, update, delete on public.offline_sync_batches
  from anon, authenticated;

-- ------------------------------------------------------------
-- 5) FUNCTION PERMISSIONS
-- ------------------------------------------------------------

revoke all on function public.get_server_clock() from public;
revoke all on function public.record_scan(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  boolean,
  text,
  jsonb
) from public;
revoke all on function public.sync_scan_batch(uuid, uuid, uuid, jsonb)
  from public;

grant execute on function public.get_server_clock()
  to authenticated;

grant execute on function public.record_scan(
  uuid,
  uuid,
  text,
  text,
  uuid,
  timestamptz,
  timestamptz,
  uuid,
  text,
  text,
  boolean,
  text,
  jsonb
) to authenticated;

grant execute on function public.sync_scan_batch(uuid, uuid, uuid, jsonb)
  to authenticated;

commit;


-- ==================== 004_verify_trail_scan_installation.sql ====================

-- ============================================================
-- TRAIL SCAN SYSTEM - INSTALLATION CHECK
-- Run after migrations 001, 002 and 003.
-- This script only reads system catalogs; it changes no data.
-- ============================================================

select
  table_name,
  case when to_regclass('public.' || table_name) is not null then 'OK' else 'MISSING' end as status
from (
  values
    ('profiles'),
    ('organizations'),
    ('organization_members'),
    ('events'),
    ('race_categories'),
    ('runners'),
    ('scan_points'),
    ('scan_point_categories'),
    ('staff_assignments'),
    ('devices'),
    ('scan_logs'),
    ('offline_sync_batches'),
    ('scan_exceptions'),
    ('race_results'),
    ('result_adjustments'),
    ('audit_logs')
) as required_tables(table_name)
order by table_name;

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
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
    'scan_logs',
    'offline_sync_batches',
    'scan_exceptions',
    'race_results',
    'result_adjustments',
    'audit_logs'
  )
order by c.relname;

select
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'create_organization',
    'set_actual_start_time',
    'get_server_clock',
    'record_scan',
    'sync_scan_batch'
  )
order by p.proname;

select
  tablename,
  policyname,
  cmd
from pg_policies
where schemaname = 'public'
order by tablename, policyname;


-- ==================== 005_user_access_dashboard_public_results.sql ====================

-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 005
-- User approval, role-based access, detailed dashboard,
-- and public runner result lookup by BIB.
-- Run after 001-004. Safe for an existing V4 installation.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) ACCOUNT APPROVAL AND PUBLIC RESULT SETTINGS
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists email text,
  add column if not exists approval_status text not null default 'PENDING',
  add column if not exists requested_org_code text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists last_login_at timestamptz;

alter table public.organization_members drop constraint if exists organization_members_role_code_check;
alter table public.organization_members add constraint organization_members_role_code_check
  check (role_code in (
    'OWNER','ORG_ADMIN','EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','STAFF'
  ));

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('PENDING','APPROVED','REJECTED','SUSPENDED'));

alter table public.events
  add column if not exists public_results_enabled boolean not null default true,
  add column if not exists public_results_mode text not null default 'LIVE';

alter table public.events drop constraint if exists events_public_results_mode_check;
alter table public.events add constraint events_public_results_mode_check
  check (public_results_mode in ('LIVE','FINAL_ONLY','HIDDEN'));

-- Existing operational accounts stay usable after migration.
update public.profiles p
set approval_status = 'APPROVED',
    is_active = true,
    approved_at = coalesce(approved_at, now())
where p.platform_role = 'SUPER_ADMIN'
   or exists (
      select 1 from public.organization_members om
      where om.user_id = p.id and om.status = 'ACTIVE'
   );

-- New signup always waits for an administrator.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id, display_name, email, requested_org_code,
    approval_status, is_active
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'requested_org_code'), ''),
    'PENDING',
    false
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    requested_org_code = excluded.requested_org_code,
    updated_at = now();
  return new;
end;
$$;

-- Backfill email for older users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- ------------------------------------------------------------
-- 2) EVENT-SPECIFIC USER ASSIGNMENTS
-- ------------------------------------------------------------

create table if not exists public.event_user_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null check (role_code in (
    'EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','SCAN_SUPERVISOR'
  )),
  can_manage_categories boolean not null default false,
  can_manage_points boolean not null default false,
  can_manage_runners boolean not null default false,
  can_manage_staff boolean not null default false,
  can_manage_devices boolean not null default false,
  can_manage_results boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create index if not exists idx_event_user_assignments_user
  on public.event_user_assignments(user_id, is_active, event_id);

alter table public.event_user_assignments enable row level security;

drop trigger if exists trg_event_user_assignments_updated_at on public.event_user_assignments;
create trigger trg_event_user_assignments_updated_at
before update on public.event_user_assignments
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3) APPROVAL-AWARE ACCESS HELPERS
-- ------------------------------------------------------------

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approval_status = 'APPROVED'
      and p.is_active = true
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role = 'SUPER_ADMIN'
      and p.approval_status = 'APPROVED'
      and p.is_active = true
  );
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'ACTIVE'
    )
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
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'ACTIVE'
        and om.role_code = any(p_roles)
    )
  );
$$;

create or replace function public.has_event_assignment(
  p_event_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.event_user_assignments eua
      where eua.event_id = p_event_id
        and eua.user_id = auth.uid()
        and eua.is_active = true
        and (p_roles is null or eua.role_code = any(p_roles))
    )
  );
$$;

create or replace function public.can_view_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and (
          public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
          or public.has_event_assignment(e.id, null)
          or exists (
            select 1 from public.staff_assignments sa
            where sa.event_id = e.id
              and sa.user_id = auth.uid()
              and sa.is_active = true
              and (sa.valid_from is null or sa.valid_from <= now())
              and (sa.valid_until is null or sa.valid_until >= now())
          )
        )
    )
  );
$$;

create or replace function public.can_view_dashboard(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id=p_event_id and (
        public.has_org_role(e.organization_id,array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id,array['EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','SCAN_SUPERVISOR'])
        or exists (
          select 1 from public.staff_assignments sa
          where sa.event_id=e.id and sa.user_id=auth.uid()
            and sa.is_active=true and sa.role_code='SCAN_SUPERVISOR'
            and (sa.valid_from is null or sa.valid_from<=now())
            and (sa.valid_until is null or sa.valid_until>=now())
        )
      )
    )
  );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id = p_event_id and (
        public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id, array['EVENT_ADMIN','RACE_DIRECTOR'])
      )
    )
  );
$$;

create or replace function public.can_manage_results(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id = p_event_id and (
        public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id, array['EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN'])
      )
    )
  );
$$;

create or replace function public.can_manage_org_staff(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and (
      public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
      or exists (
        select 1 from public.event_user_assignments eua
        where eua.organization_id=p_organization_id
          and eua.user_id=auth.uid()
          and eua.is_active=true
          and eua.role_code in ('EVENT_ADMIN','RACE_DIRECTOR')
      )
    )
  );
$$;

create or replace function public.can_scan_point(p_scan_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1
      from public.scan_points sp
      where sp.id = p_scan_point_id and (
        public.has_org_role(sp.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(sp.event_id, array['EVENT_ADMIN','RACE_DIRECTOR','SCAN_SUPERVISOR'])
        or exists (
          select 1 from public.staff_assignments sa
          where sa.scan_point_id = sp.id
            and sa.user_id = auth.uid()
            and sa.is_active = true
            and (sa.valid_from is null or sa.valid_from <= now())
            and (sa.valid_until is null or sa.valid_until >= now())
        )
      )
    )
  );
$$;

-- Only an approved platform administrator can create an organization.
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_timezone text default 'Asia/Bangkok'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;

  insert into public.organizations(name, slug, timezone, created_by)
  values(trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_timezone),''),'Asia/Bangkok'), auth.uid())
  returning id into v_org_id;

  insert into public.organization_members(organization_id,user_id,role_code,status,created_by)
  values(v_org_id,auth.uid(),'OWNER','ACTIVE',auth.uid())
  on conflict (organization_id,user_id) do update
  set role_code='OWNER',status='ACTIVE',updated_at=now();

  return v_org_id;
end;
$$;

-- ------------------------------------------------------------
-- 4) FIRST ADMIN BOOTSTRAP AND ACCESS CONTEXT
-- ------------------------------------------------------------

create or replace function public.can_bootstrap_first_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where platform_role='SUPER_ADMIN'
        and approval_status='APPROVED'
        and is_active=true
    );
$$;

create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('trail_scan_first_admin'));
  if not public.can_bootstrap_first_admin() then raise exception 'ADMIN_ALREADY_EXISTS'; end if;

  update public.profiles
  set platform_role='SUPER_ADMIN', approval_status='APPROVED', is_active=true,
      approved_by=auth.uid(), approved_at=now(), rejected_reason=null, updated_at=now()
  where id=auth.uid();
  return true;
end;
$$;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb;
  v_memberships jsonb;
  v_event_assignments jsonb;
  v_scan_assignments jsonb;
  v_pages jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select to_jsonb(p) into v_profile
  from public.profiles p where p.id=auth.uid();

  select coalesce(jsonb_agg(to_jsonb(x) order by x.organization_name),'[]'::jsonb)
  into v_memberships
  from (
    select om.id,om.organization_id,o.name organization_name,o.slug organization_slug,
           om.role_code,om.status
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.status='ACTIVE'
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_name),'[]'::jsonb)
  into v_event_assignments
  from (
    select eua.id,eua.organization_id,eua.event_id,e.name event_name,e.event_code,
           eua.role_code,eua.can_manage_categories,eua.can_manage_points,
           eua.can_manage_runners,eua.can_manage_staff,eua.can_manage_devices,
           eua.can_manage_results,eua.is_active
    from public.event_user_assignments eua
    join public.events e on e.id=eua.event_id
    where eua.user_id=auth.uid() and eua.is_active=true
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_name,x.display_order),'[]'::jsonb)
  into v_scan_assignments
  from (
    select sa.id,sa.organization_id,sa.event_id,e.name event_name,
           sa.scan_point_id,sp.name scan_point_name,sp.code scan_point_code,
           sp.point_type,sp.display_order,sa.role_code,sa.can_manual_entry,
           sa.can_override_warning,sa.is_active
    from public.staff_assignments sa
    join public.events e on e.id=sa.event_id
    left join public.scan_points sp on sp.id=sa.scan_point_id
    where sa.user_id=auth.uid() and sa.is_active=true
      and (sa.valid_from is null or sa.valid_from<=now())
      and (sa.valid_until is null or sa.valid_until>=now())
  ) x;

  with pages(page_code) as (
    select unnest(case
      when public.is_platform_admin() or exists (
        select 1 from public.organization_members om
        where om.user_id=auth.uid() and om.status='ACTIVE'
          and om.role_code in ('OWNER','ORG_ADMIN')
      ) then array['dashboard','organizations','users','events','categories','points','runners','bib','staff','devices','results','scanner']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code in ('EVENT_ADMIN','RACE_DIRECTOR')
      ) then array['dashboard','events','categories','points','runners','bib','staff','devices','results','scanner']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code in ('RESULT_ADMIN','VIEWER')
      ) then array['dashboard','results']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code='SCAN_SUPERVISOR'
      ) or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id=auth.uid() and sa.is_active=true
          and sa.role_code='SCAN_SUPERVISOR'
          and (sa.valid_from is null or sa.valid_from<=now())
          and (sa.valid_until is null or sa.valid_until>=now())
      ) then array['dashboard','results','scanner']
      else array[]::text[] end)
    union
    select 'scanner' where exists(
      select 1 from public.staff_assignments sa
      where sa.user_id=auth.uid() and sa.is_active=true
        and sa.role_code in ('START_STAFF','CP_STAFF','FINISH_STAFF','SCAN_VIEWER')
        and (sa.valid_from is null or sa.valid_from<=now())
        and (sa.valid_until is null or sa.valid_until>=now())
    )
  )
  select coalesce(jsonb_agg(page_code order by page_code),'[]'::jsonb)
  into v_pages from (select distinct page_code from pages) q;

  return jsonb_build_object(
    'profile',coalesce(v_profile,'{}'::jsonb),
    'memberships',v_memberships,
    'event_assignments',v_event_assignments,
    'scan_assignments',v_scan_assignments,
    'pages',v_pages
  );
end;
$$;

-- ------------------------------------------------------------
-- 5) ADMIN USER MANAGEMENT RPC
-- ------------------------------------------------------------

create or replace function public.admin_list_users(p_organization_id uuid)
returns table(
  user_id uuid,
  display_name text,
  email text,
  approval_status text,
  requested_org_code text,
  platform_role text,
  profile_active boolean,
  membership_id uuid,
  member_role text,
  membership_status text,
  event_count bigint,
  scan_point_count bigint,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;

  return query
  select p.id,p.display_name,p.email,p.approval_status,p.requested_org_code,
         p.platform_role,p.is_active,
         om.id,om.role_code,om.status,
         (select count(*) from public.event_user_assignments eua
          where eua.user_id=p.id and eua.organization_id=p_organization_id and eua.is_active=true),
         (select count(*) from public.staff_assignments sa
          where sa.user_id=p.id and sa.organization_id=p_organization_id and sa.is_active=true),
         p.approved_at
  from public.profiles p
  left join public.organization_members om
    on om.user_id=p.id and om.organization_id=p_organization_id
  left join public.organizations o on o.id=p_organization_id
  where om.id is not null
     or public.is_platform_admin()
     or lower(coalesce(p.requested_org_code,'')) in (lower(coalesce(o.slug,'')), lower(coalesce(o.name,'')))
  order by
    case p.approval_status when 'PENDING' then 0 when 'APPROVED' then 1 else 2 end,
    p.created_at desc;
end;
$$;

create or replace function public.admin_save_user_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_member_role text,
  p_event_ids uuid[] default array[]::uuid[],
  p_scan_point_ids uuid[] default array[]::uuid[],
  p_scan_role text default null,
  p_can_manual_entry boolean default false,
  p_can_override_warning boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_role text;
  v_point record;
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;

  if p_member_role not in ('OWNER','ORG_ADMIN','EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','STAFF') then
    raise exception 'INVALID_MEMBER_ROLE';
  end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if p_member_role='OWNER'
     and not (public.is_platform_admin() or public.has_org_role(p_organization_id,array['OWNER'])) then
    raise exception 'OWNER_PERMISSION_REQUIRED';
  end if;

  if p_member_role in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER')
     and coalesce(array_length(p_event_ids,1),0)=0 then
    raise exception 'EVENT_ASSIGNMENT_REQUIRED';
  end if;

  if p_member_role='STAFF'
     and (p_scan_role is null or coalesce(array_length(p_scan_point_ids,1),0)=0) then
    raise exception 'SCAN_ASSIGNMENT_REQUIRED';
  end if;

  if p_scan_role is not null and coalesce(array_length(p_scan_point_ids,1),0)=0 then
    raise exception 'SCAN_POINT_REQUIRED';
  end if;

  if p_member_role<>'OWNER'
     and exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_DEMOTED';
  end if;

  update public.profiles
  set approval_status='APPROVED',is_active=true,approved_by=auth.uid(),
      approved_at=now(),rejected_reason=null,updated_at=now()
  where id=p_user_id;

  insert into public.organization_members(
    organization_id,user_id,role_code,status,created_by
  ) values (
    p_organization_id,p_user_id,p_member_role,'ACTIVE',auth.uid()
  )
  on conflict(organization_id,user_id) do update
  set role_code=excluded.role_code,status='ACTIVE',updated_at=now();

  delete from public.event_user_assignments
  where organization_id=p_organization_id and user_id=p_user_id;

  if p_member_role not in ('OWNER','ORG_ADMIN','STAFF') then
    v_event_role := p_member_role;
    if v_event_role not in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER') then
      v_event_role := 'VIEWER';
    end if;

    insert into public.event_user_assignments(
      organization_id,event_id,user_id,role_code,
      can_manage_categories,can_manage_points,can_manage_runners,
      can_manage_staff,can_manage_devices,can_manage_results,
      is_active,created_by
    )
    select e.organization_id,e.id,p_user_id,v_event_role,
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN'),
      true,auth.uid()
    from public.events e
    where e.organization_id=p_organization_id and e.id=any(coalesce(p_event_ids,array[]::uuid[]));
  end if;

  delete from public.staff_assignments
  where organization_id=p_organization_id and user_id=p_user_id;

  if p_scan_role is not null and p_scan_role in (
    'SCAN_SUPERVISOR','START_STAFF','CP_STAFF','FINISH_STAFF','SCAN_VIEWER'
  ) then
    for v_point in
      select sp.* from public.scan_points sp
      where sp.organization_id=p_organization_id
        and sp.id=any(coalesce(p_scan_point_ids,array[]::uuid[]))
    loop
      if (p_scan_role='START_STAFF' and v_point.point_type<>'START')
         or (p_scan_role='CP_STAFF' and v_point.point_type<>'CHECKPOINT')
         or (p_scan_role='FINISH_STAFF' and v_point.point_type<>'FINISH') then
        raise exception 'SCAN_ROLE_POINT_TYPE_MISMATCH: % cannot use point % (%)',
          p_scan_role,v_point.code,v_point.point_type;
      end if;

      insert into public.staff_assignments(
        organization_id,event_id,user_id,scan_point_id,role_code,
        can_manual_entry,can_override_warning,is_active,created_by
      ) values (
        p_organization_id,v_point.event_id,p_user_id,v_point.id,p_scan_role,
        p_can_manual_entry,p_can_override_warning,true,auth.uid()
      );
    end loop;
  end if;

  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,auth.uid(),'SAVE_USER_ACCESS','PROFILE',p_user_id,
         jsonb_build_object('member_role',p_member_role,'event_ids',p_event_ids,
                            'scan_point_ids',p_scan_point_ids,'scan_role',p_scan_role));

  return jsonb_build_object('ok',true,'user_id',p_user_id);
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_organization_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_status not in ('PENDING','APPROVED','REJECTED','SUSPENDED') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_user_id=auth.uid() and p_status<>'APPROVED' then
    raise exception 'CANNOT_DISABLE_SELF';
  end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if p_status<>'APPROVED'
     and exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_DISABLED';
  end if;

  update public.profiles
  set approval_status=p_status,
      is_active=(p_status='APPROVED'),
      rejected_reason=case when p_status in ('REJECTED','SUSPENDED') then p_reason else null end,
      approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,
      approved_at=case when p_status='APPROVED' then now() else approved_at end,
      updated_at=now()
  where id=p_user_id;

  if p_status = 'APPROVED' then
    update public.organization_members set status='ACTIVE',updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.event_user_assignments set is_active=true,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.staff_assignments set is_active=true,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
  else
    update public.organization_members set status='DISABLED',updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.event_user_assignments set is_active=false,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.staff_assignments set is_active=false,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.admin_remove_user_from_org(
  p_user_id uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_user_id=auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_REMOVED';
  end if;

  delete from public.staff_assignments where organization_id=p_organization_id and user_id=p_user_id;
  delete from public.event_user_assignments where organization_id=p_organization_id and user_id=p_user_id;
  delete from public.organization_members where organization_id=p_organization_id and user_id=p_user_id;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 6) DETAILED ADMIN DASHBOARD
-- ------------------------------------------------------------

create or replace function public.admin_dashboard_runners(p_event_id uuid)
returns table(
  runner_id uuid,
  bib_number text,
  first_name text,
  last_name text,
  display_name text,
  category_id uuid,
  category_code text,
  category_name text,
  age_group text,
  runner_status text,
  check_in_at timestamptz,
  start_at timestamptz,
  last_point_name text,
  last_point_code text,
  last_point_distance_km numeric,
  last_scan_at timestamptz,
  finish_at timestamptz,
  elapsed_seconds bigint,
  missing_required_points integer,
  result_status text,
  overall_finish_order bigint,
  category_finish_order bigint,
  age_group_finish_order bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_view_dashboard(p_event_id) then raise exception 'ACCESS_DENIED'; end if;

  return query
  with accepted as (
    select sl.* from public.scan_logs sl
    where sl.event_id=p_event_id and sl.record_status='ACCEPTED'
  ), scan_agg as (
    select a.runner_id,
      min(a.estimated_server_time) filter(where a.scan_action='START_CHECKIN') check_in_at,
      min(a.estimated_server_time) filter(where a.scan_action='START') start_scan_at,
      min(a.estimated_server_time) filter(where a.scan_action='FINISH') finish_scan_at,
      max(a.estimated_server_time) last_scan_at
    from accepted a group by a.runner_id
  ), latest as (
    select distinct on (a.runner_id)
      a.runner_id,a.estimated_server_time,sp.name point_name,sp.code point_code,sp.distance_km
    from accepted a
    join public.scan_points sp on sp.id=a.scan_point_id
    order by a.runner_id,a.estimated_server_time desc,a.id desc
  ), base as (
    select r.id runner_id,r.bib_number,r.first_name,r.last_name,r.display_name,
      rc.id category_id,rc.code category_code,rc.name category_name,r.age_group,
      r.status runner_status,sa.check_in_at,
      coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at) start_at,
      l.point_name last_point_name,l.point_code last_point_code,l.distance_km last_point_distance_km,
      sa.last_scan_at,coalesce(rr.finish_at,sa.finish_scan_at) finish_at,
      coalesce(
        rr.elapsed_seconds,
        extract(epoch from (
          coalesce(rr.finish_at,sa.finish_scan_at)
          - coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at)
        ))::bigint
      ) elapsed_seconds,
      coalesce(rr.missing_required_points,0) missing_required_points,
      coalesce(rr.result_status,'PENDING') result_status
    from public.runners r
    join public.race_categories rc on rc.id=r.race_category_id
    left join public.race_results rr on rr.event_id=r.event_id and rr.runner_id=r.id
    left join scan_agg sa on sa.runner_id=r.id
    left join latest l on l.runner_id=r.id
    where r.event_id=p_event_id
  )
  select b.*,
    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end overall_finish_order,

    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(partition by b.category_id order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end category_finish_order,

    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(partition by b.category_id,coalesce(b.age_group,'ไม่ระบุ') order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end age_group_finish_order
  from base b
  order by (b.finish_at is null),b.finish_at,b.bib_number;
end;
$$;

create or replace function public.admin_runner_detail(p_runner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_event uuid;
  v_row jsonb;
  v_scans jsonb;
begin
  select event_id into v_event from public.runners where id=p_runner_id;
  if v_event is null or not public.can_view_dashboard(v_event) then raise exception 'ACCESS_DENIED'; end if;

  select to_jsonb(x) into v_row
  from public.admin_dashboard_runners(v_event) x where x.runner_id=p_runner_id;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.scan_time),'[]'::jsonb)
  into v_scans
  from (
    select sl.id,sl.estimated_server_time scan_time,sl.scan_action,sl.record_status,
           sl.is_offline,sp.code point_code,sp.name point_name,sp.point_type,sp.distance_km,
           sl.source,sl.notes
    from public.scan_logs sl
    join public.scan_points sp on sp.id=sl.scan_point_id
    where sl.runner_id=p_runner_id
    order by sl.estimated_server_time,sl.id
  ) q;

  return jsonb_build_object('runner',v_row,'scans',v_scans);
end;
$$;

-- ------------------------------------------------------------
-- 7) PUBLIC RESULT LOOKUP BY EVENT + BIB
-- ------------------------------------------------------------

create or replace function public.public_result_events()
returns table(
  event_id uuid,
  event_name text,
  event_code text,
  race_date date,
  location_name text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,e.name,e.event_code,e.race_date,e.location_name,e.status
  from public.events e
  where e.public_results_enabled=true
    and (e.public_results_mode='LIVE' or (e.public_results_mode='FINAL_ONLY' and e.status='FINISHED'))
    and e.status in ('ACTIVE','FINISHED')
  order by e.race_date desc,e.name;
$$;

create or replace function public.public_runner_result(
  p_event_id uuid,
  p_bib_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_runner uuid;
  v_result jsonb;
  v_scans jsonb;
begin
  select * into v_event from public.events
  where id=p_event_id and public_results_enabled=true
    and (public_results_mode='LIVE' or (public_results_mode='FINAL_ONLY' and status='FINISHED'))
    and status in ('ACTIVE','FINISHED');
  if v_event.id is null then return null; end if;

  select id into v_runner from public.runners
  where event_id=p_event_id and upper(bib_number)=upper(trim(p_bib_number));
  if v_runner is null then return null; end if;

  with accepted as (
    select sl.* from public.scan_logs sl
    where sl.event_id=p_event_id and sl.record_status='ACCEPTED'
  ), scan_agg as (
    select a.runner_id,
      min(a.estimated_server_time) filter(where a.scan_action='START_CHECKIN') check_in_at,
      min(a.estimated_server_time) filter(where a.scan_action='START') start_scan_at,
      min(a.estimated_server_time) filter(where a.scan_action='FINISH') finish_scan_at,
      max(a.estimated_server_time) last_scan_at
    from accepted a group by a.runner_id
  ), base as (
    select r.id runner_id,r.bib_number,r.first_name,r.last_name,r.display_name,
      rc.id category_id,rc.code category_code,rc.name category_name,rc.distance_km,
      r.age_group,r.status runner_status,sa.check_in_at,
      coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at) start_at,
      coalesce(rr.finish_at,sa.finish_scan_at) finish_at,
      coalesce(
        rr.elapsed_seconds,
        extract(epoch from (
          coalesce(rr.finish_at,sa.finish_scan_at)
          - coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at)
        ))::bigint
      ) elapsed_seconds,
      coalesce(rr.missing_required_points,0) missing_required_points,
      coalesce(rr.result_status,'PENDING') result_status
    from public.runners r
    join public.race_categories rc on rc.id=r.race_category_id
    left join public.race_results rr on rr.event_id=r.event_id and rr.runner_id=r.id
    left join scan_agg sa on sa.runner_id=r.id
    where r.event_id=p_event_id
  ), ranked as (
    select b.*,
      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end overall_finish_order,

      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(partition by b.category_id order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end category_finish_order,

      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(partition by b.category_id,coalesce(b.age_group,'ไม่ระบุ') order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end age_group_finish_order
    from base b
  )
  select jsonb_build_object(
    'event',jsonb_build_object('id',v_event.id,'name',v_event.name,'event_code',v_event.event_code,
      'race_date',v_event.race_date,'location_name',v_event.location_name,'status',v_event.status,
      'results_mode',v_event.public_results_mode),
    'runner',to_jsonb(r)
  ) into v_result
  from ranked r where r.runner_id=v_runner;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.scan_time),'[]'::jsonb)
  into v_scans
  from (
    select sl.estimated_server_time scan_time,sl.scan_action,sl.record_status,
      sp.code point_code,sp.name point_name,sp.point_type,sp.distance_km
    from public.scan_logs sl
    join public.scan_points sp on sp.id=sl.scan_point_id
    where sl.runner_id=v_runner and sl.record_status='ACCEPTED'
    order by sl.estimated_server_time,sl.id
  ) q;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('checkpoints',v_scans);
end;
$$;

-- ------------------------------------------------------------
-- 8) RLS POLICIES FOR NEW TABLE AND POINT-LEVEL VISIBILITY
-- ------------------------------------------------------------

-- Profiles: ordinary staff see only their own profile; managers can see members of organizations they manage.
drop policy if exists profiles_select_self_or_platform_admin on public.profiles;
drop policy if exists profiles_select_access on public.profiles;
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

-- Organization membership list is not exposed to ordinary scanner staff.
drop policy if exists organization_members_select_members on public.organization_members;
drop policy if exists organization_members_select_access on public.organization_members;
create policy organization_members_select_access on public.organization_members
for select to authenticated
using (
  user_id=auth.uid()
  or public.can_manage_org_staff(organization_id)
);

-- Only organization-level administrators can create a new Event.
drop policy if exists events_insert_org_admins on public.events;
create policy events_insert_org_admins on public.events
for insert to authenticated
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

-- Result adjustments are visible only to dashboard/result roles.
drop policy if exists result_adjustments_select_event_access on public.result_adjustments;
create policy result_adjustments_select_event_access on public.result_adjustments
for select to authenticated
using (public.can_view_dashboard(event_id));

-- Audit logs are organization-wide only for organization admins; Event managers see assigned Event logs.
drop policy if exists audit_logs_select_admins on public.audit_logs;
drop policy if exists audit_logs_select_scoped on public.audit_logs;
create policy audit_logs_select_scoped on public.audit_logs
for select to authenticated
using (
  public.is_platform_admin()
  or (organization_id is not null and public.has_org_role(organization_id,array['OWNER','ORG_ADMIN']))
  or (event_id is not null and public.can_manage_event(event_id))
);

drop policy if exists event_user_assignments_select on public.event_user_assignments;
create policy event_user_assignments_select on public.event_user_assignments
for select to authenticated
using (
  user_id=auth.uid()
  or public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
  or public.can_manage_event(event_id)
);

drop policy if exists event_user_assignments_insert on public.event_user_assignments;
create policy event_user_assignments_insert on public.event_user_assignments
for insert to authenticated
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

drop policy if exists event_user_assignments_update on public.event_user_assignments;
create policy event_user_assignments_update on public.event_user_assignments
for update to authenticated
using (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
)
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

drop policy if exists event_user_assignments_delete on public.event_user_assignments;
create policy event_user_assignments_delete on public.event_user_assignments
for delete to authenticated
using (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

-- Assigned scanner staff may read only their own point; managers may read every point.
drop policy if exists scan_points_select_event_access on public.scan_points;
create policy scan_points_select_event_access on public.scan_points
for select to authenticated
using (
  public.is_platform_admin()
  or public.can_manage_event(event_id)
  or public.can_manage_results(event_id)
  or public.has_event_assignment(event_id,array['VIEWER','SCAN_SUPERVISOR'])
  or public.can_scan_point(id)
);

-- Devices are visible to managers, the assigned user, or staff assigned to the same point.
drop policy if exists devices_select_event_access on public.devices;
create policy devices_select_event_access on public.devices
for select to authenticated
using (
  public.is_platform_admin()
  or public.can_manage_event(event_id)
  or assigned_user_id=auth.uid()
  or (scan_point_id is not null and public.can_scan_point(scan_point_id))
);

-- Basic point staff may read scan records only at an assigned point.
drop policy if exists scan_logs_select_event_access on public.scan_logs;
create policy scan_logs_select_event_access on public.scan_logs
for select to authenticated
using (
  public.can_view_dashboard(event_id)
  or public.can_scan_point(scan_point_id)
);

-- Results are visible only to dashboard/result roles, not ordinary CP staff.
drop policy if exists race_results_select_event_access on public.race_results;
create policy race_results_select_event_access on public.race_results
for select to authenticated
using (public.can_view_dashboard(event_id));

-- Exceptions follow dashboard or assigned-point scope.
drop policy if exists scan_exceptions_select_event_access on public.scan_exceptions;
create policy scan_exceptions_select_event_access on public.scan_exceptions
for select to authenticated
using (
  public.can_view_dashboard(event_id)
  or (scan_point_id is not null and public.can_scan_point(scan_point_id))
);

-- ------------------------------------------------------------
-- 9) PRIVILEGES
-- ------------------------------------------------------------

revoke all on function public.is_approved_user() from public;
revoke all on function public.has_event_assignment(uuid,text[]) from public;
revoke all on function public.can_view_dashboard(uuid) from public;
revoke all on function public.can_manage_org_staff(uuid) from public;
revoke all on function public.can_bootstrap_first_admin() from public;
revoke all on function public.bootstrap_first_admin() from public;
revoke all on function public.get_my_access_context() from public;
revoke all on function public.admin_list_users(uuid) from public;
revoke all on function public.admin_save_user_access(uuid,uuid,text,uuid[],uuid[],text,boolean,boolean) from public;
revoke all on function public.admin_set_user_status(uuid,uuid,text,text) from public;
revoke all on function public.admin_remove_user_from_org(uuid,uuid) from public;
revoke all on function public.admin_dashboard_runners(uuid) from public;
revoke all on function public.admin_runner_detail(uuid) from public;
revoke all on function public.public_result_events() from public;
revoke all on function public.public_runner_result(uuid,text) from public;

grant execute on function public.is_approved_user() to authenticated;
grant execute on function public.has_event_assignment(uuid,text[]) to authenticated;
grant execute on function public.can_view_dashboard(uuid) to authenticated;
grant execute on function public.can_manage_org_staff(uuid) to authenticated;
grant execute on function public.can_bootstrap_first_admin() to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.get_my_access_context() to authenticated;
grant execute on function public.admin_list_users(uuid) to authenticated;
grant execute on function public.admin_save_user_access(uuid,uuid,text,uuid[],uuid[],text,boolean,boolean) to authenticated;
grant execute on function public.admin_set_user_status(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_remove_user_from_org(uuid,uuid) to authenticated;
grant execute on function public.admin_dashboard_runners(uuid) to authenticated;
grant execute on function public.admin_runner_detail(uuid) to authenticated;
grant execute on function public.public_result_events() to anon,authenticated;
grant execute on function public.public_runner_result(uuid,text) to anon,authenticated;

grant select,insert,update,delete on public.event_user_assignments to authenticated;

commit;


-- ==================== 006_no_email_confirmation_signup_hardening.sql ====================

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
