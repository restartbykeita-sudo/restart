-- ============================================================
-- TRAIL SCAN V7.2
-- PUBLIC RUNNER RESULT PORTAL - แยกจากระบบทีมงานโดยสมบูรณ์
-- ============================================================

begin;

create or replace function public.runner_portal_events()
returns table(
  event_id uuid,
  event_name text,
  event_code text,
  race_date date,
  location_name text,
  event_status text,
  results_mode text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id, e.name, e.event_code, e.race_date, e.location_name, e.status, e.public_results_mode
  from public.events e
  where e.public_results_enabled = true
    and e.status in ('ACTIVE','FINISHED')
    and (
      e.public_results_mode = 'LIVE'
      or (e.public_results_mode = 'FINAL_ONLY' and e.status = 'FINISHED')
    )
  order by e.race_date desc, e.name;
$$;

create or replace function public.runner_portal_categories(p_event_id uuid)
returns table(
  category_id uuid,
  category_code text,
  category_name text,
  distance_km numeric,
  sort_order integer
)
language sql
stable
security definer
set search_path = public
as $$
  select rc.id, rc.code, rc.name, rc.distance_km, rc.sort_order
  from public.race_categories rc
  join public.events e on e.id = rc.event_id
  where rc.event_id = p_event_id
    and rc.is_active = true
    and e.public_results_enabled = true
    and e.status in ('ACTIVE','FINISHED')
    and (
      e.public_results_mode = 'LIVE'
      or (e.public_results_mode = 'FINAL_ONLY' and e.status = 'FINISHED')
    )
  order by rc.sort_order, rc.name;
$$;

create or replace function public.runner_portal_leaderboard(
  p_event_id uuid,
  p_category_id uuid default null,
  p_limit integer default 200
)
returns table(
  overall_rank bigint,
  category_rank bigint,
  age_group_rank bigint,
  bib_number text,
  display_name text,
  gender_label text,
  category_id uuid,
  category_code text,
  category_name text,
  distance_km numeric,
  age_group text,
  finish_at timestamptz,
  elapsed_seconds bigint,
  result_status text
)
language sql
stable
security definer
set search_path = public
as $$
  with allowed_event as (
    select e.id
    from public.events e
    where e.id = p_event_id
      and e.public_results_enabled = true
      and e.status in ('ACTIVE','FINISHED')
      and (
        e.public_results_mode = 'LIVE'
        or (e.public_results_mode = 'FINAL_ONLY' and e.status = 'FINISHED')
      )
  ), accepted as (
    select sl.*
    from public.scan_logs sl
    where sl.event_id = p_event_id
      and sl.record_status = 'ACCEPTED'
  ), scan_agg as (
    select a.runner_id,
      min(a.estimated_server_time) filter(where a.scan_action = 'START') as start_scan_at,
      min(a.estimated_server_time) filter(where a.scan_action = 'FINISH') as finish_scan_at
    from accepted a
    group by a.runner_id
  ), base as (
    select
      r.id as runner_id,
      r.bib_number,
      coalesce(nullif(trim(r.display_name),''), trim(concat_ws(' ',r.first_name,r.last_name))) as display_name,
      case r.gender when 'MALE' then 'ชาย' when 'FEMALE' then 'หญิง' when 'OTHER' then 'อื่น' else '' end as gender_label,
      rc.id as category_id,
      rc.code as category_code,
      rc.name as category_name,
      rc.distance_km,
      coalesce(nullif(trim(r.age_group),''),'ไม่ระบุ') as age_group,
      coalesce(rr.finish_at, sa.finish_scan_at) as finish_at,
      coalesce(
        rr.elapsed_seconds,
        extract(epoch from (
          coalesce(rr.finish_at,sa.finish_scan_at)
          - coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at)
        ))::bigint
      ) as elapsed_seconds,
      coalesce(rr.result_status,'PENDING') as result_status
    from public.runners r
    join allowed_event ae on ae.id = r.event_id
    join public.race_categories rc on rc.id = r.race_category_id
    left join public.race_results rr on rr.event_id = r.event_id and rr.runner_id = r.id
    left join scan_agg sa on sa.runner_id = r.id
  ), finished as (
    select *
    from base
    where finish_at is not null
      and result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')
  ), ranked as (
    select f.*,
      row_number() over(order by f.finish_at, f.bib_number) as overall_rank,
      row_number() over(partition by f.category_id order by f.finish_at, f.bib_number) as category_rank,
      row_number() over(partition by f.category_id, f.age_group order by f.finish_at, f.bib_number) as age_group_rank
    from finished f
  )
  select
    r.overall_rank,
    r.category_rank,
    r.age_group_rank,
    r.bib_number,
    r.display_name,
    r.gender_label,
    r.category_id,
    r.category_code,
    r.category_name,
    r.distance_km,
    r.age_group,
    r.finish_at,
    r.elapsed_seconds,
    r.result_status
  from ranked r
  where p_category_id is null or r.category_id = p_category_id
  order by r.overall_rank
  limit greatest(1, least(coalesce(p_limit,200),500));
