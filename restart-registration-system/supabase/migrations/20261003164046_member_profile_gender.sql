begin;
alter table public.restart_member_profiles add column if not exists gender text;
do $block$
begin
  if not exists(select 1 from pg_constraint where conrelid='public.restart_member_profiles'::regclass and conname='restart_member_profiles_gender_check') then
    alter table public.restart_member_profiles add constraint restart_member_profiles_gender_check check (gender is null or gender in ('MALE','FEMALE','OTHER'));
  end if;
end;
$block$;
-- Keep account and CRM balances controlled by the server.
revoke all on public.restart_member_profiles from anon,authenticated;
grant select on public.restart_member_profiles to authenticated;
grant insert(user_id,email,title,first_name,last_name,id_document,gender,birth_date,address,phone,blood_group,emergency_contact_name,emergency_phone,emergency_relation)
  on public.restart_member_profiles to authenticated;
grant update(email,title,first_name,last_name,id_document,gender,birth_date,address,phone,blood_group,emergency_contact_name,emergency_phone,emergency_relation,updated_at)
  on public.restart_member_profiles to authenticated;

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
      user_id,email,title,first_name,last_name,id_document,birth_date,gender,address,phone,blood_group,
      emergency_contact_name,emergency_phone,emergency_relation,updated_at
    )
    select
      new.member_user_id,u.email,p.title,p.first_name,p.last_name,case when regexp_replace(upper(coalesce(p.id_document,'')),'[^0-9A-Z]','','g') ~ '^[0-9A-Z]{6,30}$' then regexp_replace(upper(p.id_document),'[^0-9A-Z]','','g') else null end,p.birth_date,case when p.gender in ('MALE','FEMALE','OTHER') then p.gender else null end,p.address,p.phone,p.blood_group,
      p.emergency_contact_name,p.emergency_phone,p.emergency_relation,now()
    from auth.users u where u.id=new.member_user_id
    on conflict(user_id) do update set
      email=coalesce(excluded.email,restart_member_profiles.email),
      title=coalesce(excluded.title,restart_member_profiles.title),
      first_name=coalesce(excluded.first_name,restart_member_profiles.first_name),
      last_name=coalesce(excluded.last_name,restart_member_profiles.last_name),
      id_document=coalesce(excluded.id_document,restart_member_profiles.id_document),
      birth_date=coalesce(excluded.birth_date,restart_member_profiles.birth_date),
      gender=coalesce(excluded.gender,restart_member_profiles.gender),
      address=coalesce(excluded.address,restart_member_profiles.address),
      phone=coalesce(excluded.phone,restart_member_profiles.phone),
      blood_group=coalesce(excluded.blood_group,restart_member_profiles.blood_group),
      emergency_contact_name=coalesce(excluded.emergency_contact_name,restart_member_profiles.emergency_contact_name),
      emergency_phone=coalesce(excluded.emergency_phone,restart_member_profiles.emergency_phone),
      emergency_relation=coalesce(excluded.emergency_relation,restart_member_profiles.emergency_relation),
      updated_at=now();
  end if;

  return new;
end;
$function$;

-- Restore previously recorded gender from the member's latest registration.
-- Do not guess gender from titles or overwrite an existing profile value.
with latest as (
  select distinct on (p.member_user_id) p.member_user_id,p.gender
  from public.restart_participants p join public.restart_registrations r on r.id=p.registration_id
  where p.member_user_id is not null and p.gender in ('MALE','FEMALE','OTHER')
  order by p.member_user_id,r.created_at desc,p.id desc
)
update public.restart_member_profiles m set gender=latest.gender,updated_at=now()
from latest where m.user_id=latest.member_user_id and m.gender is null;
notify pgrst,'reload schema';
commit;
