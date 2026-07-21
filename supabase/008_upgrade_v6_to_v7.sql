-- ============================================================
-- TRAIL SCAN V7
-- Audit triggers for direct CRUD from static website
-- Run once when upgrading from V6
-- ============================================================

begin;

create or replace function public.audit_direct_table_change()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_source jsonb;
  v_org_id uuid;
  v_event_id uuid;
  v_entity_id uuid;
begin
  if tg_op = 'INSERT' then
    v_old := null;
    v_new := to_jsonb(new);
    v_source := v_new;
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_source := v_new;
  else
    v_old := to_jsonb(old);
    v_new := null;
    v_source := v_old;
  end if;

  v_org_id := nullif(v_source ->> 'organization_id', '')::uuid;
  v_event_id := nullif(v_source ->> 'event_id', '')::uuid;
  v_entity_id := nullif(v_source ->> 'id', '')::uuid;

  -- organizations does not have organization_id; its own id is the scope.
  if tg_table_name = 'organizations' then
    v_org_id := v_entity_id;
  end if;

  insert into public.audit_logs(
    organization_id,
    event_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    before_data,
    after_data,
    user_agent
  )
  values(
    v_org_id,
    v_event_id,
    auth.uid(),
    tg_op,
    tg_table_name,
    v_entity_id,
    v_old,
    v_new,
    'TRAIL_SCAN_WEB_V7'
  );

  return coalesce(new, old);
end;
$$;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'organizations',
    'events',
    'race_categories',
    'scan_points',
    'scan_point_categories',
    'runners',
    'staff_assignments',
    'devices'
  ]
  loop
    execute format(
      'drop trigger if exists audit_direct_change on public.%I',
      v_table
    );
    execute format(
      'create trigger audit_direct_change
       after insert or update or delete on public.%I
       for each row execute function public.audit_direct_table_change()',
      v_table
    );
  end loop;
end;
$$;

commit;

select
  event_object_table as table_name,
  trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name = 'audit_direct_change'
order by event_object_table;
