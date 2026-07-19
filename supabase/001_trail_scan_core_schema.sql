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
