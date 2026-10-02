-- RESTART Registration System - Shirt Sales
-- Snapshot: 2026-10-03
-- Depends on 001_registration_platform_patch.sql and 002_full_registration_system.sql.
-- Adds optional event shirt add-on sales with size/SKU inventory, stock reservation,
-- payment integration, cancellation stock return, fulfillment tracking and admin reporting.

begin;

alter table public.restart_registrations
  add column if not exists merchandise_amount_thb numeric not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.restart_registrations'::regclass
      and conname='restart_registrations_merchandise_amount_thb_check'
  ) then
    alter table public.restart_registrations
      add constraint restart_registrations_merchandise_amount_thb_check
      check (merchandise_amount_thb >= 0);
  end if;
end $$;

create table if not exists public.restart_merch_products(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.restart_events(id) on delete cascade,
  code text not null,
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  price_thb numeric not null default 0 check(price_thb >= 0),
  image_url text,
  image_storage_path text,
  max_per_registration integer not null default 10 check(max_per_registration between 1 and 100),
  sale_starts_at timestamptz,
  sale_ends_at timestamptz,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id,code),
  check(sale_ends_at is null or sale_starts_at is null or sale_ends_at > sale_starts_at)
);

create table if not exists public.restart_merch_variants(
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.restart_merch_products(id) on delete cascade,
  size_label text not null,
  sku text,
  stock_qty integer not null default 0 check(stock_qty >= 0),
  sold_qty integer not null default 0 check(sold_qty >= 0 and sold_qty <= stock_qty),
  price_adjustment_thb numeric not null default 0,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(product_id,size_label)
);

create table if not exists public.restart_merch_order_items(
  id uuid primary key default gen_random_uuid(),
  registration_id uuid not null references public.restart_registrations(id) on delete cascade,
  event_id uuid not null references public.restart_events(id) on delete cascade,
  product_id uuid references public.restart_merch_products(id) on delete set null,
  variant_id uuid references public.restart_merch_variants(id) on delete set null,
  product_code_snapshot text,
  product_name_snapshot jsonb not null default '{}'::jsonb,
  size_label_snapshot text not null,
  sku_snapshot text,
  qty integer not null check(qty > 0),
  unit_price_thb numeric not null check(unit_price_thb >= 0),
  total_price_thb numeric not null check(total_price_thb >= 0),
  status text not null default 'ACTIVE' check(status in ('ACTIVE','FULFILLED','CANCELLED')),
  fulfilled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists restart_merch_products_event_idx
  on public.restart_merch_products(event_id,sort_order);
create index if not exists restart_merch_variants_product_idx
  on public.restart_merch_variants(product_id,sort_order);
create index if not exists restart_merch_order_items_registration_idx
  on public.restart_merch_order_items(registration_id);
create index if not exists restart_merch_order_items_event_idx
  on public.restart_merch_order_items(event_id,status);
create index if not exists restart_merch_order_items_product_idx
  on public.restart_merch_order_items(product_id);
create index if not exists restart_merch_order_items_variant_idx
  on public.restart_merch_order_items(variant_id);

alter table public.restart_merch_products enable row level security;
alter table public.restart_merch_variants enable row level security;
alter table public.restart_merch_order_items enable row level security;

drop policy if exists restart_merch_products_read on public.restart_merch_products;
drop policy if exists restart_merch_products_public_read on public.restart_merch_products;
drop policy if exists restart_merch_products_admin_select on public.restart_merch_products;
drop policy if exists restart_merch_products_admin_insert on public.restart_merch_products;
drop policy if exists restart_merch_products_admin_update on public.restart_merch_products;
drop policy if exists restart_merch_products_admin_delete on public.restart_merch_products;

create policy restart_merch_products_public_read
on public.restart_merch_products for select to anon
using (
  is_active=true
  and (sale_starts_at is null or now()>=sale_starts_at)
  and (sale_ends_at is null or now()<=sale_ends_at)
);
create policy restart_merch_products_admin_select
on public.restart_merch_products for select to authenticated
using ((select private.restart_is_admin()));
create policy restart_merch_products_admin_insert
on public.restart_merch_products for insert to authenticated
with check ((select private.restart_is_admin()));
create policy restart_merch_products_admin_update
on public.restart_merch_products for update to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));
create policy restart_merch_products_admin_delete
on public.restart_merch_products for delete to authenticated
using ((select private.restart_is_admin()));

