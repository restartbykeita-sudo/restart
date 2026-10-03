-- RESTART Registration System - Generic Event Store
-- Snapshot: 2026-10-03
-- Depends on 001_registration_platform_patch.sql, 002_full_registration_system.sql and 003_shirt_sales.sql.
-- This migration separates merchandise sales from race registration and turns the product catalog
-- into a generic Event Store with arbitrary choices/variants, independent orders and payments.

begin;

update public.restart_events
set feature_flags=(coalesce(feature_flags,'{}'::jsonb)-'shirt_sales')
                  || jsonb_build_object('storefront',coalesce((feature_flags->>'storefront')::boolean,false));

alter table public.restart_merch_products
  add column if not exists category text,
  add column if not exists product_type text not null default 'GENERAL',
  add column if not exists option_schema jsonb not null default '[]'::jsonb,
  add column if not exists max_per_order integer not null default 10,
  add column if not exists badge jsonb not null default '{}'::jsonb,
  add column if not exists is_featured boolean not null default false;

alter table public.restart_merch_products
  drop constraint if exists restart_merch_products_max_per_order_check;
alter table public.restart_merch_products
  add constraint restart_merch_products_max_per_order_check
  check(max_per_order between 1 and 100);

alter table public.restart_merch_variants
  add column if not exists variant_name jsonb not null default '{}'::jsonb,
  add column if not exists option_values jsonb not null default '{}'::jsonb,
  add column if not exists price_override_thb numeric,
  add column if not exists badge jsonb not null default '{}'::jsonb;

alter table public.restart_merch_variants
  drop constraint if exists restart_merch_variants_price_override_thb_check;
alter table public.restart_merch_variants
  add constraint restart_merch_variants_price_override_thb_check
  check(price_override_thb is null or price_override_thb>=0);

