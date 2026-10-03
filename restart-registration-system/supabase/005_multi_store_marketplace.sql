-- RESTART Registration System - Multi-store Event Marketplace
-- Snapshot: 2026-10-03
-- Depends on 004_event_store.sql.
-- Adds multiple isolated stores per Event with distinct links, products, orders and payment methods.

begin;

create table if not exists public.restart_stores(
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.restart_events(id) on delete cascade,
  slug text not null,
  name jsonb not null default '{}'::jsonb,
  description jsonb not null default '{}'::jsonb,
  logo_url text,
  logo_storage_path text,
  banner_url text,
  banner_storage_path text,
  is_open boolean not null default true,
  pickup_enabled boolean not null default true,
  delivery_enabled boolean not null default false,
  shipping_fee_thb numeric not null default 0 check(shipping_fee_thb>=0),
  pickup_note jsonb not null default '{}'::jsonb,
  delivery_note jsonb not null default '{}'::jsonb,
  terms jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint restart_stores_slug_format check(slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint restart_stores_event_slug_key unique(event_id,slug)
);

create table if not exists public.restart_store_payment_methods(
  id uuid primary key default gen_random_uuid(),
  store_id uuid not null references public.restart_stores(id) on delete cascade,
  source_payment_method_id uuid references public.restart_payment_methods(id) on delete set null,
  kind text not null check(kind in ('PROMPTPAY','BANK')),
  label text,
  bank_name text,
  account_name text,
  account_number text,
  promptpay_type text,
  promptpay_id text,
  qr_enabled boolean not null default true,
  is_enabled boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.restart_merch_products
  add column if not exists store_id uuid references public.restart_stores(id) on delete cascade;

alter table public.restart_store_orders
  add column if not exists store_id uuid references public.restart_stores(id) on delete restrict,
  add column if not exists store_payment_method_id uuid references public.restart_store_payment_methods(id) on delete set null;

alter table public.restart_store_order_items
  add column if not exists store_id uuid references public.restart_stores(id) on delete restrict;

insert into public.restart_stores(
  event_id,slug,name,is_open,pickup_enabled,delivery_enabled,shipping_fee_thb,
  pickup_note,delivery_note,terms,sort_order
)
select
  e.id,'official-store',
  coalesce(ss.store_name,jsonb_build_object('th',e.name||' Store','en',e.name||' Store')),
  coalesce(ss.is_open,true),
  coalesce(ss.pickup_enabled,true),
  coalesce(ss.delivery_enabled,false),
  coalesce(ss.shipping_fee_thb,0),
  coalesce(ss.pickup_note,'{}'::jsonb),
  coalesce(ss.delivery_note,'{}'::jsonb),
  coalesce(ss.terms,'{}'::jsonb),
  0
from public.restart_events e
left join public.restart_store_settings ss on ss.event_id=e.id
where
  ss.event_id is not null
  or exists(select 1 from public.restart_merch_products p where p.event_id=e.id)
  or exists(select 1 from public.restart_store_orders o where o.event_id=e.id)
on conflict(event_id,slug) do nothing;

update public.restart_merch_products p
set store_id=s.id
from public.restart_stores s
where p.store_id is null and s.event_id=p.event_id and s.slug='official-store';

update public.restart_store_orders o
set store_id=s.id
from public.restart_stores s
where o.store_id is null and s.event_id=o.event_id and s.slug='official-store';

update public.restart_store_order_items i
set store_id=o.store_id
from public.restart_store_orders o
where i.order_id=o.id and i.store_id is null and o.store_id is not null;

update public.restart_store_order_items i
set store_id=s.id
from public.restart_stores s
where i.store_id is null and s.event_id=i.event_id and s.slug='official-store';

insert into public.restart_store_payment_methods(
  store_id,source_payment_method_id,kind,label,bank_name,account_name,account_number,
  promptpay_type,promptpay_id,qr_enabled,is_enabled,sort_order
)
select
  s.id,pm.id,pm.kind,pm.label,pm.bank_name,pm.account_name,pm.account_number,
  pm.promptpay_type,pm.promptpay_id,pm.qr_enabled,pm.is_enabled,pm.sort_order
from public.restart_stores s
join public.restart_payment_methods pm on pm.event_id=s.event_id
where s.slug='official-store'
  and not exists(
    select 1 from public.restart_store_payment_methods spm
    where spm.store_id=s.id and spm.source_payment_method_id=pm.id
  );

alter table public.restart_merch_products drop constraint if exists restart_merch_products_event_id_code_key;
alter table public.restart_merch_products drop constraint if exists restart_merch_products_store_id_code_key;
alter table public.restart_merch_products
  add constraint restart_merch_products_store_id_code_key unique(store_id,code);

alter table public.restart_merch_products alter column store_id set not null;
alter table public.restart_store_orders alter column store_id set not null;
alter table public.restart_store_order_items alter column store_id set not null;

create index if not exists restart_stores_event_sort_idx on public.restart_stores(event_id,sort_order,created_at);
create index if not exists restart_store_payment_methods_store_idx on public.restart_store_payment_methods(store_id,sort_order);
create unique index if not exists restart_store_payment_methods_source_uidx
  on public.restart_store_payment_methods(store_id,source_payment_method_id)
  where source_payment_method_id is not null;
create index if not exists restart_merch_products_store_idx on public.restart_merch_products(store_id,sort_order);
create index if not exists restart_store_orders_store_created_idx on public.restart_store_orders(store_id,created_at desc);
create index if not exists restart_store_order_items_store_idx on public.restart_store_order_items(store_id);

alter table public.restart_stores enable row level security;
alter table public.restart_store_payment_methods enable row level security;

drop policy if exists restart_stores_public_read on public.restart_stores;
create policy restart_stores_public_read on public.restart_stores
for select to anon
using (
  is_open=true and exists(
    select 1 from public.restart_events e
    where e.id=event_id and coalesce((e.feature_flags->>'storefront')::boolean,false)
  )
);

drop policy if exists restart_stores_admin_all on public.restart_stores;
create policy restart_stores_admin_all on public.restart_stores
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

drop policy if exists restart_store_payment_methods_public_read on public.restart_store_payment_methods;
create policy restart_store_payment_methods_public_read on public.restart_store_payment_methods
for select to anon
using (
  is_enabled=true and exists(
    select 1 from public.restart_stores s
    join public.restart_events e on e.id=s.event_id
    where s.id=store_id and s.is_open=true
      and coalesce((e.feature_flags->>'storefront')::boolean,false)
  )
);

drop policy if exists restart_store_payment_methods_admin_all on public.restart_store_payment_methods;
create policy restart_store_payment_methods_admin_all on public.restart_store_payment_methods
for all to authenticated
using ((select private.restart_is_admin()))
with check ((select private.restart_is_admin()));

grant select on public.restart_stores,public.restart_store_payment_methods to anon,authenticated;
grant insert,update,delete on public.restart_stores,public.restart_store_payment_methods to authenticated;

drop policy if exists restart_merch_products_public_read on public.restart_merch_products;
create policy restart_merch_products_public_read on public.restart_merch_products
for select to anon
using (
  is_active=true
  and (sale_starts_at is null or now()>=sale_starts_at)
  and (sale_ends_at is null or now()<=sale_ends_at)
  and exists(
    select 1 from public.restart_stores s
    join public.restart_events e on e.id=s.event_id
    where s.id=store_id and s.is_open=true
      and coalesce((e.feature_flags->>'storefront')::boolean,false)
  )
);

drop policy if exists restart_merch_variants_public_read on public.restart_merch_variants;
create policy restart_merch_variants_public_read on public.restart_merch_variants
for select to anon
using (
  is_active=true and exists(
    select 1 from public.restart_merch_products p
    join public.restart_stores s on s.id=p.store_id
    join public.restart_events e on e.id=s.event_id
    where p.id=product_id and p.is_active=true
      and (p.sale_starts_at is null or now()>=p.sale_starts_at)
      and (p.sale_ends_at is null or now()<=p.sale_ends_at)
      and s.is_open=true
      and coalesce((e.feature_flags->>'storefront')::boolean,false)
  )
);

CREATE OR REPLACE FUNCTION private.restart_store_quote(p_event_id uuid, p_store_id uuid, p_items jsonb DEFAULT '[]'::jsonb, p_delivery_method text DEFAULT 'PICKUP'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  s public.restart_stores%rowtype;
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

  select * into s
  from public.restart_stores
  where id=p_store_id and event_id=p_event_id;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;
  if not s.is_open then raise exception 'STORE_CLOSED'; end if;

  if delivery not in ('PICKUP','DELIVERY') then raise exception 'DELIVERY_METHOD_INVALID'; end if;
  if delivery='PICKUP' and not s.pickup_enabled then raise exception 'PICKUP_DISABLED'; end if;
  if delivery='DELIVERY' and not s.delivery_enabled then raise exception 'DELIVERY_DISABLED'; end if;
  shipping:=case when delivery='DELIVERY' then s.shipping_fee_thb else 0 end;

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

    select mv.* into v
    from public.restart_merch_variants mv
    join public.restart_merch_products mp on mp.id=mv.product_id
    where mv.id=rec.variant_id
      and mv.is_active=true
      and mp.store_id=p_store_id
      and mp.event_id=p_event_id
      and mp.is_active=true;
    if not found then raise exception 'STORE_VARIANT_NOT_AVAILABLE'; end if;

    select * into p
    from public.restart_merch_products
    where id=v.product_id
      and event_id=p_event_id
      and store_id=p_store_id
      and is_active=true;
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
      'store_id',s.id,'store_slug',s.slug,
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
    'store_id',s.id,'store_slug',s.slug,'store_name',s.name,
    'subtotal_amount_thb',round(subtotal,2),
    'shipping_fee_thb',round(shipping,2),
    'total_amount_thb',round(subtotal+shipping,2),
    'delivery_method',delivery,
    'items',normalized
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

  q:=private.restart_store_quote(v_event_id,v_store_id,coalesce(p_payload->'items','[]'::jsonb),delivery);
  total:=coalesce((q->>'total_amount_thb')::numeric,0);
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
    event_id,store_id,order_code,language,customer_name,phone,email,
    delivery_method,delivery_address,customer_note,
    subtotal_amount_thb,shipping_fee_thb,total_amount_thb,
    payment_method_id,store_payment_method_id,payment_method_snapshot,
    status,payment_status,paid_at
  ) values(
    v_event_id,v_store_id,order_code,coalesce(nullif(p_payload->>'language',''),'th'),
    customer_name,phone,nullif(trim(coalesce(p_payload->>'email','')),''),
    delivery,address,nullif(trim(coalesce(p_payload->>'customer_note','')),''),
    (q->>'subtotal_amount_thb')::numeric,
    (q->>'shipping_fee_thb')::numeric,total,
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
    'total_amount_thb',total,
    'items',q->'items'
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_lookup_store_order(p_event_slug text, p_store_slug text, p_order_code text, p_phone text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  o public.restart_store_orders%rowtype;
  s public.restart_stores%rowtype;
  items jsonb;
begin
  select so.* into o
  from public.restart_store_orders so
  join public.restart_events e on e.id=so.event_id
  join public.restart_stores st on st.id=so.store_id
  where e.slug=p_event_slug
    and st.slug=p_store_slug
    and upper(so.order_code)=upper(trim(p_order_code))
    and regexp_replace(so.phone,'[^0-9A-Za-z]','','g')=
        regexp_replace(trim(p_phone),'[^0-9A-Za-z]','','g')
  limit 1;
  if not found then raise exception 'STORE_ORDER_NOT_FOUND'; end if;

  select * into s from public.restart_stores where id=o.store_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_name',i.product_name_snapshot,
    'variant_name',i.variant_name_snapshot,
    'option_values',i.option_values_snapshot,
    'sku',i.sku_snapshot,'qty',i.qty,
    'unit_price_thb',i.unit_price_thb,'total_price_thb',i.total_price_thb
  ) order by i.created_at),'[]'::jsonb)
  into items
  from public.restart_store_order_items i
  where i.order_id=o.id and i.store_id=o.store_id;

  return jsonb_build_object(
    'store_slug',s.slug,'store_name',s.name,
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
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  v_event_id uuid:=nullif(p_payload->>'event_id','')::uuid;
  v_store_slug text:=nullif(trim(coalesce(p_payload->>'store_slug','')),'');
  v_store_id uuid;
begin
  if v_event_id is null then raise exception 'EVENT_REQUIRED'; end if;
  if v_store_slug is null then raise exception 'STORE_SLUG_REQUIRED'; end if;

  select id into v_store_id
  from public.restart_stores
  where event_id=v_event_id and slug=v_store_slug;
  if not found then raise exception 'STORE_NOT_FOUND'; end if;

  return private.restart_store_quote(
    v_event_id,
    v_store_id,
    coalesce(p_payload->'items','[]'::jsonb),
    coalesce(p_payload->>'delivery_method','PICKUP')
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.restart_submit_store_payment(p_event_slug text, p_store_slug text, p_order_code text, p_phone text, p_slip_path text)
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
  join public.restart_stores st on st.id=so.store_id
  where e.slug=p_event_slug
    and st.slug=p_store_slug
    and upper(so.order_code)=upper(trim(p_order_code))
    and regexp_replace(so.phone,'[^0-9A-Za-z]','','g')=
        regexp_replace(trim(p_phone),'[^0-9A-Za-z]','','g')
  for update of so;
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
    'payment_id',payment_id,'store_slug',p_store_slug,'order_code',o.order_code,
    'status','PENDING_REVIEW','payment_status','PENDING_REVIEW'
  );
end;
$function$;


revoke all on function private.restart_store_quote(uuid,uuid,jsonb,text) from public,anon,authenticated;
grant execute on function private.restart_store_quote(uuid,uuid,jsonb,text) to service_role;
revoke all on function public.restart_store_quote(jsonb) from public,anon,authenticated;
grant execute on function public.restart_store_quote(jsonb) to service_role;
revoke all on function public.restart_create_store_order(jsonb) from public,anon,authenticated;
grant execute on function public.restart_create_store_order(jsonb) to service_role;
revoke all on function public.restart_lookup_store_order(text,text,text,text) from public,anon,authenticated;
grant execute on function public.restart_lookup_store_order(text,text,text,text) to service_role;
revoke all on function public.restart_submit_store_payment(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.restart_submit_store_payment(text,text,text,text,text) to service_role;

drop function if exists public.restart_lookup_store_order(text,text,text);
drop function if exists public.restart_submit_store_payment(text,text,text,text);
drop function if exists private.restart_store_quote(uuid,jsonb,text);

commit;
