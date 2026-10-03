-- Validate every submitted identity before registration writes begin.
create or replace function private.restart_validate_registration_identity(p_payload jsonb)
returns void language plpgsql set search_path = '' as $$
declare
  runner jsonb;
  beneficiary jsonb;
  document_id text;
  runner_ids text[] := array[]::text[];
  beneficiary_ids text[] := array[]::text[];
begin
  if jsonb_typeof(p_payload->'runners') is distinct from 'array'
     or jsonb_array_length(p_payload->'runners')=0 then
    raise exception 'RUNNER_REQUIRED';
  end if;
  for runner in select * from jsonb_array_elements(p_payload->'runners') loop
    document_id := private.restart_normalize_id(runner->>'id_document');
    if document_id is null or document_id !~ '^[A-Z0-9]{6,30}$' then
      raise exception 'RUNNER_ID_INVALID';
    end if;
    if document_id=any(runner_ids) then raise exception 'DUPLICATE_RUNNER_ID'; end if;
    runner_ids:=array_append(runner_ids,document_id);
  end loop;
  for runner in select * from jsonb_array_elements(p_payload->'runners') loop
    for beneficiary in select * from jsonb_array_elements(coalesce(runner->'beneficiaries','[]'::jsonb)) loop
      document_id:=private.restart_normalize_id(beneficiary->>'id_document');
      if document_id is null or document_id !~ '^[A-Z0-9]{6,30}$' then
        raise exception 'BENEFICIARY_ID_INVALID';
      end if;
      if document_id=any(runner_ids) then raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER'; end if;
      if document_id=any(beneficiary_ids) then raise exception 'DUPLICATE_BENEFICIARY_ID'; end if;
      beneficiary_ids:=array_append(beneficiary_ids,document_id);
    end loop;
  end loop;
end;
$$;
revoke all on function private.restart_validate_registration_identity(jsonb) from public,anon,authenticated;

create or replace function private.restart_guard_runner_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  -- Lock the parent to serialize runner/beneficiary edits in one application.
  perform 1 from public.restart_registrations r where r.id=new.registration_id for update;
  new.id_normalized:=private.restart_normalize_id(new.id_document);
  if new.id_normalized is null or new.id_normalized !~ '^[A-Z0-9]{6,30}$' then
    raise exception 'RUNNER_ID_INVALID';
  end if;
  if exists(select 1 from public.restart_registrations r
            where r.id=new.registration_id and r.event_id<>new.event_id) then
    raise exception 'PARTICIPANT_EVENT_MISMATCH';
  end if;
  if exists(select 1 from public.restart_participants p
            where p.event_id=new.event_id and p.id_normalized=new.id_normalized and p.id<>new.id) then
    raise exception 'RUNNER_ALREADY_REGISTERED';
  end if;
  if exists(select 1 from public.restart_beneficiaries b
            where b.registration_id=new.registration_id and b.id_normalized=new.id_normalized) then
    raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER';
  end if;
  return new;
end;
$$;

create or replace function private.restart_guard_beneficiary_identity()
returns trigger language plpgsql set search_path = '' as $$
begin
  perform 1 from public.restart_registrations r where r.id=new.registration_id for update;
  new.id_normalized:=private.restart_normalize_id(new.id_document);
  if new.id_normalized is null or new.id_normalized !~ '^[A-Z0-9]{6,30}$' then
    raise exception 'BENEFICIARY_ID_INVALID';
  end if;
  if exists(select 1 from public.restart_participants p
            where p.registration_id=new.registration_id and p.id_normalized=new.id_normalized) then
    raise exception 'BENEFICIARY_ID_SAME_AS_RUNNER';
  end if;
  if exists(select 1 from public.restart_beneficiaries b
            where b.registration_id=new.registration_id and b.id_normalized=new.id_normalized and b.id<>new.id) then
    raise exception 'DUPLICATE_BENEFICIARY_ID';
  end if;
  return new;
end;
$$;