create table if not exists public.restart_store_settings(
  event_id uuid primary key references public.restart_events(id) on delete cascade,
  store_name jsonb not null default '{}'::jsonb,
  is_open boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  shipping_fee_thb numeric not null default 0 check(shipping_fee_thb>=0),
  pickup_note jsonb not null default '{}'::jsonb,
  delivery_note jsonb not null default '{}'::jsonb,
  terms jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.restart_store_orders(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.restart_events(id) on delete cascade,
  order_code text not null unique,
  language text not null default 'th',
  customer_name text not null,
  phone text not null,
  email text,
  delivery_method text not null default 'PICKUP'
    check(delivery_method in ('PICKUP','DELIVERY')),
  delivery_address text,
  customer_note text,
  subtotal_amount_thb numeric not null default 0 check(subtotal_amount_thb>=0),
  shipping_fee_thb numeric not null default 0 check(shipping_fee_thb>=0),
  total_amount_thb numeric not null default 0 check(total_amount_thb>=0),
  payment_method_id uuid references public.restart_payment_methods(id) on delete set null,
  payment_method_snapshot jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING_PAYMENT'
    check(status in ('PENDING_PAYMENT','PENDING_REVIEW','PAID','PREPARING','READY','FULFILLED','SHIPPED','CANCELLED')),
  payment_status text not null default 'PENDING'
    check(payment_status in ('PENDING','PENDING_REVIEW','APPROVED','REJECTED','REFUNDED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  cancelled_at timestamptz,
  cancelled_reason text
);

create table if not exists public.restart_store_order_items(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restart_store_orders(id) on delete cascade,
  event_id uuid not null references public.restart_events(id) on delete cascade,
  product_id uuid references public.restart_merch_products(id) on delete set null,
  variant_id uuid references public.restart_merch_variants(id) on delete set null,
  product_code_snapshot text,
  product_name_snapshot jsonb not null default '{}'::jsonb,
  variant_name_snapshot jsonb not null default '{}'::jsonb,
  option_values_snapshot jsonb not null default '{}'::jsonb,
  sku_snapshot text,
  qty integer not null check(qty>0),
  unit_price_thb numeric not null check(unit_price_thb>=0),
  total_price_thb numeric not null check(total_price_thb>=0),
  created_at timestamptz not null default now()
);

create table if not exists public.restart_store_payments(
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.restart_store_orders(id) on delete cascade,
  amount_thb numeric not null check(amount_thb>=0),
  slip_path text,
  status text not null default 'PENDING_REVIEW'
    check(status in ('PENDING_REVIEW','APPROVED','REJECTED','REFUNDED')),
  admin_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create index if not exists restart_store_orders_event_created_idx on public.restart_store_orders(event_id,created_at desc);
create index if not exists restart_store_orders_status_idx on public.restart_store_orders(event_id,status);
create index if not exists restart_store_orders_phone_idx on public.restart_store_orders(event_id,phone);
create index if not exists restart_store_order_items_order_idx on public.restart_store_order_items(order_id);
create index if not exists restart_store_order_items_variant_idx on public.restart_store_order_items(variant_id);
create index if not exists restart_store_payments_order_idx on public.restart_store_payments(order_id,created_at desc);

alter table public.restart_store_settings enable row level security;
alter table public.restart_store_orders enable row level security;
alter table public.restart_store_order_items enable row level security;
alter table public.restart_store_payments enable row level security;

drop policy if exists restart_store_settings_public_read on public.restart_store_settings;
create policy restart_store_settings_public_read on public.restart_store_settings
for select to anon using (true);

drop policy if exists restart_store_settings_admin_all on public.restart_store_settings;
create policy restart_store_settings_admin_all on public.restart_store_settings
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

drop policy if exists restart_store_orders_admin_all on public.restart_store_orders;
create policy restart_store_orders_admin_all on public.restart_store_orders
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

drop policy if exists restart_store_order_items_admin_all on public.restart_store_order_items;
create policy restart_store_order_items_admin_all on public.restart_store_order_items
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

drop policy if exists restart_store_payments_admin_all on public.restart_store_payments;
create policy restart_store_payments_admin_all on public.restart_store_payments
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

drop policy if exists restart_merch_products_public_read on public.restart_merch_products;
create policy restart_merch_products_public_read on public.restart_merch_products
for select to anon
using (
  is_active=true
  and (sale_starts_at is null or now()>=sale_starts_at)
  and (sale_ends_at is null or now()<=sale_ends_at)
);

drop policy if exists restart_merch_variants_public_read on public.restart_merch_variants;
create policy restart_merch_variants_public_read on public.restart_merch_variants
for select to anon
using (
  is_active=true and exists(
    select 1 from public.restart_merch_products p
    where p.id=product_id and p.is_active=true
      and (p.sale_starts_at is null or now()>=p.sale_starts_at)
      and (p.sale_ends_at is null or now()<=p.sale_ends_at)
  )
);

grant select on public.restart_store_settings to anon,authenticated;
grant select,insert,update,delete on public.restart_store_settings to authenticated;
grant select,insert,update,delete on public.restart_store_orders,public.restart_store_order_items,public.restart_store_payments to authenticated;
grant select on public.restart_merch_products,public.restart_merch_variants to anon,authenticated;

CREATE OR REPLACE FUNCTION private.restart_store_quote(p_event_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_delivery_method text DEFAULT 'PICKUP'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  settings public.restart_store_settings%rowtype;
  v public.restart_merch_variants%rowtype;
  p public.restart_merch_products%rowtype;
  rec record;
  unit_price numeric;
  line_total numeric;
  subtotal numeric:=0;
  shipping numeric:=0;
  product_total integer;
  normalized jsonb:='[]'::jsonb;
  delivery text:=upper(coalesce(nullif(trim(p_delivery_method),''),'PICKUP'));
begin
  select * into e from public.restart_events where id=p_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if not coalesce((e.feature_flags->>'storefront')::boolean,false) then
    raise exception 'STOREFRONT_DISABLED';
  end if;

  select * into settings from public.restart_store_settings where event_id=p_event_id;
  if found then
    if not settings.is_open then raise exception 'STORE_CLOSED'; end if;
    if delivery='PICKUP' and not settings.pickup_enabled then raise exception 'PICKUP_DISABLED'; end if;
    if delivery='DELIVERY' and not settings.delivery_enabled then raise exception 'DELIVERY_DISABLED'; end if;
    shipping:=case when delivery='DELIVERY' then settings.shipping_fee_thb else 0 end;
  else
    if delivery<>'PICKUP' then raise exception 'DELIVERY_DISABLED'; end if;
  end if;

  if delivery not in ('PICKUP','DELIVERY') then raise exception 'DELIVERY_METHOD_INVALID'; end if;

  for rec in
    select (x->>'variant_id')::uuid as variant_id,
           sum(greatest(0,coalesce(nullif(x->>'qty','')::integer,0)))::integer as qty
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    where nullif(x->>'variant_id','') is not null
    group by 1
    order by 1
  loop
    if rec.qty<1 then continue; end if;
    if rec.qty>100 then raise exception 'STORE_QTY_INVALID'; end if;

    select * into v from public.restart_merch_variants
    where id=rec.variant_id and is_active=true;
    if not found then raise exception 'STORE_VARIANT_NOT_AVAILABLE'; end if;

    select * into p from public.restart_merch_products
    where id=v.product_id and event_id=p_event_id and is_active=true;
    if not found then raise exception 'STORE_PRODUCT_NOT_AVAILABLE'; end if;
    if p.sale_starts_at is not null and now()<p.sale_starts_at then raise exception 'STORE_SALE_NOT_OPEN'; end if;
    if p.sale_ends_at is not null and now()>p.sale_ends_at then raise exception 'STORE_SALE_CLOSED'; end if;

    select coalesce(sum(greatest(0,coalesce(nullif(x->>'qty','')::integer,0))),0)::integer
    into product_total
    from jsonb_array_elements(coalesce(p_items,'[]'::jsonb)) x
    join public.restart_merch_variants vx on vx.id=(x->>'variant_id')::uuid
    where vx.product_id=p.id;

    if product_total>coalesce(p.max_per_order,p.max_per_registration,10) then
      raise exception 'STORE_MAX_PER_ORDER';
    end if;
    if rec.qty>greatest(0,v.stock_qty-v.sold_qty) then
      raise exception 'STORE_OUT_OF_STOCK:%',coalesce(v.variant_name->>'th',v.size_label);
    end if;

    unit_price:=greatest(0,coalesce(v.price_override_thb,p.price_thb+coalesce(v.price_adjustment_thb,0)));
    line_total:=round(unit_price*rec.qty,2);
    subtotal:=subtotal+line_total;

    normalized:=normalized||jsonb_build_array(jsonb_build_object(
      'product_id',p.id,'variant_id',v.id,
      'product_code',p.code,'product_name',p.name,
      'variant_name',case when v.variant_name='{}'::jsonb then jsonb_build_object('th',v.size_label,'en',v.size_label) else v.variant_name end,
      'option_values',v.option_values,'badge',v.badge,
      'sku',v.sku,'qty',rec.qty,
      'unit_price_thb',unit_price,'total_price_thb',line_total
    ));
  end loop;

  if jsonb_array_length(normalized)=0 then raise exception 'STORE_CART_EMPTY'; end if;

  return jsonb_build_object(
    'subtotal_amount_thb',round(subtotal,2),
    'shipping_fee_thb',round(shipping,2),
    'total_amount_thb',round(subtotal+shipping,2),
    'delivery_method',delivery,
    'items',normalized
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_admin_review_store_payment(p_payment_id uuid, p_decision text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  pay public.restart_store_payments%rowtype;
  decision text:=upper(trim(p_decision));
begin
  if not private.restart_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if decision not in ('APPROVE','REJECT') then raise exception 'DECISION_INVALID'; end if;

  select * into pay from public.restart_store_payments where id=p_payment_id for update;
  if not found then raise exception 'STORE_PAYMENT_NOT_FOUND'; end if;
  if pay.status<>'PENDING_REVIEW' then raise exception 'STORE_PAYMENT_ALREADY_REVIEWED'; end if;

  update public.restart_store_payments
  set status=case when decision='APPROVE' then 'APPROVED' else 'REJECTED' end,
      admin_note=nullif(trim(coalesce(p_note,'')),''),
      reviewed_at=now(),reviewed_by=auth.uid()
  where id=pay.id;

  if decision='APPROVE' then
    update public.restart_store_orders
    set status='PAID',payment_status='APPROVED',paid_at=now(),updated_at=now()
    where id=pay.order_id and status<>'CANCELLED';
  else
    update public.restart_store_orders
    set status='PENDING_PAYMENT',payment_status='REJECTED',updated_at=now()
    where id=pay.order_id and status<>'CANCELLED';
  end if;

  return jsonb_build_object('ok',true,'decision',decision,'order_id',pay.order_id);
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_admin_update_store_order_status(p_order_id uuid, p_status text, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  o public.restart_store_orders%rowtype;
  new_status text:=upper(trim(p_status));
  x record;
begin
  if not private.restart_is_admin() then raise exception 'ADMIN_REQUIRED'; end if;
  if new_status not in ('PAID','PREPARING','READY','FULFILLED','SHIPPED','CANCELLED') then
    raise exception 'STORE_STATUS_INVALID';
  end if;

  select * into o from public.restart_store_orders where id=p_order_id for update;
  if not found then raise exception 'STORE_ORDER_NOT_FOUND'; end if;
  if o.status='CANCELLED' then raise exception 'STORE_ORDER_ALREADY_CANCELLED'; end if;

  if new_status='CANCELLED' then
    for x in
      select variant_id,sum(qty)::integer qty
      from public.restart_store_order_items
      where order_id=o.id and variant_id is not null
      group by variant_id
      order by variant_id
    loop
      update public.restart_merch_variants
      set sold_qty=greatest(0,sold_qty-x.qty),updated_at=now()
      where id=x.variant_id;
    end loop;

    update public.restart_store_orders
    set status='CANCELLED',cancelled_at=now(),
        cancelled_reason=nullif(trim(coalesce(p_note,'')),''),
        updated_at=now()
    where id=o.id;
  else
    if new_status in ('PREPARING','READY','FULFILLED','SHIPPED')
       and o.payment_status<>'APPROVED' then raise exception 'STORE_PAYMENT_NOT_APPROVED'; end if;
    update public.restart_store_orders
    set status=new_status,
        fulfilled_at=case when new_status in ('FULFILLED','SHIPPED') then now() else fulfilled_at end,
        updated_at=now()
    where id=o.id;
  end if;

  return jsonb_build_object('ok',true,'order_id',o.id,'status',new_status);
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

CREATE OR REPLACE FUNCTION public.restart_create_store_order(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  q jsonb;
  item jsonb;
  v public.restart_merch_variants%rowtype;
  payment public.restart_payment_methods%rowtype;
  v_event_id uuid:=nullif(p_payload->>'event_id','')::uuid;
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
  select * into e from public.restart_events where id=v_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  if customer_name is null then raise exception 'CUSTOMER_NAME_REQUIRED'; end if;
  if phone is null then raise exception 'PHONE_REQUIRED'; end if;
  if delivery='DELIVERY' and address is null then raise exception 'DELIVERY_ADDRESS_REQUIRED'; end if;

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
    select * into v
    from public.restart_merch_variants
    where id=(item->>'variant_id')::uuid and is_active=true
    for update;
    if not found then raise exception 'STORE_VARIANT_NOT_AVAILABLE'; end if;
    if (item->>'qty')::integer>greatest(0,v.stock_qty-v.sold_qty) then
      raise exception 'STORE_OUT_OF_STOCK:%',coalesce(v.variant_name->>'th',v.size_label);
    end if;
  end loop;

  q:=private.restart_store_quote(v_event_id,coalesce(p_payload->'items','[]'::jsonb),delivery);
  total:=coalesce((q->>'total_amount_thb')::numeric,0);
  if claimed>=0 and abs(claimed-total)>0.01 then raise exception 'STORE_PRICE_MISMATCH'; end if;

  if total>0 then
    if v_payment_method_id is null then raise exception 'PAYMENT_METHOD_REQUIRED'; end if;
    select pm.* into payment from public.restart_payment_methods pm
    where pm.id=v_payment_method_id and pm.event_id=v_event_id and pm.is_enabled=true;
    if not found then raise exception 'PAYMENT_METHOD_NOT_AVAILABLE'; end if;
    if slip_path is null then raise exception 'SLIP_REQUIRED'; end if;
    new_status:='PENDING_REVIEW';
  else
    new_status:='PAID';
  end if;

  order_code:='SHOP-'||to_char(clock_timestamp(),'YYMMDDHH24MISS')||'-'||
              upper(substr(replace(gen_random_uuid()::text,'-',''),1,6));

  insert into public.restart_store_orders(
    event_id,order_code,language,customer_name,phone,email,
    delivery_method,delivery_address,customer_note,
    subtotal_amount_thb,shipping_fee_thb,total_amount_thb,
    payment_method_id,payment_method_snapshot,status,payment_status,paid_at
  ) values(
    v_event_id,order_code,coalesce(nullif(p_payload->>'language',''),'th'),
    customer_name,phone,nullif(trim(coalesce(p_payload->>'email','')),''),
    delivery,address,nullif(trim(coalesce(p_payload->>'customer_note','')),''),
    (q->>'subtotal_amount_thb')::numeric,
    (q->>'shipping_fee_thb')::numeric,total,
    v_payment_method_id,
    case when v_payment_method_id is null then '{}'::jsonb else jsonb_build_object(
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
      order_id,event_id,product_id,variant_id,
      product_code_snapshot,product_name_snapshot,variant_name_snapshot,
      option_values_snapshot,sku_snapshot,qty,unit_price_thb,total_price_thb
    ) values(
      order_id,v_event_id,
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

  if total>0 then
    insert into public.restart_store_payments(order_id,amount_thb,slip_path,status)
    values(order_id,total,slip_path,'PENDING_REVIEW');
  end if;

  return jsonb_build_object(
    'id',order_id,'order_code',order_code,'status',new_status,
    'payment_status',case when total>0 then 'PENDING_REVIEW' else 'APPROVED' end,
    'subtotal_amount_thb',(q->>'subtotal_amount_thb')::numeric,
    'shipping_fee_thb',(q->>'shipping_fee_thb')::numeric,
    'total_amount_thb',total,
    'items',q->'items'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_lookup_store_order(p_event_slug text, p_order_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  o public.restart_store_orders%rowtype;
  items jsonb;
begin
  select so.* into o
  from public.restart_store_orders so
  join public.restart_events e on e.id=so.event_id
  where e.slug=p_event_slug
    and upper(so.order_code)=upper(trim(p_order_code))
    and regexp_replace(so.phone,'[^0-9A-Za-z]','','g')=
        regexp_replace(trim(p_phone),'[^0-9A-Za-z]','','g')
  limit 1;
  if not found then raise exception 'STORE_ORDER_NOT_FOUND'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name',i.product_name_snapshot,
    'variant_name',i.variant_name_snapshot,
    'option_values',i.option_values_snapshot,
    'sku',i.sku_snapshot,'qty',i.qty,
    'unit_price_thb',i.unit_price_thb,'total_price_thb',i.total_price_thb
  ) order by i.created_at),'[]'::jsonb)
  into items
  from public.restart_store_order_items i where i.order_id=o.id;

  return jsonb_build_object(
    'order_code',o.order_code,'customer_name',o.customer_name,
    'delivery_method',o.delivery_method,'delivery_address',o.delivery_address,
    'subtotal_amount_thb',o.subtotal_amount_thb,
    'shipping_fee_thb',o.shipping_fee_thb,'total_amount_thb',o.total_amount_thb,
    'status',o.status,'payment_status',o.payment_status,
    'created_at',o.created_at,'items',items
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_store_quote(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
  select private.restart_store_quote(
    nullif(p_payload->>'event_id','')::uuid,
    coalesce(p_payload->'items','[]'::jsonb),
    coalesce(p_payload->>'delivery_method','PICKUP')
  )
$function$;

CREATE OR REPLACE FUNCTION public.restart_submit_store_payment(p_event_slug text, p_order_code text, p_phone text, p_slip_path text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  o public.restart_store_orders%rowtype;
  payment_id uuid;
begin
  if nullif(trim(coalesce(p_slip_path,'')),'') is null then raise exception 'SLIP_REQUIRED'; end if;
  select so.* into o
  from public.restart_store_orders so
  join public.restart_events e on e.id=so.event_id
  where e.slug=p_event_slug
    and upper(so.order_code)=upper(trim(p_order_code))
    and regexp_replace(so.phone,'[^0-9A-Za-z]','','g')=
        regexp_replace(trim(p_phone),'[^0-9A-Za-z]','','g')
  for update;
  if not found then raise exception 'STORE_ORDER_NOT_FOUND'; end if;
  if o.status in ('CANCELLED','FULFILLED','SHIPPED') then raise exception 'STORE_ORDER_CLOSED'; end if;
  if o.payment_status='APPROVED' then raise exception 'STORE_ALREADY_PAID'; end if;
  if exists(select 1 from public.restart_store_payments where order_id=o.id and status='PENDING_REVIEW') then
    raise exception 'STORE_PAYMENT_ALREADY_PENDING';
  end if;

  insert into public.restart_store_payments(order_id,amount_thb,slip_path,status)
  values(o.id,o.total_amount_thb,p_slip_path,'PENDING_REVIEW')
  returning id into payment_id;

  update public.restart_store_orders
  set status='PENDING_REVIEW',payment_status='PENDING_REVIEW',updated_at=now()
  where id=o.id;

  return jsonb_build_object(
    'payment_id',payment_id,'order_code',o.order_code,
    'status','PENDING_REVIEW','payment_status','PENDING_REVIEW'
  );
end;
$function$;


revoke all on function private.restart_store_quote(uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.restart_store_quote(uuid,jsonb,text) to service_role;

revoke all on function public.restart_store_quote(jsonb) from public,anon,authenticated;
grant execute on function public.restart_store_quote(jsonb) to service_role;

revoke all on function public.restart_create_store_order(jsonb) from public,anon,authenticated;
grant execute on function public.restart_create_store_order(jsonb) to service_role;

revoke all on function public.restart_lookup_store_order(text,text,text) from public,anon,authenticated;
grant execute on function public.restart_lookup_store_order(text,text,text) to service_role;

revoke all on function public.restart_submit_store_payment(text,text,text,text) from public,anon,authenticated;
grant execute on function public.restart_submit_store_payment(text,text,text,text) to service_role;

revoke all on function public.restart_admin_review_store_payment(uuid,text,text) from public,anon;
grant execute on function public.restart_admin_review_store_payment(uuid,text,text) to authenticated;

revoke all on function public.restart_admin_update_store_order_status(uuid,text,text) from public,anon;
grant execute on function public.restart_admin_update_store_order_status(uuid,text,text) to authenticated;

revoke all on function public.restart_create_registration(jsonb) from public,anon,authenticated;
grant execute on function public.restart_create_registration(jsonb) to service_role;

commit;