$$;

create or replace function public.runner_portal_result(
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
  v_raw jsonb;
  v_runner jsonb;
  v_event jsonb;
  v_checkpoints jsonb;
begin
  v_raw := public.public_runner_result(p_event_id, p_bib_number);
  if v_raw is null or v_raw -> 'runner' is null then
    return null;
  end if;

  v_event := jsonb_build_object(
    'name', v_raw #>> '{event,name}',
    'event_code', v_raw #>> '{event,event_code}',
    'race_date', v_raw #>> '{event,race_date}',
    'location_name', v_raw #>> '{event,location_name}',
    'status', v_raw #>> '{event,status}',
    'results_mode', v_raw #>> '{event,results_mode}'
  );

  v_runner := jsonb_build_object(
    'bib_number', v_raw #>> '{runner,bib_number}',
    'display_name', coalesce(
      nullif(v_raw #>> '{runner,display_name}',''),
      trim(concat_ws(' ',v_raw #>> '{runner,first_name}',v_raw #>> '{runner,last_name}'))
    ),
    'category_code', v_raw #>> '{runner,category_code}',
    'category_name', v_raw #>> '{runner,category_name}',
    'distance_km', v_raw #> '{runner,distance_km}',
    'age_group', v_raw #>> '{runner,age_group}',
    'runner_status', v_raw #>> '{runner,runner_status}',
    'result_status', v_raw #>> '{runner,result_status}',
    'start_at', v_raw #>> '{runner,start_at}',
    'finish_at', v_raw #>> '{runner,finish_at}',
    'elapsed_seconds', v_raw #> '{runner,elapsed_seconds}',
    'overall_rank', v_raw #> '{runner,overall_finish_order}',
    'category_rank', v_raw #> '{runner,category_finish_order}',
    'age_group_rank', v_raw #> '{runner,age_group_finish_order}'
  );

  select coalesce(jsonb_agg(jsonb_build_object(
    'scan_time', item ->> 'scan_time',
    'point_code', item ->> 'point_code',
    'point_name', item ->> 'point_name',
    'point_type', item ->> 'point_type',
    'distance_km', item -> 'distance_km'
  )),'[]'::jsonb)
  into v_checkpoints
  from jsonb_array_elements(coalesce(v_raw -> 'checkpoints','[]'::jsonb)) as checkpoint(item);

  return jsonb_build_object('event',v_event,'runner',v_runner,'checkpoints',v_checkpoints);
end;
$$;

-- ปิด RPC รุ่นเดิมสำหรับ browser สาธารณะ เพื่อลดข้อมูลภายในที่ไม่จำเป็น
revoke execute on function public.public_runner_result(uuid,text) from anon, authenticated;

revoke all on function public.runner_portal_events() from public;
revoke all on function public.runner_portal_categories(uuid) from public;
revoke all on function public.runner_portal_leaderboard(uuid,uuid,integer) from public;
revoke all on function public.runner_portal_result(uuid,text) from public;

grant execute on function public.runner_portal_events() to anon, authenticated;
grant execute on function public.runner_portal_categories(uuid) to anon, authenticated;
grant execute on function public.runner_portal_leaderboard(uuid,uuid,integer) to anon, authenticated;
grant execute on function public.runner_portal_result(uuid,text) to anon, authenticated;

commit;

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name like 'runner_portal_%'
order by routine_name;