drop trigger if exists restart_participants_beneficiary_identity_guard on public.restart_participants;
create trigger restart_participants_beneficiary_identity_guard
before insert or update of id_document,id_normalized,event_id,registration_id on public.restart_participants
for each row execute function private.restart_guard_runner_identity();
drop trigger if exists restart_beneficiaries_identity_guard on public.restart_beneficiaries;
create trigger restart_beneficiaries_identity_guard
before insert or update of id_document,id_normalized,registration_id on public.restart_beneficiaries
for each row execute function private.restart_guard_beneficiary_identity();

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
  v_participant_snapshot jsonb := '[]'::jsonb;
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
  v_member_user_id uuid := nullif(p_payload->>'member_user_id','')::uuid;
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

  if v_registration_type<>'SINGLE' then
    v_contact_runner_index:=1;
  end if;

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

  perform private.restart_validate_registration_identity(p_payload);

  -- Validate runners first because auto category depends on age/gender.
  for v_runner in select * from jsonb_array_elements(coalesce(p_payload->'runners','[]'::jsonb))
  loop
    v_runner_index := coalesce(nullif(v_runner->>'runner_index','')::integer,0);
    if v_runner_index < 1 or v_runner_index > v_runner_count then raise exception 'RUNNER_INDEX_INVALID'; end if;

    v_runner_id := private.restart_normalize_id(v_runner->>'id_document');
    if v_runner_id is not null then
      if v_runner_id = any(v_runner_ids) then raise exception 'DUPLICATE_RUNNER_ID'; end if;
      if exists(
        select 1 from public.restart_participants p
        join public.restart_registrations r on r.id=p.registration_id
        where p.event_id=v_event_id and p.id_normalized=v_runner_id
      ) then raise exception 'RUNNER_ALREADY_REGISTERED'; end if;
      v_runner_ids := array_append(v_runner_ids,v_runner_id);
    end if;

    -- Teammates provide name and identity; the owner provides the full profile.
    if v_registration_type<>'SINGLE' and v_runner_index>1 then
      if nullif(trim(coalesce(v_runner->>'first_name','')),'') is null then
        raise exception 'REQUIRED_FIELD_MISSING:first_name';
      end if;
      if nullif(trim(coalesce(v_runner->>'last_name','')),'') is null then
        raise exception 'REQUIRED_FIELD_MISSING:last_name';
      end if;
      -- Only runner #1 belongs to the logged-in Member Profile.
    else
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
    end if;

    v_participant_snapshot:=v_participant_snapshot||jsonb_build_array(
      case
        when v_registration_type='SINGLE' or v_runner_index=1 then v_runner
        else jsonb_build_object(
          'runner_index',v_runner_index,
          'first_name',trim(coalesce(v_runner->>'first_name','')),
          'last_name',trim(coalesce(v_runner->>'last_name','')),
          'id_document',trim(v_runner->>'id_document'),
          'id_normalized',private.restart_normalize_id(v_runner->>'id_document')
        )
      end
    );
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
    v_participant_snapshot,
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
      private.restart_normalize_id(v_runner->>'id_document'),
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'phone'),'') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(v_runner->>'birth_date','')::date else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(v_runner->>'gender','') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(v_runner->>'shirt_size','') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(v_runner->>'blood_group','') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'title'),'') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'address'),'') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'emergency_contact_name'),'') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'emergency_phone'),'') else null end,
      case when v_registration_type='SINGLE' or v_runner_index=1 then nullif(trim(v_runner->>'emergency_relation'),'') else null end
    );

    for v_answer in select key,value from jsonb_each(coalesce(v_runner->'answers','{}'::jsonb))
    loop
      insert into public.restart_registration_answers(registration_id,runner_index,field_id,field_key,value)
      select v_registration_id,v_runner_index,f.id,v_answer.key,v_answer.value
      from public.restart_form_fields f
      where f.event_id=v_event_id and f.field_key=v_answer.key and f.is_active=true
      limit 1;
    end loop;

    if coalesce((v_flags->>'insurance')::boolean,false)
       and not (v_registration_type<>'SINGLE' and v_runner_index>1) then
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

  -- Edge injects the authenticated member_user_id. Bind it inside this transaction
  -- after participants exist so the profile-sync trigger can copy runner #1 safely.
  if v_member_user_id is not null then
    update public.restart_registrations
    set member_user_id=v_member_user_id,member_runner_index=1,updated_at=now()
    where id=v_registration_id;
  end if;

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
$function$

;

