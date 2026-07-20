-- Verify V6 signup + approval installation.
select column_name,data_type from information_schema.columns
where table_schema='public' and table_name='profiles'
  and column_name in ('email','approval_status','requested_org_code','approved_by','approved_at','rejected_reason')
order by column_name;

select tgname,pg_get_triggerdef(oid)
from pg_trigger
where tgrelid='auth.users'::regclass and tgname='on_auth_user_created';

select routine_name
from information_schema.routines
where routine_schema='public'
  and routine_name in ('ensure_my_profile','get_my_access_context','admin_list_users','admin_dashboard_runners','public_runner_result')
order by routine_name;

select u.email,p.display_name,p.platform_role,p.approval_status,p.is_active,p.requested_org_code
from auth.users u left join public.profiles p on p.id=u.id
order by u.created_at desc;
