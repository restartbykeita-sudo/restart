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