CREATE OR REPLACE FUNCTION public.restart_join_waitlist(p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'private'
AS $function$
declare
  e public.restart_events%rowtype;
  flags jsonb;
  v_event_id uuid:=nullif(p_payload->>'event_id','')::uuid;
  member_user_id uuid:=nullif(p_payload->>'member_user_id','')::uuid;
  runners jsonb:=coalesce(p_payload->'runners','[]'::jsonb);
  safe_runners jsonb:='[]'::jsonb;
  safe_payload jsonb;
  runner_item jsonb;
  runner_idx integer;
  runner_count integer:=jsonb_array_length(coalesce(p_payload->'runners','[]'::jsonb));
  reg_type text:=upper(coalesce(nullif(p_payload->>'registration_type',''),'SINGLE'));
  contact_idx integer:=coalesce(nullif(p_payload->>'contact_runner_index','')::integer,1);
  contact jsonb;
  contact_id text;
  wait_id uuid;
  pos integer;
  team_size integer;
begin
  if member_user_id is null then raise exception 'MEMBER_USER_REQUIRED'; end if;
  perform private.restart_validate_registration_identity(p_payload);
  select * into e from public.restart_events where id=v_event_id;
  if not found then raise exception 'EVENT_NOT_FOUND'; end if;
  flags:=coalesce(e.feature_flags,'{}'::jsonb);
  if not coalesce((flags->>'waitlist')::boolean,false) then raise exception 'WAITLIST_DISABLED'; end if;
  if e.status<>'OPEN' then raise exception 'REGISTRATION_CLOSED'; end if;

  team_size:=greatest(2,least(100,coalesce(nullif(flags->>'team_members_count','')::integer,3)));
  if reg_type<>'SINGLE' then contact_idx:=1; end if;
  if reg_type='SINGLE' and runner_count<>1 then raise exception 'SINGLE_REQUIRES_ONE_RUNNER'; end if;
  if reg_type='PAIR' and runner_count<>2 then raise exception 'PAIR_REQUIRES_TWO_RUNNERS'; end if;
  if reg_type='TEAM' and runner_count<>team_size then raise exception 'TEAM_SIZE_INVALID'; end if;
  if contact_idx<1 or contact_idx>runner_count then raise exception 'CONTACT_RUNNER_INVALID'; end if;

  if exists(
    select 1
    from jsonb_array_elements(runners) r
    where nullif(trim(coalesce(r->>'first_name','')),'') is null
       or nullif(trim(coalesce(r->>'last_name','')),'') is null
  ) then
    raise exception 'RUNNER_NAME_REQUIRED';
  end if;

  for runner_item in select * from jsonb_array_elements(runners)
  loop
    runner_idx:=coalesce(nullif(runner_item->>'runner_index','')::integer,0);
    safe_runners:=safe_runners||jsonb_build_array(
      case
        when reg_type='SINGLE' or runner_idx=1 then runner_item
        else jsonb_build_object(
          'runner_index',runner_idx,
          'first_name',trim(coalesce(runner_item->>'first_name','')),
          'last_name',trim(coalesce(runner_item->>'last_name','')),
          'id_document',trim(runner_item->>'id_document'),
          'id_normalized',private.restart_normalize_id(runner_item->>'id_document')
        )
      end
    );
  end loop;

  safe_payload:=(p_payload - array['slip_path','member_user_id']) ||
    jsonb_build_object('runners',safe_runners,'contact_runner_index',contact_idx);

  select value into contact
  from jsonb_array_elements(runners) with ordinality x(value,ord)
  where ord=contact_idx;
  if contact is null then raise exception 'CONTACT_REQUIRED'; end if;
  contact_id:=private.restart_normalize_id(contact->>'id_document');
  if contact_id is null then raise exception 'CONTACT_ID_REQUIRED'; end if;

  insert into public.restart_waitlist(
    event_id,member_user_id,category_id,package_id,registration_type,group_name,runner_count,
    contact_name,contact_phone,contact_id_normalized,payload,status
  ) values(
    v_event_id,member_user_id,
    nullif(p_payload->>'category_id','')::uuid,
    nullif(p_payload->>'package_id','')::uuid,
    reg_type,nullif(trim(coalesce(p_payload->>'group_name','')),''),runner_count,
    trim(coalesce(contact->>'first_name','')||' '||coalesce(contact->>'last_name','')),
    nullif(trim(coalesce(contact->>'phone','')),''),
    contact_id,
    safe_payload,
    'WAITING'
  )
  on conflict (event_id,contact_id_normalized) where status in ('WAITING','INVITED')
  do update set
    member_user_id=excluded.member_user_id,
    category_id=excluded.category_id,
    package_id=excluded.package_id,
    registration_type=excluded.registration_type,
    group_name=excluded.group_name,
    runner_count=excluded.runner_count,
    contact_name=excluded.contact_name,
    contact_phone=excluded.contact_phone,
    payload=excluded.payload,
    updated_at=now()
  returning id into wait_id;

  select count(*) into pos
  from public.restart_waitlist w
  where w.event_id=v_event_id and w.status='WAITING'
    and w.created_at <= (select w2.created_at from public.restart_waitlist w2 where w2.id=wait_id);

  return jsonb_build_object('id',wait_id,'status','WAITING','queue_position',pos);
end;
$function$

;