drop policy if exists restart_merch_variants_read on public.restart_merch_variants;
drop policy if exists restart_merch_variants_public_read on public.restart_merch_variants;
drop policy if exists restart_merch_variants_admin_select on public.restart_merch_variants;
drop policy if exists restart_merch_variants_admin_insert on public.restart_merch_variants;
drop policy if exists restart_merch_variants_admin_update on public.restart_merch_variants;
drop policy if exists restart_merch_variants_admin_delete on public.restart_merch_variants;

create policy restart_merch_variants_public_read
on public.restart_merch_variants for select to anon
using (
  is_active=true
  and exists(
    select 1 from public.restart_merch_products p
    where p.id=product_id
      and p.is_active=true
      and (p.sale_starts_at is null or now()>=p.sale_starts_at)
      and (p.sale_ends_at is null or now()<=p.sale_ends_at)
  )
);
create policy restart_merch_variants_admin_select
on public.restart_merch_variants for select to authenticated
using ((select private.restart_is_admin()));
create policy restart_merch_variants_admin_insert
on public.restart_merch_variants for insert to authenticated
with check ((select private.restart_is_admin()));
create policy restart_merch_variants_admin_update
on public.restart_merch_variants for update to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));
create policy restart_merch_variants_admin_delete
on public.restart_merch_variants for delete to authenticated
using ((select private.restart_is_admin()));

drop policy if exists restart_merch_order_items_admin_all on public.restart_merch_order_items;
create policy restart_merch_order_items_admin_all
on public.restart_merch_order_items for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

grant select on public.restart_merch_products,public.restart_merch_variants to anon,authenticated;
grant insert,update,delete on public.restart_merch_products,public.restart_merch_variants to authenticated;
grant select,insert,update,delete on public.restart_merch_order_items to authenticated;

