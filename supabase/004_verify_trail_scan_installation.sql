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
