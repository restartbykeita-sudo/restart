-- Use only if the one-time button on pending.html is unavailable.
-- Replace the email below, then run once.
insert into public.profiles (
  id,display_name,email,platform_role,approval_status,is_active,approved_by,approved_at,created_at,updated_at
)
select
  u.id,
  coalesce(nullif(trim(u.raw_user_meta_data ->> 'display_name'),''),split_part(u.email,'@',1)),
  u.email,
  'SUPER_ADMIN','APPROVED',true,u.id,now(),coalesce(u.created_at,now()),now()
from auth.users u
where lower(u.email)=lower('CHANGE_ADMIN_EMAIL@example.com')
on conflict(id) do update set
  email=excluded.email,
  platform_role='SUPER_ADMIN',
  approval_status='APPROVED',
  is_active=true,
  approved_by=excluded.id,
  approved_at=now(),
  rejected_reason=null,
  updated_at=now();

select u.email,p.platform_role,p.approval_status,p.is_active
from auth.users u join public.profiles p on p.id=u.id
where lower(u.email)=lower('CHANGE_ADMIN_EMAIL@example.com');