CREATE OR REPLACE FUNCTION private.restart_merch_quote(p_event_id uuid, p_items jsonb DEFAULT '[]'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  v public.restart_merch_variants%rowtype;
  p public.restart_merch_products%rowtype;
  rec record;
  total numeric:=0;
  unit_price numeric;
  line_total numeric;
  product_total integer;
  normalized jsonb:='[]'::jsonb;
begin
  select * into e from public.restart_events where id=p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;

  if jsonb_array_length(coalesce(p_items,'[]'::jsonb))=0 then
    return jsonb_build_object('merchandise_amount_thb',0,'items','[]'::jsonb);
  end if;

  if not coalesce((e.feature_flags->>'shirt_sales')::boolean,false) then
    raise exception 'SHIRT_SALES_DISABLED';
  end if;

  for rec in
    select (x->>'variant_id')::uuid as variant_id,
           sum(greatest(0,coalesce(nullif(x->>'qty','')::integer,0)))::integer as qty
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where nullif(x->>'variant_id','') is not null
    group by 1
    order by 1
  loop
    if rec.qty<1 then continue; end if;
    if rec.qty>100 then raise exception 'SHIRT_QTY_INVALID'; end if;

    select * into v from public.restart_merch_variants
    where id=rec.variant_id and is_active=true;
    if not found then raise exception 'SHIRT_VARIANT_NOT_AVAILABLE'; end if;

    select * into p from public.restart_merch_products
    where id=v.product_id and event_id=p_event_id and is_active=true;
    if not found then raise exception 'SHIRT_PRODUCT_NOT_AVAILABLE'; end if;

    if p.sale_starts_at is not null and now()<p.sale_starts_at then raise exception 'SHIRT_SALE_NOT_OPEN'; end if;
    if p.sale_ends_at is not null and now()>p.sale_ends_at then raise exception 'SHIRT_SALE_CLOSED'; end if;

    select coalesce(sum(greatest(0,coalesce(nullif(x->>'qty','')::integer,0))),0)::integer
    into product_total
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.restart_merch_variants vx on vx.id=(x->>'variant_id')::uuid
    where vx.product_id=p.id;

    if product_total>p.max_per_registration then raise exception 'SHIRT_MAX_PER_REGISTRATION'; end if;
    if rec.qty > greatest(0,v.stock_qty-v.sold_qty) then raise exception 'SHIRT_OUT_OF_STOCK:%',v.size_label; end if;

    unit_price:=greatest(0,p.price_thb+coalesce(v.price_adjustment_thb,0));
    line_total:=round(unit_price*rec.qty,2);
    total:=total+line_total;

    normalized:=normalized||jsonb_build_array(jsonb_build_object(
      'product_id',p.id,
      'variant_id',v.id,
      'product_code',p.code,
      'product_name',p.name,
      'size_label',v.size_label,
      'sku',v.sku,
      'qty',rec.qty,
      'unit_price_thb',unit_price,
      'total_price_thb',line_total
    ));
  end loop;

  return jsonb_build_object(
    'merchandise_amount_thb',round(total,2),
    'items',normalized
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
      'blood_group','shirt_size','address','emergency_phone','emergency_relation'
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
      title,address,emergency_phone,emergency_relation
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

CREATE OR REPLACE FUNCTION public.restart_manage_registration_action(p_event_slug text, p_registration_code text, p_id_document text, p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  reg_id uuid;
  r public.restart_registrations%rowtype;
  e public.restart_events%rowtype;
  action text:=upper(trim(p_action));
  idx integer;
  new_id text;
  beneficiaries jsonb;
  bene_ids text[];
  all_runners jsonb;
  b jsonb;
begin
  reg_id:=private.restart_authorize_registration(p_event_slug,p_registration_code,p_id_document,true);
  select * into r from public.restart_registrations where id=reg_id for update;
  select * into e from public.restart_events where id=r.event_id;

  if action='CANCEL' then
    if not coalesce((e.feature_flags->>'cancellation')::boolean,false) then raise exception 'CANCELLATION_DISABLED'; end if;
    if r.status='CANCELLED' then raise exception 'ALREADY_CANCELLED'; end if;
    -- Return stock only for shirts that have not been handed out yet.
    update public.restart_merch_variants v
    set sold_qty=greatest(0,v.sold_qty-x.qty),updated_at=now()
    from (
      select variant_id,sum(qty)::integer qty
      from public.restart_merch_order_items
      where registration_id=reg_id and status='ACTIVE' and variant_id is not null
      group by variant_id
    ) x
    where v.id=x.variant_id;

    update public.restart_merch_order_items
    set status='CANCELLED'
    where registration_id=reg_id and status='ACTIVE';

    update public.restart_registrations
    set status='CANCELLED',cancelled_at=now(),
        cancelled_reason=nullif(trim(coalesce(p_payload->>'reason','')),''),updated_at=now()
    where id=reg_id;
    insert into public.restart_registration_audit(registration_id,action,actor,data)
    values(reg_id,'CANCELLED','PUBLIC',jsonb_build_object('reason',p_payload->>'reason'));
    return jsonb_build_object('ok',true,'status','CANCELLED');

  elsif action='EDIT' then
    if not coalesce((e.feature_flags->>'edit_after_submit')::boolean,false) then raise exception 'EDIT_DISABLED'; end if;
    if r.status='CANCELLED' then raise exception 'REGISTRATION_CANCELLED'; end if;
    idx:=coalesce(nullif(p_payload->>'runner_index','')::integer,0);
    if idx<1 or idx>r.runner_count then raise exception 'RUNNER_INDEX_INVALID'; end if;

    update public.restart_participants p set
      title=coalesce(nullif(trim(p_payload->>'title'),''),p.title),
      first_name=coalesce(nullif(trim(p_payload->>'first_name'),''),p.first_name),
      last_name=coalesce(nullif(trim(p_payload->>'last_name'),''),p.last_name),
      phone=coalesce(nullif(trim(p_payload->>'phone'),''),p.phone),
      birth_date=coalesce(nullif(p_payload->>'birth_date','')::date,p.birth_date),
      gender=coalesce(nullif(p_payload->>'gender',''),p.gender),
      shirt_size=coalesce(nullif(p_payload->>'shirt_size',''),p.shirt_size),
      blood_group=coalesce(nullif(p_payload->>'blood_group',''),p.blood_group),
      address=coalesce(nullif(trim(p_payload->>'address'),''),p.address),
      emergency_phone=coalesce(nullif(trim(p_payload->>'emergency_phone'),''),p.emergency_phone),
      emergency_relation=coalesce(nullif(trim(p_payload->>'emergency_relation'),''),p.emergency_relation)
    where p.registration_id=reg_id and p.runner_index=idx;

    if r.category_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'birth_date',p.birth_date,
        'gender',p.gender
      ) order by p.runner_index),'[]'::jsonb)
      into all_runners
      from public.restart_participants p
      where p.registration_id=reg_id;

      if not private.restart_category_eligible(r.category_id,all_runners,e.event_date_start) then
        raise exception 'CATEGORY_NOT_ELIGIBLE';
      end if;
    end if;

    insert into public.restart_registration_audit(registration_id,action,actor,data)
    values(reg_id,'EDITED','PUBLIC',jsonb_build_object('runner_index',idx));
    return jsonb_build_object('ok',true,'status',r.status);

  elsif action='TRANSFER' then
    if not coalesce((e.feature_flags->>'transfer_registration')::boolean,false) then raise exception 'TRANSFER_DISABLED'; end if;
    if r.status='CANCELLED' then raise exception 'REGISTRATION_CANCELLED'; end if;
    idx:=coalesce(nullif(p_payload->>'runner_index','')::integer,0);
    if idx<1 or idx>r.runner_count then raise exception 'RUNNER_INDEX_INVALID'; end if;
    new_id:=private.restart_normalize_id(p_payload->>'id_document');
    if new_id is null then raise exception 'RUNNER_ID_REQUIRED'; end if;
    if exists(
      select 1 from public.restart_participants p2
      join public.restart_registrations r2 on r2.id=p2.registration_id
      where p2.event_id=r.event_id and p2.id_normalized=new_id
        and not (p2.registration_id=reg_id and p2.runner_index=idx)
        and r2.status<>'CANCELLED'
    ) then raise exception 'RUNNER_ALREADY_REGISTERED'; end if;

    update public.restart_participants p set
      title=nullif(trim(p_payload->>'title'),''),
      first_name=nullif(trim(p_payload->>'first_name'),''),
      last_name=nullif(trim(p_payload->>'last_name'),''),
      id_document=nullif(trim(p_payload->>'id_document'),''),
      id_normalized=new_id,
      phone=nullif(trim(p_payload->>'phone'),''),
      birth_date=nullif(p_payload->>'birth_date','')::date,
      gender=nullif(p_payload->>'gender',''),
      shirt_size=nullif(p_payload->>'shirt_size',''),
      blood_group=nullif(p_payload->>'blood_group',''),
      address=nullif(trim(p_payload->>'address'),''),
      emergency_phone=nullif(trim(p_payload->>'emergency_phone'),''),
      emergency_relation=nullif(trim(p_payload->>'emergency_relation'),'')
    where p.registration_id=reg_id and p.runner_index=idx;

    if r.category_id is not null then
      select coalesce(jsonb_agg(jsonb_build_object(
        'birth_date',p.birth_date,
        'gender',p.gender
      ) order by p.runner_index),'[]'::jsonb)
      into all_runners
      from public.restart_participants p
      where p.registration_id=reg_id;

      if not private.restart_category_eligible(r.category_id,all_runners,e.event_date_start) then
        raise exception 'CATEGORY_NOT_ELIGIBLE';
      end if;
    end if;

    if coalesce((e.feature_flags->>'insurance')::boolean,false) then
      beneficiaries:=coalesce(p_payload->'beneficiaries','[]'::jsonb);

      select array_agg(private.restart_normalize_id(x->>'id_document'))
      into bene_ids
      from jsonb_array_elements(beneficiaries) x;

      if bene_ids is not null and
         (select count(*) from unnest(bene_ids) x where x is not null) <>
         (select count(distinct x) from unnest(bene_ids) x where x is not null) then
        raise exception 'DUPLICATE_BENEFICIARY_ID';
      end if;

      if bene_ids is not null and exists(
        select 1
        from public.restart_participants p3
        where p3.registration_id=reg_id
          and p3.id_normalized is not null
          and p3.id_normalized = any(bene_ids)
      ) then
        raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER';
      end if;

      delete from public.restart_beneficiaries where registration_id=reg_id and runner_index=idx;
      if coalesce((e.feature_flags->>'beneficiary_total_100')::boolean,true)
         and abs(coalesce((select sum((x->>'percentage')::numeric) from jsonb_array_elements(beneficiaries)x),0)-100)>0.001 then
        raise exception 'BENEFICIARY_TOTAL_MUST_BE_100';
      end if;
      for b in select * from jsonb_array_elements(beneficiaries)
      loop
        insert into public.restart_beneficiaries(
          registration_id,runner_index,full_name,address,id_document,phone,relationship,percentage
        ) values(
          reg_id,idx,trim(b->>'full_name'),nullif(trim(b->>'address'),''),
          trim(b->>'id_document'),nullif(trim(b->>'phone'),''),
          trim(b->>'relationship'),(b->>'percentage')::numeric
        );
      end loop;
    end if;

    insert into public.restart_registration_audit(registration_id,action,actor,data)
    values(reg_id,'TRANSFERRED','PUBLIC',jsonb_build_object('runner_index',idx,'new_id',new_id));
    return jsonb_build_object('ok',true,'status',r.status);
  end if;

  raise exception 'ACTION_NOT_SUPPORTED';
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_manage_registration_lookup(p_event_slug text, p_registration_code text, p_id_document text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  reg_id uuid;
  r public.restart_registrations%rowtype;
  e public.restart_events%rowtype;
  participants jsonb;
  followers jsonb;
  merchandise jsonb;
  schedules jsonb;
begin
  reg_id:=private.restart_authorize_registration(p_event_slug,p_registration_code,p_id_document,true);
  select * into r from public.restart_registrations where id=reg_id;
  select * into e from public.restart_events where id=r.event_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'runner_index',p.runner_index,'title',p.title,'first_name',p.first_name,'last_name',p.last_name,
    'id_document',p.id_document,'phone',p.phone,'birth_date',p.birth_date,'gender',p.gender,
    'shirt_size',p.shirt_size,'blood_group',p.blood_group,'address',p.address,
    'emergency_phone',p.emergency_phone,'emergency_relation',p.emergency_relation
  ) order by p.runner_index),'[]'::jsonb)
  into participants
  from public.restart_participants p where p.registration_id=reg_id;

  select coalesce(jsonb_agg(to_jsonb(f) - 'id' - 'registration_id' - 'id_normalized' - 'created_at'
    order by f.follower_index),'[]'::jsonb)
  into followers
  from public.restart_followers f where f.registration_id=reg_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name',m.product_name_snapshot,
    'product_code',m.product_code_snapshot,
    'size_label',m.size_label_snapshot,
    'sku',m.sku_snapshot,
    'qty',m.qty,
    'unit_price_thb',m.unit_price_thb,
    'total_price_thb',m.total_price_thb,
    'status',m.status
  ) order by m.created_at),'[]'::jsonb)
  into merchandise
  from public.restart_merch_order_items m
  where m.registration_id=reg_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'installment_no',s.installment_no,'amount_due_thb',s.amount_due_thb,
    'due_at',s.due_at,'status',s.status
  ) order by s.installment_no),'[]'::jsonb)
  into schedules
  from public.restart_payment_schedule s where s.registration_id=reg_id;

  return jsonb_build_object(
    'registration_id',reg_id,'registration_code',r.registration_code,'registration_type',r.registration_type,
    'group_name',r.group_name,'contact_runner_index',r.contact_runner_index,'runner_count',r.runner_count,
    'status',r.status,'total_amount_thb',r.total_amount_thb,
    'merchandise_amount_thb',r.merchandise_amount_thb,
    'merchandise',merchandise,
    'can_edit',coalesce((e.feature_flags->>'edit_after_submit')::boolean,false),
    'can_cancel',coalesce((e.feature_flags->>'cancellation')::boolean,false),
    'can_transfer',coalesce((e.feature_flags->>'transfer_registration')::boolean,false),
    'participants',participants,'followers',followers,'payment_schedule',schedules
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_price_quote_full(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  base jsonb;
  merch jsonb;
  race_total numeric;
  merch_total numeric;
begin
  base:=private.restart_compute_quote(
    nullif(p_payload->>'event_id','')::uuid,
    nullif(p_payload->>'category_id','')::uuid,
    nullif(p_payload->>'package_id','')::uuid,
    upper(coalesce(nullif(p_payload->>'registration_type',''),'SINGLE')),
    greatest(1,coalesce(nullif(p_payload->>'runner_count','')::integer,1)),
    nullif(trim(coalesce(p_payload->>'discount_code','')),''),
    coalesce(p_payload->'runners','[]'::jsonb)
  );
  merch:=private.restart_merch_quote(
    nullif(p_payload->>'event_id','')::uuid,
    coalesce(p_payload->'merch_items','[]'::jsonb)
  );
  race_total:=coalesce((base->>'total_amount_thb')::numeric,0);
  merch_total:=coalesce((merch->>'merchandise_amount_thb')::numeric,0);

  return base || jsonb_build_object(
    'registration_amount_thb',race_total,
    'merchandise_amount_thb',merch_total,
    'merch_items',coalesce(merch->'items','[]'::jsonb),
    'total_amount_thb',round(race_total+merch_total,2)
  );
end;
$function$;


revoke all on function private.restart_merch_quote(uuid,jsonb) from public,anon,authenticated;
grant execute on function private.restart_merch_quote(uuid,jsonb) to service_role;

revoke all on function public.restart_price_quote_full(jsonb) from public,anon,authenticated;
grant execute on function public.restart_price_quote_full(jsonb) to service_role;

revoke all on function public.restart_create_registration(jsonb) from public,anon,authenticated;
grant execute on function public.restart_create_registration(jsonb) to service_role;

revoke all on function public.restart_manage_registration_lookup(text,text,text) from public,anon,authenticated;
grant execute on function public.restart_manage_registration_lookup(text,text,text) to service_role;

revoke all on function public.restart_manage_registration_action(text,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.restart_manage_registration_action(text,text,text,text,jsonb) to service_role;

commit;
