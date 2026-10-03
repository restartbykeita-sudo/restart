-- RESTART Registration System - Member CRM + Loyalty Points
-- Snapshot: 2026-10-03
-- Depends on 005_multi_store_marketplace.sql.
-- Adds central member profiles, member-linked registrations, CRM, Event points,
-- and store points redemption with auditable ledger/refund behavior.

begin;

create table if not exists public.restart_member_profiles(
  user_id uuid primary key references auth.users(id) on delete cascade,
  member_code text not null unique default ('MEM-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  email text,
  title text,
  first_name text,
  last_name text,
  birth_date date,
  address text,
  phone text,
  blood_group text,
  emergency_contact_name text,
  emergency_phone text,
  emergency_relation text,
  points_balance integer not null default 0 check(points_balance>=0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restart_member_profiles_blood_group_check
    check(blood_group is null or blood_group in ('A','B','AB','O','UNKNOWN'))
);

create table if not exists public.restart_member_points_ledger(
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  points integer not null check(points<>0),
  transaction_type text not null check(transaction_type in (
    'EARN_REGISTRATION','REVERSE_REGISTRATION','REDEEM_STORE','REFUND_STORE','ADMIN_ADJUSTMENT'
  )),
  event_id uuid references public.restart_events(id) on delete set null,
  registration_id uuid references public.restart_registrations(id) on delete set null,
  store_order_id uuid references public.restart_store_orders(id) on delete set null,
  dedupe_key text unique,
  description text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.restart_events
  add column if not exists member_points_award integer not null default 0 check(member_points_award>=0);

alter table public.restart_registrations
  add column if not exists member_user_id uuid references auth.users(id) on delete set null,
  add column if not exists member_runner_index integer;

alter table public.restart_participants
  add column if not exists member_user_id uuid references auth.users(id) on delete set null,
  add column if not exists emergency_contact_name text;

alter table public.restart_store_orders
  add column if not exists member_user_id uuid references auth.users(id) on delete set null,
  add column if not exists points_redeemed integer not null default 0 check(points_redeemed>=0),
  add column if not exists points_discount_thb numeric not null default 0 check(points_discount_thb>=0);

alter table public.restart_stores
  add column if not exists points_redemption_enabled boolean not null default false,
  add column if not exists points_per_thb integer not null default 1 check(points_per_thb>=1),
  add column if not exists min_redeem_points integer not null default 0 check(min_redeem_points>=0),
  add column if not exists max_redeem_points_per_order integer check(max_redeem_points_per_order is null or max_redeem_points_per_order>=1);

create index if not exists restart_member_profiles_phone_idx on public.restart_member_profiles(phone);
create index if not exists restart_member_profiles_name_idx on public.restart_member_profiles(last_name,first_name);
create index if not exists restart_member_points_user_created_idx on public.restart_member_points_ledger(user_id,created_at desc);
create index if not exists restart_member_points_registration_idx on public.restart_member_points_ledger(registration_id);
create index if not exists restart_member_points_store_order_idx on public.restart_member_points_ledger(store_order_id);
create index if not exists restart_member_points_event_idx on public.restart_member_points_ledger(event_id);
create index if not exists restart_member_points_created_by_idx on public.restart_member_points_ledger(created_by);
create index if not exists restart_registrations_member_user_idx on public.restart_registrations(member_user_id,created_at desc);
create index if not exists restart_participants_member_user_idx on public.restart_participants(member_user_id);
create index if not exists restart_store_orders_member_user_idx on public.restart_store_orders(member_user_id,created_at desc);

alter table public.restart_member_profiles enable row level security;
alter table public.restart_member_points_ledger enable row level security;

drop policy if exists restart_member_profiles_own_select on public.restart_member_profiles;
create policy restart_member_profiles_own_select
on public.restart_member_profiles for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists restart_member_profiles_own_insert on public.restart_member_profiles;
create policy restart_member_profiles_own_insert
on public.restart_member_profiles for insert to authenticated
with check ((select auth.uid())=user_id);

drop policy if exists restart_member_profiles_own_update on public.restart_member_profiles;
create policy restart_member_profiles_own_update
on public.restart_member_profiles for update to authenticated
using ((select auth.uid())=user_id)
with check ((select auth.uid())=user_id);

drop policy if exists restart_member_profiles_admin_select on public.restart_member_profiles;
create policy restart_member_profiles_admin_select
on public.restart_member_profiles for select to authenticated
using ((select private.restart_is_admin()));

drop policy if exists restart_member_points_own_select on public.restart_member_points_ledger;
create policy restart_member_points_own_select
on public.restart_member_points_ledger for select to authenticated
using ((select auth.uid())=user_id);

drop policy if exists restart_member_points_admin_select on public.restart_member_points_ledger;
create policy restart_member_points_admin_select
on public.restart_member_points_ledger for select to authenticated
using ((select private.restart_is_admin()));

grant select on public.restart_member_profiles,public.restart_member_points_ledger to authenticated;
grant insert(user_id,email,title,first_name,last_name,birth_date,address,phone,blood_group,emergency_contact_name,emergency_phone,emergency_relation)
  on public.restart_member_profiles to authenticated;
grant update(email,title,first_name,last_name,birth_date,address,phone,blood_group,emergency_contact_name,emergency_phone,emergency_relation,updated_at)
  on public.restart_member_profiles to authenticated;

drop policy if exists restart_registrations_member_select on public.restart_registrations;
create policy restart_registrations_member_select
on public.restart_registrations for select to authenticated
using ((select auth.uid())=member_user_id);

drop policy if exists restart_participants_member_select on public.restart_participants;
create policy restart_participants_member_select
on public.restart_participants for select to authenticated
using (
  member_user_id=(select auth.uid())
  or exists(
    select 1 from public.restart_registrations r
    where r.id=registration_id and r.member_user_id=(select auth.uid())
  )
);

drop policy if exists restart_store_orders_member_select on public.restart_store_orders;
create policy restart_store_orders_member_select
on public.restart_store_orders for select to authenticated
using ((select auth.uid())=member_user_id);

drop policy if exists restart_store_order_items_member_select on public.restart_store_order_items;
create policy restart_store_order_items_member_select
on public.restart_store_order_items for select to authenticated
using (
  exists(
    select 1 from public.restart_store_orders o
    where o.id=order_id and o.member_user_id=(select auth.uid())
  )
);

update public.restart_events
set field_settings=jsonb_set(
  coalesce(field_settings,'{}'::jsonb),
  '{emergency_contact_name}',
  '{"enabled":true,"required":true}'::jsonb,
  true
);

alter table public.restart_events alter column field_settings set default
(
  '{"age":{"enabled":true,"required":false},
    "phone":{"enabled":true,"required":true},
    "title":{"enabled":true,"required":true},
    "gender":{"enabled":true,"required":false},
    "address":{"enabled":true,"required":true},
    "last_name":{"enabled":true,"required":true},
    "birth_date":{"enabled":true,"required":true},
    "first_name":{"enabled":true,"required":true},
    "shirt_size":{"enabled":true,"required":false},
    "blood_group":{"enabled":true,"required":false},
    "id_document":{"enabled":true,"required":true},
    "emergency_contact_name":{"enabled":true,"required":true},
    "emergency_phone":{"enabled":true,"required":true},
    "emergency_relation":{"enabled":true,"required":true}}'::jsonb
);

CREATE OR REPLACE FUNCTION private.restart_change_member_points(p_user_id uuid, p_points integer, p_transaction_type text, p_event_id uuid DEFAULT NULL::uuid, p_registration_id uuid DEFAULT NULL::uuid, p_store_order_id uuid DEFAULT NULL::uuid, p_dedupe_key text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_created_by uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
declare
  v_profile public.restart_member_profiles%rowtype;
  v_existing uuid;
  v_new_balance integer;
begin
  if p_user_id is null then raise exception 'MEMBER_USER_REQUIRED'; end if;
  if p_points=0 then raise exception 'POINTS_ZERO_NOT_ALLOWED'; end if;

  if p_dedupe_key is not null then
    select id into v_existing from public.restart_member_points_ledger where dedupe_key=p_dedupe_key;
    if found then
      select * into v_profile from public.restart_member_profiles where user_id=p_user_id;
      return jsonb_build_object('applied',false,'balance',coalesce(v_profile.points_balance,0));
    end if;
  end if;

  insert into public.restart_member_profiles(user_id)
  values(p_user_id)
  on conflict(user_id) do nothing;

  select * into v_profile
  from public.restart_member_profiles
  where user_id=p_user_id
  for update;

  v_new_balance:=v_profile.points_balance+p_points;
  if v_new_balance<0 then raise exception 'INSUFFICIENT_POINTS'; end if;

  insert into public.restart_member_points_ledger(
    user_id,points,transaction_type,event_id,registration_id,store_order_id,
    dedupe_key,description,created_by
  ) values(
    p_user_id,p_points,p_transaction_type,p_event_id,p_registration_id,p_store_order_id,
    p_dedupe_key,p_description,p_created_by
  );

  update public.restart_member_profiles
  set points_balance=v_new_balance,updated_at=now()
  where user_id=p_user_id;

  return jsonb_build_object('applied',true,'balance',v_new_balance);
end;
$function$;

CREATE OR REPLACE FUNCTION private.restart_refund_store_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
begin
  if new.status='CANCELLED'
     and old.status is distinct from 'CANCELLED'
     and new.member_user_id is not null
     and coalesce(new.points_redeemed,0)>0
     and exists(
       select 1 from public.restart_member_points_ledger
       where dedupe_key='STORE:'||new.id::text||':REDEEM'
     ) then
    perform private.restart_change_member_points(
      new.member_user_id,new.points_redeemed,'REFUND_STORE',new.event_id,null,new.id,
      'STORE:'||new.id::text||':REFUND',
      'คืนคะแนนจากการยกเลิกออเดอร์ '||new.order_code,
      null
    );
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.restart_sync_registration_member()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
declare
  p public.restart_participants%rowtype;
begin
  if new.member_user_id is null then return new; end if;

  if new.member_runner_index is null or new.member_runner_index<1 or new.member_runner_index>new.runner_count then
    new.member_runner_index:=coalesce(new.contact_runner_index,1);
  end if;

  update public.restart_participants
  set member_user_id=case when runner_index=new.member_runner_index then new.member_user_id else null end
  where registration_id=new.id;

  select * into p
  from public.restart_participants
  where registration_id=new.id and runner_index=new.member_runner_index
  limit 1;

  if found then
    insert into public.restart_member_profiles(
      user_id,email,title,first_name,last_name,birth_date,address,phone,blood_group,
      emergency_contact_name,emergency_phone,emergency_relation,updated_at
    )
    select
      new.member_user_id,u.email,p.title,p.first_name,p.last_name,p.birth_date,p.address,p.phone,p.blood_group,
      p.emergency_contact_name,p.emergency_phone,p.emergency_relation,now()
    from auth.users u where u.id=new.member_user_id
    on conflict(user_id) do update set
      email=excluded.email,
      title=excluded.title,
      first_name=excluded.first_name,
      last_name=excluded.last_name,
      birth_date=excluded.birth_date,
      address=excluded.address,
      phone=excluded.phone,
      blood_group=excluded.blood_group,
      emergency_contact_name=excluded.emergency_contact_name,
      emergency_phone=excluded.emergency_phone,
      emergency_relation=excluded.emergency_relation,
      updated_at=now();
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.restart_sync_registration_points()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private', 'auth'
AS $function$
declare
  v_points integer;
begin
  if new.member_user_id is null then return new; end if;
  select member_points_award into v_points from public.restart_events where id=new.event_id;
  v_points:=coalesce(v_points,0);

  if new.status='CONFIRMED' and v_points>0 then
    perform private.restart_change_member_points(
      new.member_user_id,v_points,'EARN_REGISTRATION',new.event_id,new.id,null,
      'REG:'||new.id::text||':EARN',
      'คะแนนจากการสมัคร '||new.registration_code,
      null
    );
  end if;

  if new.status='CANCELLED' and v_points>0 and exists(
    select 1 from public.restart_member_points_ledger
    where dedupe_key='REG:'||new.id::text||':EARN'
  ) then
    perform private.restart_change_member_points(
      new.member_user_id,-v_points,'REVERSE_REGISTRATION',new.event_id,new.id,null,
      'REG:'||new.id::text||':REVERSE',
      'คืนคะแนนจากการยกเลิก '||new.registration_code,
      null
    );
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_admin_adjust_member_points(p_user_id uuid, p_points integer, p_note text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'private', 'auth'
AS $function$
begin
  if not private.restart_is_admin() then raise exception 'NOT_AUTHORIZED'; end if;
  if p_points=0 then raise exception 'POINTS_ZERO_NOT_ALLOWED'; end if;
  if nullif(trim(coalesce(p_note,'')),'') is null then raise exception 'NOTE_REQUIRED'; end if;

  return private.restart_change_member_points(
    p_user_id,p_points,'ADMIN_ADJUSTMENT',null,null,null,null,trim(p_note),auth.uid()
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_create_registration(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_registration_id uuid;
  v_event public.restart_events%rowtype;
  v_category public.restart_race_categories%rowtype;
  v_package public.restart_packages%rowtype;
  v_event_id uuid := nullif(p_payload->>'event_id','')::uuid;
  v_category_id uuid := nullif(p_payload->>'category_id','')::uuid;
  v_package_id uuid := nullif(p_payload->>'package_id','')::uuid;
  v_code text := nullif(trim(coalesce(p_payload->>'registration_code','')),'');
  v_runner jsonb;
  v_bene jsonb;
  v_follower jsonb;
  v_step jsonb;
  v_answer record;
  v_schedule_id uuid;
  v_runner_index integer;
  v_first_schedule_id uuid;
  v_slip_path text := nullif(p_payload->>'slip_path','');
  v_first_amount numeric := 0;
  v_expected numeric := 0;
  v_claimed numeric := coalesce(nullif(p_payload->>'total_amount_thb','')::numeric,0);
  v_schedule_total numeric := 0;
  v_bene_total numeric;
  v_bene_ids text[];
  v_all_bene_ids text[] := array[]::text[];
  v_runner_id text;
  v_runner_ids text[] := array[]::text[];
  v_follower_id text;
  v_follower_ids text[] := array[]::text[];
  v_payment_mode text := upper(coalesce(nullif(p_payload->>'payment_mode',''),'FULL'));
  v_now timestamptz := now();
  v_flags jsonb;
  v_fields jsonb;
  v_key text;
  v_value text;
  v_runner_count integer := jsonb_array_length(coalesce(p_payload->'runners','[]'::jsonb));
  v_follower_count integer := jsonb_array_length(coalesce(p_payload->'followers','[]'::jsonb));
  v_registration_type text := upper(coalesce(nullif(p_payload->>'registration_type',''),'SINGLE'));
  v_group_name text := nullif(trim(coalesce(p_payload->>'group_name','')),'');
  v_contact_runner_index integer := coalesce(nullif(p_payload->>'contact_runner_index','')::integer,1);
  v_team_size integer;
  v_existing_count integer;
  v_existing_category_count integer;
  v_quote jsonb;
  v_merch_quote jsonb;
  v_merch_item jsonb;
  v_merch_variant public.restart_merch_variants%rowtype;
  v_merch_amount numeric:=0;
  v_merch_count integer:=0;
  v_merch_qty integer;
  v_subtotal numeric;
  v_discount numeric;
  v_promotion_id uuid;
  v_discount_code_id uuid;
  v_manual_review boolean;
  v_pdpa_required boolean;
  v_pdpa_accepted boolean := coalesce((p_payload->>'pdpa_accepted')::boolean,false);
  v_remaining integer;
  v_final_status text;
  v_expected_followers integer:=0;
begin
  if jsonb_array_length(coalesce(p_payload->'merch_items','[]'::jsonb))>0 then
    raise exception 'REGISTRATION_STORE_ITEMS_NOT_ALLOWED';
  end if;
  if v_event_id is null then raise exception 'EVENT_REQUIRED'; end if;

  select * into v_event from public.restart_events where id=v_event_id for update;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if v_event.status not in ('PUBLISHED','OPEN') then raise exception 'REGISTRATION_CLOSED'; end if;
  if v_event.registration_opens_at is not null and v_now < v_event.registration_opens_at then raise exception 'REGISTRATION_NOT_OPEN'; end if;
  if v_event.registration_closes_at is not null and v_now > v_event.registration_closes_at then raise exception 'REGISTRATION_CLOSED'; end if;

  v_flags := coalesce(v_event.feature_flags,'{}'::jsonb);
  v_fields := coalesce(v_event.field_settings,'{}'::jsonb);
  v_team_size := greatest(2,least(100,coalesce(
    nullif(v_flags->>'team_members_count','')::integer,
    nullif(v_flags->>'team_min_members','')::integer,
    3
  )));
  v_manual_review:=coalesce((v_flags->>'admin_slip_review')::boolean,true);
  v_pdpa_required:=coalesce((v_flags->>'pdpa')::boolean,false);

  if v_runner_count < 1 then raise exception 'RUNNER_REQUIRED'; end if;
  if v_contact_runner_index < 1 or v_contact_runner_index > v_runner_count then raise exception 'CONTACT_RUNNER_INVALID'; end if;

  if v_registration_type='SINGLE' then
    if v_runner_count <> 1 then raise exception 'SINGLE_REQUIRES_ONE_RUNNER'; end if;
  elsif v_registration_type='PAIR' then
    if not coalesce((v_flags->>'pair_registration')::boolean,false) then raise exception 'PAIR_REGISTRATION_DISABLED'; end if;
    if v_runner_count <> 2 then raise exception 'PAIR_REQUIRES_TWO_RUNNERS'; end if;
  elsif v_registration_type='TEAM' then
    if not coalesce((v_flags->>'team_registration')::boolean,false) then raise exception 'TEAM_REGISTRATION_DISABLED'; end if;
    if v_runner_count <> v_team_size then raise exception 'TEAM_SIZE_INVALID'; end if;
    if coalesce((v_flags->>'team_name_required')::boolean,true) and v_group_name is null then raise exception 'TEAM_NAME_REQUIRED'; end if;
  else
    raise exception 'REGISTRATION_TYPE_INVALID';
  end if;

  if v_pdpa_required and not v_pdpa_accepted then raise exception 'PDPA_REQUIRED'; end if;

  -- Validate runners first because auto category depends on age/gender.
  for v_runner in select * from jsonb_array_elements(coalesce(p_payload->'runners','[]'::jsonb))
  loop
    v_runner_index := coalesce(nullif(v_runner->>'runner_index','')::integer,0);
    if v_runner_index < 1 or v_runner_index > v_runner_count then raise exception 'RUNNER_INDEX_INVALID'; end if;

    foreach v_key in array array[
      'title','first_name','last_name','birth_date','gender','id_document','phone',
      'blood_group','shirt_size','address','emergency_contact_name','emergency_phone','emergency_relation'
    ]
    loop
      if coalesce((v_flags->>'basic_info')::boolean,true)
         and not (v_key='shirt_size' and not coalesce((v_flags->>'shirts')::boolean,true))
         and coalesce((v_fields->v_key->>'enabled')::boolean,true)
         and coalesce((v_fields->v_key->>'required')::boolean,false) then
        v_value := nullif(trim(coalesce(v_runner->>v_key,'')),'');
        if v_value is null then raise exception 'REQUIRED_FIELD_MISSING:%', v_key; end if;
      end if;
    end loop;

    v_runner_id := private.restart_normalize_id(coalesce(v_runner->>'id_normalized',v_runner->>'id_document'));
    if v_runner_id is not null then
      if v_runner_id = any(v_runner_ids) then raise exception 'DUPLICATE_RUNNER_ID'; end if;
      if exists(
        select 1 from public.restart_participants p
        join public.restart_registrations r on r.id=p.registration_id
        where p.event_id=v_event_id and p.id_normalized=v_runner_id and r.status<>'CANCELLED'
      ) then raise exception 'RUNNER_ALREADY_REGISTERED'; end if;
      v_runner_ids := array_append(v_runner_ids,v_runner_id);
    end if;

    if coalesce((v_flags->>'insurance')::boolean,false) then
      if not coalesce((v_flags->>'beneficiaries_multiple')::boolean,true)
         and jsonb_array_length(coalesce(v_runner->'beneficiaries','[]'::jsonb))>1 then
        raise exception 'MULTIPLE_BENEFICIARIES_DISABLED';
      end if;

      select coalesce(sum((b->>'percentage')::numeric),0),
             array_agg(private.restart_normalize_id(b->>'id_document'))
      into v_bene_total, v_bene_ids
      from jsonb_array_elements(coalesce(v_runner->'beneficiaries','[]'::jsonb)) b;

      if coalesce((v_flags->>'beneficiary_total_100')::boolean,true)
         and abs(coalesce(v_bene_total,0)-100) > 0.001 then
        raise exception 'BENEFICIARY_TOTAL_MUST_BE_100';
      end if;
      if v_runner_id is not null and v_bene_ids is not null and v_runner_id = any(v_bene_ids) then
        raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER';
      end if;
      if v_bene_ids is not null and
         (select count(*) from unnest(v_bene_ids) x where x is not null) <>
         (select count(distinct x) from unnest(v_bene_ids) x where x is not null) then
        raise exception 'DUPLICATE_BENEFICIARY_ID';
      end if;
      if v_bene_ids is not null then
        v_all_bene_ids := v_all_bene_ids || coalesce(
          array(select x from unnest(v_bene_ids) x where x is not null),
          array[]::text[]
        );
      end if;
    end if;
  end loop;

  if coalesce((v_flags->>'insurance')::boolean,false) then
    if exists(
      select 1 from unnest(v_all_bene_ids) b
      where b = any(v_runner_ids)
    ) then
      raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER';
    end if;
    if (select count(*) from unnest(v_all_bene_ids) x) <>
       (select count(distinct x) from unnest(v_all_bene_ids) x) then
      raise exception 'DUPLICATE_BENEFICIARY_ID';
    end if;
  end if;

  v_quote:=private.restart_compute_quote(
    v_event_id,v_category_id,v_package_id,v_registration_type,v_runner_count,
    nullif(trim(coalesce(p_payload->>'discount_code','')),''),coalesce(p_payload->'runners','[]'::jsonb)
  );
  v_category_id:=nullif(v_quote->>'category_id','')::uuid;
  v_subtotal:=coalesce((v_quote->>'subtotal_amount_thb')::numeric,0);
  v_discount:=coalesce((v_quote->>'discount_amount_thb')::numeric,0);
  v_promotion_id:=nullif(v_quote->>'promotion_id','')::uuid;
  v_discount_code_id:=nullif(v_quote->>'discount_code_id','')::uuid;

  -- Lock selected shirt variants in deterministic order before final stock validation.
  for v_merch_item in
    select jsonb_build_object('variant_id',q.variant_id,'qty',q.qty)
    from (
      select (x->>'variant_id')::uuid as variant_id,
             sum(greatest(0,coalesce(nullif(x->>'qty','')::integer,0)))::integer as qty
      from jsonb_array_elements(coalesce(p_payload->'merch_items','[]'::jsonb)) x
      where nullif(x->>'variant_id','') is not null
      group by 1
    ) q
    where q.qty>0
    order by q.variant_id
  loop
    v_merch_qty:=(v_merch_item->>'qty')::integer;
    select * into v_merch_variant
    from public.restart_merch_variants
    where id=(v_merch_item->>'variant_id')::uuid and is_active=true
    for update;
    if not found then raise exception 'SHIRT_VARIANT_NOT_AVAILABLE'; end if;
    if v_merch_qty > greatest(0,v_merch_variant.stock_qty-v_merch_variant.sold_qty) then
      raise exception 'SHIRT_OUT_OF_STOCK:%',v_merch_variant.size_label;
    end if;
  end loop;

  v_merch_quote:=private.restart_merch_quote(
    v_event_id,coalesce(p_payload->'merch_items','[]'::jsonb)
  );
  v_merch_amount:=coalesce((v_merch_quote->>'merchandise_amount_thb')::numeric,0);
  select coalesce(sum((x->>'qty')::integer),0)::integer
  into v_merch_count
  from jsonb_array_elements(coalesce(v_merch_quote->'items','[]'::jsonb)) x;

  v_expected:=coalesce((v_quote->>'total_amount_thb')::numeric,0)+v_merch_amount;

  if v_category_id is not null then
    select * into v_category from public.restart_race_categories where id=v_category_id;
  end if;
  if v_package_id is not null then
    select * into v_package from public.restart_packages where id=v_package_id;
    v_expected_followers:=case when coalesce((v_flags->>'followers')::boolean,false)
                              then coalesce(v_package.follower_count,0) else 0 end;
  end if;

  if not coalesce((v_flags->>'followers')::boolean,false) and v_follower_count>0 then
    raise exception 'FOLLOWERS_DISABLED';
  end if;
  if v_follower_count<>v_expected_followers then
    if v_expected_followers>0 or v_follower_count>0 then raise exception 'FOLLOWER_COUNT_MISMATCH'; end if;
  end if;

  for v_follower in select * from jsonb_array_elements(coalesce(p_payload->'followers','[]'::jsonb))
  loop
    if nullif(trim(coalesce(v_follower->>'full_name','')),'') is null then raise exception 'FOLLOWER_NAME_REQUIRED'; end if;
    v_follower_id:=private.restart_normalize_id(v_follower->>'id_document');
    if v_follower_id is null then raise exception 'FOLLOWER_ID_REQUIRED'; end if;
    if v_follower_id=any(v_runner_ids) or v_follower_id=any(v_follower_ids) or v_follower_id=any(v_all_bene_ids) then raise exception 'DUPLICATE_FOLLOWER_ID'; end if;
    v_follower_ids:=array_append(v_follower_ids,v_follower_id);
  end loop;

  if coalesce((v_flags->>'capacity')::boolean,false) then
    if v_event.capacity is not null then
      select count(*) into v_existing_count
      from public.restart_participants p
      join public.restart_registrations r on r.id=p.registration_id
      where p.event_id=v_event_id and r.status<>'CANCELLED';

      if v_existing_count + v_runner_count > v_event.capacity then
        if coalesce((v_flags->>'waitlist')::boolean,false) then raise exception 'WAITLIST_AVAILABLE'; end if;
        raise exception 'EVENT_CAPACITY_EXCEEDED';
      end if;
    end if;

    if v_category_id is not null and v_category.capacity is not null then
      select count(*) into v_existing_category_count
      from public.restart_participants p
      join public.restart_registrations r on r.id=p.registration_id
      where p.event_id=v_event_id and r.category_id=v_category_id and r.status<>'CANCELLED';

      if v_existing_category_count + v_runner_count > v_category.capacity then
        if coalesce((v_flags->>'waitlist')::boolean,false) then raise exception 'WAITLIST_AVAILABLE'; end if;
        raise exception 'CATEGORY_CAPACITY_EXCEEDED';
      end if;
    end if;
  end if;

  if abs(v_expected-v_claimed) > 0.01 then raise exception 'PRICE_MISMATCH'; end if;

  if v_payment_mode='INSTALLMENT' then
    if not coalesce((v_flags->>'installments')::boolean,false) then raise exception 'INSTALLMENT_DISABLED'; end if;
    if v_category_id is not null and v_category.installment_enabled=false then raise exception 'INSTALLMENT_DISABLED_FOR_CATEGORY'; end if;
  elsif v_payment_mode='FULL' then
    if not coalesce((v_flags->>'full_payment')::boolean,true) then raise exception 'FULL_PAYMENT_DISABLED'; end if;
    if v_category_id is not null and v_category.full_payment_enabled=false then raise exception 'FULL_PAYMENT_DISABLED_FOR_CATEGORY'; end if;
  else
    raise exception 'PAYMENT_MODE_INVALID';
  end if;

  for v_step in select * from jsonb_array_elements(coalesce(p_payload->'schedule','[]'::jsonb))
  loop
    v_schedule_total := v_schedule_total + coalesce((v_step->>'amount_due_thb')::numeric,0);
  end loop;
  if abs(v_schedule_total-v_expected) > 0.01 then raise exception 'PAYMENT_SCHEDULE_MISMATCH'; end if;

  if v_expected>0 and coalesce((v_flags->>'slip_upload')::boolean,true) and v_slip_path is null then
    raise exception 'SLIP_REQUIRED';
  end if;

  if v_discount_code_id is not null then
    perform 1
    from public.restart_discount_codes
    where id=v_discount_code_id
      and (max_uses is null or used_count<max_uses)
    for update;
    if not found then raise exception 'DISCOUNT_CODE_LIMIT_REACHED'; end if;
  end if;

  if v_code is null then
    v_code := 'RST-' || to_char(clock_timestamp(),'YYMMDDHH24MISS') || '-' ||
              upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));
  end if;

  insert into public.restart_registrations(
    event_id,category_id,package_id,registration_code,language,payment_mode,total_amount_thb,status,
    participant_snapshot,registration_type,group_name,contact_runner_index,runner_count,
    subtotal_amount_thb,discount_amount_thb,merchandise_amount_thb,promotion_id,discount_code_id,
    pdpa_accepted_at,pdpa_version,pdpa_text_snapshot
  ) values (
    v_event_id,v_category_id,v_package_id,v_code,
    coalesce(nullif(p_payload->>'language',''),v_event.default_language,'th'),
    v_payment_mode,v_expected,'PENDING_PAYMENT',
    coalesce(p_payload->'runners','[]'::jsonb),
    v_registration_type,v_group_name,v_contact_runner_index,v_runner_count,
    v_subtotal,v_discount,v_merch_amount,v_promotion_id,v_discount_code_id,
    case when v_pdpa_required then v_now else null end,
    case when v_pdpa_required then v_event.pdpa_version else null end,
    case when v_pdpa_required then v_event.pdpa_text else null end
  )
  returning id into v_registration_id;

  for v_runner in select * from jsonb_array_elements(coalesce(p_payload->'runners','[]'::jsonb))
  loop
    v_runner_index := (v_runner->>'runner_index')::integer;
    insert into public.restart_participants(
      registration_id,event_id,runner_index,first_name,last_name,id_document,id_normalized,phone,birth_date,gender,shirt_size,blood_group,
      title,address,emergency_contact_name,emergency_phone,emergency_relation
    ) values (
      v_registration_id,v_event_id,v_runner_index,
      nullif(trim(v_runner->>'first_name'),''),
      nullif(trim(v_runner->>'last_name'),''),
      nullif(trim(v_runner->>'id_document'),''),
      private.restart_normalize_id(coalesce(v_runner->>'id_normalized',v_runner->>'id_document')),
      nullif(trim(v_runner->>'phone'),''),
      nullif(v_runner->>'birth_date','')::date,
      nullif(v_runner->>'gender',''),
      nullif(v_runner->>'shirt_size',''),
      nullif(v_runner->>'blood_group',''),
      nullif(trim(v_runner->>'title'),''),
      nullif(trim(v_runner->>'address'),''),
      nullif(trim(v_runner->>'emergency_contact_name'),''),
      nullif(trim(v_runner->>'emergency_phone'),''),
      nullif(trim(v_runner->>'emergency_relation'),'')
    );

    for v_answer in select key,value from jsonb_each(coalesce(v_runner->'answers','{}'::jsonb))
    loop
      insert into public.restart_registration_answers(registration_id,runner_index,field_id,field_key,value)
      select v_registration_id,v_runner_index,f.id,v_answer.key,v_answer.value
      from public.restart_form_fields f
      where f.event_id=v_event_id and f.field_key=v_answer.key and f.is_active=true
      limit 1;
    end loop;

    if coalesce((v_flags->>'insurance')::boolean,false) then
      for v_bene in select * from jsonb_array_elements(coalesce(v_runner->'beneficiaries','[]'::jsonb))
      loop
        insert into public.restart_beneficiaries(
          registration_id,runner_index,full_name,address,id_document,phone,relationship,percentage
        ) values (
          v_registration_id,v_runner_index,
          trim(v_bene->>'full_name'),nullif(trim(v_bene->>'address'),''),
          trim(v_bene->>'id_document'),nullif(trim(v_bene->>'phone'),''),
          trim(v_bene->>'relationship'),(v_bene->>'percentage')::numeric
        );
      end loop;
    end if;
  end loop;

  v_runner_index:=0;
  for v_follower in select * from jsonb_array_elements(coalesce(p_payload->'followers','[]'::jsonb))
  loop
    v_runner_index:=v_runner_index+1;
    insert into public.restart_followers(
      registration_id,follower_index,full_name,id_document,id_normalized,phone,relationship
    ) values (
      v_registration_id,v_runner_index,
      trim(v_follower->>'full_name'),
      nullif(trim(v_follower->>'id_document'),''),
      private.restart_normalize_id(v_follower->>'id_document'),
      nullif(trim(v_follower->>'phone'),''),
      nullif(trim(v_follower->>'relationship'),'')
    );
  end loop;

  for v_merch_item in select * from jsonb_array_elements(coalesce(v_merch_quote->'items','[]'::jsonb))
  loop
    insert into public.restart_merch_order_items(
      registration_id,event_id,product_id,variant_id,
      product_code_snapshot,product_name_snapshot,size_label_snapshot,sku_snapshot,
      qty,unit_price_thb,total_price_thb,status
    ) values (
      v_registration_id,v_event_id,
      nullif(v_merch_item->>'product_id','')::uuid,
      nullif(v_merch_item->>'variant_id','')::uuid,
      nullif(v_merch_item->>'product_code',''),
      coalesce(v_merch_item->'product_name','{}'::jsonb),
      v_merch_item->>'size_label',
      nullif(v_merch_item->>'sku',''),
      (v_merch_item->>'qty')::integer,
      (v_merch_item->>'unit_price_thb')::numeric,
      (v_merch_item->>'total_price_thb')::numeric,
      'ACTIVE'
    );

    update public.restart_merch_variants
    set sold_qty=sold_qty+(v_merch_item->>'qty')::integer,updated_at=now()
    where id=(v_merch_item->>'variant_id')::uuid;
  end loop;

  for v_step in select * from jsonb_array_elements(coalesce(p_payload->'schedule','[]'::jsonb))
  loop
    insert into public.restart_payment_schedule(
      registration_id,installment_no,amount_due_thb,due_at,status
    ) values (
      v_registration_id,
      (v_step->>'installment_no')::integer,
      (v_step->>'amount_due_thb')::numeric,
      nullif(v_step->>'due_at','')::timestamptz,
      case
        when (v_step->>'amount_due_thb')::numeric<=0 then 'PAID'
        when (v_step->>'installment_no')::integer=1 and v_slip_path is not null and v_manual_review then 'PENDING_REVIEW'
        when (v_step->>'installment_no')::integer=1 and v_slip_path is not null and not v_manual_review then 'PAID'
        else 'PENDING'
      end
    ) returning id into v_schedule_id;

    if (v_step->>'installment_no')::integer=1 then
      v_first_schedule_id:=v_schedule_id;
      v_first_amount:=(v_step->>'amount_due_thb')::numeric;
    end if;
  end loop;

  if v_slip_path is not null and v_first_schedule_id is not null then
    insert into public.restart_payment_attempts(
      schedule_id,claimed_amount_thb,slip_path,status,admin_note,reviewed_at
    ) values (
      v_first_schedule_id,v_first_amount,v_slip_path,
      case when v_manual_review then 'PENDING_REVIEW' else 'APPROVED' end,
      case when v_manual_review then null else 'AUTO_APPROVED' end,
      case when v_manual_review then null else v_now end
    );
  end if;

  if v_discount_code_id is not null then
    update public.restart_discount_codes set used_count=used_count+1 where id=v_discount_code_id;
    insert into public.restart_discount_redemptions(discount_code_id,registration_id,amount_thb)
    values(v_discount_code_id,v_registration_id,coalesce((v_quote->>'discount_code_discount_thb')::numeric,0));
  end if;

  select count(*) into v_remaining
  from public.restart_payment_schedule
  where registration_id=v_registration_id and status not in ('PAID','WAIVED');

  if v_remaining=0 then v_final_status:='CONFIRMED';
  elsif exists(
    select 1 from public.restart_payment_schedule
    where registration_id=v_registration_id and status='PENDING_REVIEW'
  ) then v_final_status:='PENDING_REVIEW';
  else v_final_status:='PENDING_PAYMENT';
  end if;

  update public.restart_registrations set status=v_final_status,updated_at=now()
  where id=v_registration_id;

  insert into public.restart_registration_audit(registration_id,action,actor,data)
  values(v_registration_id,'SUBMITTED','PUBLIC',jsonb_build_object(
    'registration_type',v_registration_type,'runner_count',v_runner_count,
    'follower_count',v_follower_count,'merchandise_qty',v_merch_count,
    'merchandise_amount_thb',v_merch_amount,'total_amount_thb',v_expected
  ));

  return jsonb_build_object(
    'id',v_registration_id,
    'registration_code',v_code,
    'registration_type',v_registration_type,
    'runner_count',v_runner_count,
    'follower_count',v_follower_count,
    'category_id',v_category_id,
    'subtotal_amount_thb',v_subtotal,
    'discount_amount_thb',v_discount,
    'merchandise_amount_thb',v_merch_amount,
    'merchandise_qty',v_merch_count,
    'total_amount_thb',v_expected,
    'promotion_name',v_quote->>'promotion_name',
    'discount_code',v_quote->>'discount_code',
    'status',v_final_status
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_create_store_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  s public.restart_stores%rowtype;
  q jsonb;
  item jsonb;
  v public.restart_merch_variants%rowtype;
  payment public.restart_store_payment_methods%rowtype;
  v_event_id uuid:=nullif(p_payload->>'event_id','')::uuid;
  v_store_slug text:=nullif(trim(coalesce(p_payload->>'store_slug','')),'');
  v_store_id uuid;
  v_member_user_id uuid:=nullif(p_payload->>'member_user_id','')::uuid;
  v_requested_points integer:=greatest(0,coalesce(nullif(p_payload->>'points_to_redeem','')::integer,0));
  v_points_redeemed integer:=0;
  v_points_discount numeric:=0;
  v_payment_method_id uuid:=nullif(p_payload->>'payment_method_id','')::uuid;
  customer_name text:=nullif(trim(coalesce(p_payload->>'customer_name','')),'');
  phone text:=nullif(trim(coalesce(p_payload->>'phone','')),'');
  delivery text:=upper(coalesce(nullif(trim(p_payload->>'delivery_method'),''),'PICKUP'));
  address text:=nullif(trim(coalesce(p_payload->>'delivery_address','')),'');
  slip_path text:=nullif(trim(coalesce(p_payload->>'slip_path','')),'');
  claimed numeric:=coalesce(nullif(p_payload->>'total_amount_thb','')::numeric,-1);
  order_id uuid;
  order_code text;
  total numeric;
  new_status text;
begin
  if v_event_id is null then raise exception 'EVENT_REQUIRED'; end if;
  if v_store_slug is null then raise exception 'STORE_SLUG_REQUIRED'; end if;

  select * into e from public.restart_events where id=v_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  select * into s
  from public.restart_stores
  where event_id=v_event_id and slug=v_store_slug;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;
  v_store_id:=s.id;

  if customer_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if phone is null then raise exception 'PHONE_REQUIRED'; end if;
  if delivery='DELIVERY' and address is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;

  if v_requested_points>0 then
    if v_member_user_id is null then raise exception 'MEMBER_LOGIN_REQUIRED_FOR_POINTS'; end if;
    perform 1 from public.restart_member_profiles where user_id=v_member_user_id for update;
    if not found then raise exception 'MEMBER_PROFILE_NOT_FOUND'; end if;
  end if;

  for item in
    select jsonb_build_object('variant_id',x.variant_id,'qty',x.qty)
    from (
      select (j->>'variant_id')::uuid as variant_id,
             sum(greatest(0,coalesce(nullif(j->>'qty','')::integer,0)))::integer as qty
      from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) j
      where nullif(j->>'variant_id','') is not null
      group by 1
    ) x
    where x.qty>0
    order by x.variant_id
  loop
    select mv.* into v
    from public.restart_merch_variants mv
    join public.restart_merch_products mp on mp.id=mv.product_id
    where mv.id=(item->>'variant_id')::uuid
      and mv.is_active=true
      and mp.store_id=v_store_id
      and mp.event_id=v_event_id
      and mp.is_active=true
    for update of mv;
    if not found then raise exception 'STORE_VARIANT_NOT_AVAILABLE'; end if;
    if (item->>'qty')::integer>greatest(0,v.stock_qty-v.sold_qty) then
      raise exception 'STORE_OUT_OF_STOCK:%',coalesce(v.variant_name->>'th',v.size_label);
    end if;
  end loop;

  q:=public.restart_store_quote(p_payload);
  total:=coalesce((q->>'total_amount_thb')::numeric,0);
  v_points_redeemed:=coalesce((q->>'points_redeemed')::integer,0);
  v_points_discount:=coalesce((q->>'points_discount_thb')::numeric,0);
  if claimed>=0 and abs(claimed-total)>0.01 then raise exception 'STORE_PRICE_MISMATCH'; end if;

  if total>0 then
    if v_payment_method_id is null then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
    select * into payment
    from public.restart_store_payment_methods
    where id=v_payment_method_id
      and store_id=v_store_id
      and is_enabled=true;
    if not found then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
    if slip_path is null then raise exception 'SLIP_REQUIRED'; end if;
    new_status:='PENDING_REVIEW';
  else
    new_status:='PAID';
  end if;

  order_code:='SHOP-'||
    upper(substr(regexp_replace(s.slug,'[^a-z0-9]','','g'),1,6))||'-'||
    to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,4));

  insert into public.restart_store_orders(
    event_id,store_id,member_user_id,order_code,language,customer_name,phone,email,
    delivery_method,delivery_address,customer_note,
    subtotal_amount_thb,shipping_fee_thb,points_redeemed,points_discount_thb,total_amount_thb,
    payment_method_id,store_payment_method_id,payment_method_snapshot,
    status,payment_status,paid_at
  ) values(
    v_event_id,v_store_id,v_member_user_id,order_code,coalesce(nullif(p_payload->>'language',''),'th'),
    customer_name,phone,nullif(trim(coalesce(p_payload->>'email','')),''),
    delivery,address,nullif(trim(coalesce(p_payload->>'customer_note','')),''),
    (q->>'subtotal_amount_thb')::numeric,
    (q->>'shipping_fee_thb')::numeric,
    v_points_redeemed,v_points_discount,total,
    null,v_payment_method_id,
    case when v_payment_method_id is null then '{}'::jsonb else jsonb_build_object(
      'store_id',v_store_id,'store_slug',s.slug,
      'kind',payment.kind,'label',payment.label,'bank_name',payment.bank_name,
      'account_name',payment.account_name,'account_number',payment.account_number,
      'promptpay_type',payment.promptpay_type,'promptpay_id',payment.promptpay_id
    ) end,
    new_status,
    case when total>0 then 'PENDING_REVIEW' else 'APPROVED' end,
    case when total<=0 then now() else null end
  ) returning id into order_id;

  for item in select * from jsonb_array_elements(q->'items')
  loop
    insert into public.restart_store_order_items(
      order_id,event_id,store_id,product_id,variant_id,
      product_code_snapshot,product_name_snapshot,variant_name_snapshot,
      option_values_snapshot,sku_snapshot,qty,unit_price_thb,total_price_thb
    ) values(
      order_id,v_event_id,v_store_id,
      nullif(item->>'product_id','')::uuid,
      nullif(item->>'variant_id','')::uuid,
      nullif(item->>'product_code',''),
      coalesce(item->'product_name','{}'::jsonb),
      coalesce(item->'variant_name','{}'::jsonb),
      coalesce(item->'option_values','{}'::jsonb),
      nullif(item->>'sku',''),
      (item->>'qty')::integer,
      (item->>'unit_price_thb')::numeric,
      (item->>'total_price_thb')::numeric
    );
    update public.restart_merch_variants
    set sold_qty=sold_qty+(item->>'qty')::integer,updated_at=now()
    where id=(item->>'variant_id')::uuid;
  end loop;

  if v_points_redeemed>0 then
    perform private.restart_change_member_points(
      v_member_user_id,-v_points_redeemed,'REDEEM_STORE',v_event_id,null,order_id,
      'STORE:'||order_id::text||':REDEEM',
      'ใช้คะแนนเป็นส่วนลดร้าน '||coalesce(s.name->>'th',s.slug),
      null
    );
  end if;

  if total>0 then
    insert into public.restart_store_payments(order_id,amount_thb,slip_path,status)
    values(order_id,total,slip_path,'PENDING_REVIEW');
  end if;

  return jsonb_build_object(
    'id',order_id,'store_id',v_store_id,'store_slug',s.slug,'store_name',s.name,
    'order_code',order_code,'status',new_status,
    'payment_status',case when total>0 then 'PENDING_REVIEW' else 'APPROVED' end,
    'subtotal_amount_thb',(q->>'subtotal_amount_thb')::numeric,
    'shipping_fee_thb',(q->>'shipping_fee_thb')::numeric,
    'points_redeemed',v_points_redeemed,
    'points_discount_thb',v_points_discount,
    'total_amount_thb',total,
    'member_points_balance',case when v_member_user_id is null then null else
      (select points_balance from public.restart_member_profiles where user_id=v_member_user_id) end,
    'items',q->'items'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_store_quote(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_event_id uuid:=nullif(p_payload->>'event_id','')::uuid;
  v_store_slug text:=nullif(trim(coalesce(p_payload->>'store_slug','')),'');
  v_store_id uuid;
  v_member_user_id uuid:=nullif(p_payload->>'member_user_id','')::uuid;
  v_requested_points integer:=greatest(0,coalesce(nullif(p_payload->>'points_to_redeem','')::integer,0));
  v_balance integer:=0;
  v_rate integer:=1;
  v_min integer:=0;
  v_max integer;
  v_max_by_subtotal integer:=0;
  v_actual_points integer:=0;
  v_discount numeric:=0;
  v_total numeric:=0;
  s public.restart_stores%rowtype;
  q jsonb;
begin
  if v_event_id is null then raise exception 'EVENT_REQUIRED'; end if;
  if v_store_slug is null then raise exception 'STORE_SLUG_REQUIRED'; end if;

  select * into s
  from public.restart_stores
  where event_id=v_event_id and slug=v_store_slug;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;
  v_store_id:=s.id;

  q:=private.restart_store_quote(
    v_event_id,
    v_store_id,
    coalesce(p_payload->'items','[]'::jsonb),
    coalesce(p_payload->>'delivery_method','PICKUP')
  );

  if v_member_user_id is not null then
    select coalesce(points_balance,0) into v_balance
    from public.restart_member_profiles where user_id=v_member_user_id;
    v_balance:=coalesce(v_balance,0);
  end if;

  if v_requested_points>0 then
    if v_member_user_id is null then raise exception 'MEMBER_LOGIN_REQUIRED_FOR_POINTS'; end if;
    if not s.points_redemption_enabled then raise exception 'POINTS_REDEMPTION_DISABLED'; end if;

    v_rate:=greatest(1,coalesce(s.points_per_thb,1));
    v_min:=greatest(0,coalesce(s.min_redeem_points,0));
    if v_requested_points<v_min then raise exception 'POINTS_MINIMUM_NOT_MET:%',v_min; end if;

    v_max_by_subtotal:=greatest(0,floor(coalesce((q->>'subtotal_amount_thb')::numeric,0)*v_rate)::integer);
    v_actual_points:=least(v_requested_points,v_balance,v_max_by_subtotal);
    if s.max_redeem_points_per_order is not null then
      v_actual_points:=least(v_actual_points,s.max_redeem_points_per_order);
    end if;
    v_actual_points:=(v_actual_points/v_rate)*v_rate;

    if v_actual_points<=0 then raise exception 'POINTS_NOT_ENOUGH'; end if;
    if v_actual_points<v_min then raise exception 'POINTS_MINIMUM_NOT_MET:%',v_min; end if;
    v_discount:=round(v_actual_points::numeric/v_rate,2);
  else
    v_rate:=greatest(1,coalesce(s.points_per_thb,1));
  end if;

  v_total:=greatest(0,coalesce((q->>'total_amount_thb')::numeric,0)-v_discount);

  return q || jsonb_build_object(
    'member_points_balance',v_balance,
    'points_redemption_enabled',s.points_redemption_enabled,
    'points_per_thb',v_rate,
    'min_redeem_points',coalesce(s.min_redeem_points,0),
    'max_redeem_points_per_order',s.max_redeem_points_per_order,
    'points_redeemed',v_actual_points,
    'points_discount_thb',v_discount,
    'total_amount_thb',round(v_total,2)
  );
end;
$function$;


revoke all on function private.restart_change_member_points(uuid,integer,text,uuid,uuid,uuid,text,text,uuid) from public,anon,authenticated;
revoke all on function private.restart_sync_registration_member() from public,anon,authenticated;
revoke all on function private.restart_sync_registration_points() from public,anon,authenticated;
revoke all on function private.restart_refund_store_points() from public,anon,authenticated;
grant execute on function public.restart_admin_adjust_member_points(uuid,integer,text) to authenticated;
revoke all on function public.restart_store_quote(jsonb) from public,anon,authenticated;
grant execute on function public.restart_store_quote(jsonb) to service_role;
revoke all on function public.restart_create_store_order(jsonb) from public,anon,authenticated;
grant execute on function public.restart_create_store_order(jsonb) to service_role;

drop trigger if exists restart_sync_registration_member_trg on public.restart_registrations;
create trigger restart_sync_registration_member_trg
before update of member_user_id,member_runner_index on public.restart_registrations
for each row execute function private.restart_sync_registration_member();

drop trigger if exists restart_sync_registration_points_trg on public.restart_registrations;
create trigger restart_sync_registration_points_trg
after insert or update of status,member_user_id on public.restart_registrations
for each row execute function private.restart_sync_registration_points();

drop trigger if exists restart_refund_store_points_trg on public.restart_store_orders;
create trigger restart_refund_store_points_trg
after update of status on public.restart_store_orders
for each row execute function private.restart_refund_store_points();

commit;
