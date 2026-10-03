-- Every fixture and edit is rolled back within the test block.
do $test$
declare
  user_one uuid:=gen_random_uuid();
  user_two uuid:=gen_random_uuid();
  event_one uuid;
  registration_one uuid;
  response jsonb;
  affected integer;
  value text;
  results jsonb:='[]'::jsonb;
begin
  begin
    insert into auth.users(id,email,role,aud,raw_user_meta_data,raw_app_meta_data)
    values(user_one,'gender-test-'||user_one||'@example.invalid','authenticated','authenticated','{}','{}'),
          (user_two,'gender-test-'||user_two||'@example.invalid','authenticated','authenticated','{}','{}');
    insert into public.restart_member_profiles(user_id,gender)
    values(user_one,'MALE'),(user_two,'FEMALE')
    on conflict(user_id) do update set gender=excluded.gender;
    foreach value in array array['MALE','FEMALE','OTHER'] loop
      update public.restart_member_profiles set gender=value where user_id=user_one;
      if not exists(select 1 from public.restart_member_profiles where user_id=user_one and gender=value) then raise exception 'TEST_FAILED:gender persistence';end if;
    end loop;
    results:=results||jsonb_build_array('all three gender values persist');
    begin
      update public.restart_member_profiles set gender='INVALID' where user_id=user_one;
      raise exception 'TEST_FAILED:invalid gender accepted';
    exception when check_violation then null;end;
    results:=results||jsonb_build_array('database rejects unsupported gender values');

    insert into public.restart_events(slug,name,status,feature_flags,field_settings)
    values('gender-test-'||gen_random_uuid(),'Gender regression test','OPEN',
      '{"basic_info":true,"competition_categories":false,"category_pricing":false,"packages":false,"shirts":false,"insurance":false,"pdpa":false,"full_payment":true,"slip_upload":false,"capacity":false}',
      '{}') returning id into event_one;
    response:=public.restart_create_registration(jsonb_build_object(
      'event_id',event_one,'registration_type','SINGLE','payment_mode','FULL','total_amount_thb',0,
      'schedule','[{"installment_no":1,"amount_due_thb":0}]'::jsonb,
      'runners','[{"runner_index":1,"first_name":"Test","last_name":"Runner","id_document":"GENDER123456","gender":"FEMALE"}]'::jsonb));
    registration_one:=(response->>'id')::uuid;
    update public.restart_registrations set member_user_id=user_one,member_runner_index=1 where id=registration_one;
    if not exists(select 1 from public.restart_member_profiles where user_id=user_one and gender='FEMALE') then raise exception 'TEST_FAILED:registration profile sync';end if;
    results:=results||jsonb_build_array('submitted gender syncs back to the member profile');
    update public.restart_participants set gender='OTHER' where registration_id=registration_one and runner_index=1;
    update public.restart_registrations set member_user_id=user_one where id=registration_one;
    if not exists(select 1 from public.restart_member_profiles where user_id=user_one and gender='OTHER') then raise exception 'TEST_FAILED:edited gender sync';end if;
    results:=results||jsonb_build_array('edited event gender replaces the profile value');
    update public.restart_participants set gender=null where registration_id=registration_one and runner_index=1;
    update public.restart_registrations set member_user_id=user_one where id=registration_one;
    if not exists(select 1 from public.restart_member_profiles where user_id=user_one and gender='OTHER') then raise exception 'TEST_FAILED:hidden field erases profile gender';end if;
    results:=results||jsonb_build_array('an event without gender preserves the stored profile');

    perform set_config('request.jwt.claim.sub',user_one::text,true);
    perform set_config('request.jwt.claims',jsonb_build_object('sub',user_one,'role','authenticated')::text,true);
    execute 'set local role authenticated';
    update public.restart_member_profiles set gender='MALE' where user_id=user_one;
    get diagnostics affected=row_count;
    if affected<>1 then raise exception 'TEST_FAILED:owner cannot edit gender';end if;
    results:=results||jsonb_build_array('authenticated owner can update and read gender');
    update public.restart_member_profiles set gender='OTHER' where user_id=user_two;
    get diagnostics affected=row_count;
    if affected<>0 then raise exception 'TEST_FAILED:other profile editable';end if;
    results:=results||jsonb_build_array('another member profile cannot be changed');
    if exists(select 1 from public.restart_member_profiles where user_id=user_two) then raise exception 'TEST_FAILED:other profile visible';end if;
    results:=results||jsonb_build_array('another member profile is hidden');
    begin
      update public.restart_member_profiles set points_balance=999 where user_id=user_one;
      raise exception 'TEST_FAILED:points editable';
    exception when insufficient_privilege then null;end;
    results:=results||jsonb_build_array('gender permission does not allow editing points');
    execute 'reset role';
    raise exception 'ROLLBACK_GENDER_FIXTURES';
  exception when raise_exception then
    if sqlerrm<>'ROLLBACK_GENDER_FIXTURES' then raise;end if;
  end;
  perform set_config('restart.gender_test_results',results::text,true);
end;
$test$;
select current_setting('restart.gender_test_results')::jsonb as passed_tests;
