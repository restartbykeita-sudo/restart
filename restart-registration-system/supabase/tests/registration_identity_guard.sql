do $$
declare
  event_one uuid;
  event_two uuid;
  reg_one uuid;
  reg_two uuid;
  runner_two uuid;
  bene_one uuid;
  payload jsonb;
  result jsonb;
  results jsonb := '[]'::jsonb;
  flags jsonb := '{"basic_info":false,"competition_categories":false,"category_pricing":false,"packages":false,"shirts":false,"insurance":false,"pdpa":false,"full_payment":true,"slip_upload":false,"capacity":false,"pair_registration":true,"team_registration":true,"team_members_count":3}';
begin
  begin
    insert into public.restart_events(slug,name,status,feature_flags,field_settings)
    values('identity-test-'||gen_random_uuid(),'Identity regression test','OPEN',flags,'{}') returning id into event_one;
    insert into public.restart_events(slug,name,status,feature_flags,field_settings)
    values('identity-test-'||gen_random_uuid(),'Identity regression test','OPEN',flags,'{}') returning id into event_two;

    payload:=jsonb_build_object('event_id',event_one,'registration_type','PAIR','payment_mode','FULL','total_amount_thb',0,
      'schedule','[{"installment_no":1,"amount_due_thb":0}]'::jsonb,
      'runners','[{"runner_index":1,"first_name":"Test","last_name":"One","id_document":"AB123456","id_normalized":"FORGED11"},{"runner_index":2,"first_name":"Test","last_name":"Two","id_document":"cd-123456","id_normalized":"FORGED22"}]'::jsonb);
    result:=public.restart_create_registration(payload);
    reg_one:=(result->>'id')::uuid;
    if (select count(*) from public.restart_participants where registration_id=reg_one and id_normalized in ('AB123456','CD123456'))<>2 then raise exception 'TEST_FAILED:teammate identity storage'; end if;
    if not exists(select 1 from public.restart_registrations where id=reg_one and participant_snapshot->1->>'id_normalized'='CD123456') then raise exception 'TEST_FAILED:snapshot'; end if;
    select id into runner_two from public.restart_participants where registration_id=reg_one and runner_index=2;
    results:=results||jsonb_build_array('valid pair saves canonical IDs and teammate snapshot');

    begin
      perform public.restart_create_registration(jsonb_set(payload,'{runners,0,id_document}','" cd123456 "'));
      raise exception 'TEST_FAILED:within-pair duplicate accepted';
    exception when others then if sqlerrm<>'DUPLICATE_RUNNER_ID' then raise; end if; end;
    results:=results||jsonb_build_array('pair duplicate blocked after case/space/hyphen normalization');

    begin
      perform public.restart_create_registration(jsonb_set(payload,'{runners,1,id_document}','""'));
      raise exception 'TEST_FAILED:missing teammate ID accepted';
    exception when others then if sqlerrm<>'RUNNER_ID_INVALID' then raise; end if; end;
    results:=results||jsonb_build_array('missing teammate ID blocked');

    begin
      perform public.restart_create_registration(payload||jsonb_build_object('registration_type','SINGLE','runners',jsonb_build_array(jsonb_set(payload->'runners'->1,'{runner_index}','1'))));
      raise exception 'TEST_FAILED:duplicate in other registration accepted';
    exception when others then if sqlerrm<>'RUNNER_ALREADY_REGISTERED' then raise; end if; end;
    results:=results||jsonb_build_array('teammate ID blocked in a different registration');

    begin
      perform public.restart_create_registration(payload||jsonb_build_object('registration_type','TEAM','group_name','Test team',
        'runners','[{"runner_index":1,"first_name":"Test","last_name":"One","id_document":"GH123456"},{"runner_index":2,"first_name":"Test","last_name":"Two","id_document":"IJ123456"},{"runner_index":3,"first_name":"Test","last_name":"Three","id_document":"ij-123456"}]'::jsonb));
      raise exception 'TEST_FAILED:team duplicate accepted';
    exception when others then if sqlerrm<>'DUPLICATE_RUNNER_ID' then raise; end if; end;
    results:=results||jsonb_build_array('team members 2 and 3 duplicate blocked');

    begin
      perform private.restart_validate_registration_identity('{"runners":[{"id_document":"AB123456","beneficiaries":[{"id_document":"cd123456"}]},{"id_document":"CD123456"}]}'::jsonb);
      raise exception 'TEST_FAILED:beneficiary matches later runner accepted';
    exception when others then if sqlerrm<>'BENEFICIARY_ID_SAME_AS_RUNNER' then raise; end if; end;
    results:=results||jsonb_build_array('beneficiary matches later runner blocked');

    begin
      perform private.restart_validate_registration_identity('{"runners":[{"id_document":"AB123456","beneficiaries":[{"id_document":"EF123456"}]},{"id_document":"CD123456","beneficiaries":[{"id_document":"ef-123456"}]}]}'::jsonb);
      raise exception 'TEST_FAILED:duplicate beneficiary across runners accepted';
    exception when others then if sqlerrm<>'DUPLICATE_BENEFICIARY_ID' then raise; end if; end;
    results:=results||jsonb_build_array('beneficiary duplicated across runners blocked');

    insert into public.restart_beneficiaries(registration_id,runner_index,full_name,id_document,relationship,percentage)
    values(reg_one,1,'Test Beneficiary','EF123456','Test',100) returning id into bene_one;
    begin
      insert into public.restart_beneficiaries(registration_id,runner_index,full_name,id_document,relationship,percentage)
      values(reg_one,2,'Test Beneficiary','ef-123456','Test',100);
      raise exception 'TEST_FAILED:duplicate beneficiary insert accepted';
    exception when others then if sqlerrm<>'DUPLICATE_BENEFICIARY_ID' then raise; end if; end;
    results:=results||jsonb_build_array('direct beneficiary insert duplicate blocked');

    begin
      update public.restart_beneficiaries set id_document='cd123456' where id=bene_one;
      raise exception 'TEST_FAILED:beneficiary changed to teammate accepted';
    exception when others then if sqlerrm<>'BENEFICIARY_ID_SAME_AS_RUNNER' then raise; end if; end;
    results:=results||jsonb_build_array('beneficiary update to teammate identity blocked');

    begin
      update public.restart_participants set id_document='ef123456' where id=runner_two;
      raise exception 'TEST_FAILED:runner changed to beneficiary accepted';
    exception when others then if sqlerrm<>'BENEFICIARY_ID_SAME_AS_RUNNER' then raise; end if; end;
    results:=results||jsonb_build_array('runner update to beneficiary identity blocked');

    update public.restart_participants set id_normalized='FORGED22' where id=runner_two;
    if (select id_normalized from public.restart_participants where id=runner_two)<>'CD123456' then raise exception 'TEST_FAILED:forged normalized runner'; end if;
    update public.restart_beneficiaries set id_normalized='FORGED33' where id=bene_one;
    if (select id_normalized from public.restart_beneficiaries where id=bene_one)<>'EF123456' then raise exception 'TEST_FAILED:forged normalized beneficiary'; end if;
    results:=results||jsonb_build_array('forged normalized IDs cannot bypass checks');

    result:=public.restart_create_registration(payload||jsonb_build_object('registration_type','TEAM','group_name','Valid test team',
      'runners','[{"runner_index":1,"first_name":"Test","last_name":"One","id_document":"GH123456"},{"runner_index":2,"first_name":"Test","last_name":"Two","id_document":"IJ123456"},{"runner_index":3,"first_name":"Test","last_name":"Three","id_document":"KL123456"}]'::jsonb));
    reg_two:=(result->>'id')::uuid;
    if (select count(*) from public.restart_participants where registration_id=reg_two and id_normalized is not null)<>3 then raise exception 'TEST_FAILED:valid team'; end if;
    results:=results||jsonb_build_array('valid team saves IDs for all 3 participants');

    insert into public.restart_beneficiaries(registration_id,runner_index,full_name,id_document,relationship,percentage)
    values(reg_two,1,'Test Beneficiary','ef123456','Test',100);
    results:=results||jsonb_build_array('beneficiary may be reused in a different application');

    result:=public.restart_create_registration(payload||jsonb_build_object('event_id',event_two));
    if result->>'id' is null then raise exception 'TEST_FAILED:second event'; end if;
    results:=results||jsonb_build_array('same runner may register for a different event');

    -- Roll back every fixture and every associated row without deleting live data.
    raise exception using errcode='PT999',message='ROLLBACK_TEST_FIXTURES';
  exception when sqlstate 'PT999' then null;
  end;
  perform set_config('restart.identity_test_results',results::text,true);
end;
$$;
select current_setting('restart.identity_test_results')::jsonb as passed_tests;
