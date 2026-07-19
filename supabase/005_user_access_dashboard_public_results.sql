-- ============================================================
-- TRAIL SCAN SYSTEM - MIGRATION 005
-- User approval, role-based access, detailed dashboard,
-- and public runner result lookup by BIB.
-- Run after 001-004. Safe for an existing V4 installation.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) ACCOUNT APPROVAL AND PUBLIC RESULT SETTINGS
-- ------------------------------------------------------------

alter table public.profiles
  add column if not exists email text,
  add column if not exists approval_status text not null default 'PENDING',
  add column if not exists requested_org_code text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_reason text,
  add column if not exists last_login_at timestamptz;

alter table public.organization_members drop constraint if exists organization_members_role_code_check;
alter table public.organization_members add constraint organization_members_role_code_check
  check (role_code in (
    'OWNER','ORG_ADMIN','EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','STAFF'
  ));

alter table public.profiles drop constraint if exists profiles_approval_status_check;
alter table public.profiles add constraint profiles_approval_status_check
  check (approval_status in ('PENDING','APPROVED','REJECTED','SUSPENDED'));

alter table public.events
  add column if not exists public_results_enabled boolean not null default true,
  add column if not exists public_results_mode text not null default 'LIVE';

alter table public.events drop constraint if exists events_public_results_mode_check;
alter table public.events add constraint events_public_results_mode_check
  check (public_results_mode in ('LIVE','FINAL_ONLY','HIDDEN'));

-- Existing operational accounts stay usable after migration.
update public.profiles p
set approval_status = 'APPROVED',
    is_active = true,
    approved_at = coalesce(approved_at, now())
where p.platform_role = 'SUPER_ADMIN'
   or exists (
      select 1 from public.organization_members om
      where om.user_id = p.id and om.status = 'ACTIVE'
   );

-- New signup always waits for an administrator.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (
    id, display_name, email, requested_org_code,
    approval_status, is_active
  ) values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.email,
    nullif(trim(new.raw_user_meta_data ->> 'requested_org_code'), ''),
    'PENDING',
    false
  )
  on conflict (id) do update set
    display_name = excluded.display_name,
    email = excluded.email,
    requested_org_code = excluded.requested_org_code,
    updated_at = now();
  return new;
end;
$$;

-- Backfill email for older users.
update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id and p.email is null;

-- ------------------------------------------------------------
-- 2) EVENT-SPECIFIC USER ASSIGNMENTS
-- ------------------------------------------------------------

create table if not exists public.event_user_assignments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_code text not null check (role_code in (
    'EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','SCAN_SUPERVISOR'
  )),
  can_manage_categories boolean not null default false,
  can_manage_points boolean not null default false,
  can_manage_runners boolean not null default false,
  can_manage_staff boolean not null default false,
  can_manage_devices boolean not null default false,
  can_manage_results boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(event_id, user_id)
);

create index if not exists idx_event_user_assignments_user
  on public.event_user_assignments(user_id, is_active, event_id);

alter table public.event_user_assignments enable row level security;

drop trigger if exists trg_event_user_assignments_updated_at on public.event_user_assignments;
create trigger trg_event_user_assignments_updated_at
before update on public.event_user_assignments
for each row execute function public.set_updated_at();

-- ------------------------------------------------------------
-- 3) APPROVAL-AWARE ACCESS HELPERS
-- ------------------------------------------------------------

create or replace function public.is_approved_user()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.approval_status = 'APPROVED'
      and p.is_active = true
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.platform_role = 'SUPER_ADMIN'
      and p.approval_status = 'APPROVED'
      and p.is_active = true
  );
$$;

create or replace function public.is_org_member(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'ACTIVE'
    )
  );
$$;

create or replace function public.has_org_role(
  p_organization_id uuid,
  p_roles text[]
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.organization_members om
      where om.organization_id = p_organization_id
        and om.user_id = auth.uid()
        and om.status = 'ACTIVE'
        and om.role_code = any(p_roles)
    )
  );
$$;

create or replace function public.has_event_assignment(
  p_event_id uuid,
  p_roles text[] default null
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.event_user_assignments eua
      where eua.event_id = p_event_id
        and eua.user_id = auth.uid()
        and eua.is_active = true
        and (p_roles is null or eua.role_code = any(p_roles))
    )
  );
$$;

create or replace function public.can_view_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1
      from public.events e
      where e.id = p_event_id
        and (
          public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
          or public.has_event_assignment(e.id, null)
          or exists (
            select 1 from public.staff_assignments sa
            where sa.event_id = e.id
              and sa.user_id = auth.uid()
              and sa.is_active = true
              and (sa.valid_from is null or sa.valid_from <= now())
              and (sa.valid_until is null or sa.valid_until >= now())
          )
        )
    )
  );
$$;

create or replace function public.can_view_dashboard(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id=p_event_id and (
        public.has_org_role(e.organization_id,array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id,array['EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','SCAN_SUPERVISOR'])
        or exists (
          select 1 from public.staff_assignments sa
          where sa.event_id=e.id and sa.user_id=auth.uid()
            and sa.is_active=true and sa.role_code='SCAN_SUPERVISOR'
            and (sa.valid_from is null or sa.valid_from<=now())
            and (sa.valid_until is null or sa.valid_until>=now())
        )
      )
    )
  );
$$;

create or replace function public.can_manage_event(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id = p_event_id and (
        public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id, array['EVENT_ADMIN','RACE_DIRECTOR'])
      )
    )
  );
$$;

create or replace function public.can_manage_results(p_event_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1 from public.events e
      where e.id = p_event_id and (
        public.has_org_role(e.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(e.id, array['EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN'])
      )
    )
  );
$$;

create or replace function public.can_manage_org_staff(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and (
      public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
      or exists (
        select 1 from public.event_user_assignments eua
        where eua.organization_id=p_organization_id
          and eua.user_id=auth.uid()
          and eua.is_active=true
          and eua.role_code in ('EVENT_ADMIN','RACE_DIRECTOR')
      )
    )
  );
$$;

create or replace function public.can_scan_point(p_scan_point_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_platform_admin() or (
    public.is_approved_user() and exists (
      select 1
      from public.scan_points sp
      where sp.id = p_scan_point_id and (
        public.has_org_role(sp.organization_id, array['OWNER','ORG_ADMIN'])
        or public.has_event_assignment(sp.event_id, array['EVENT_ADMIN','RACE_DIRECTOR','SCAN_SUPERVISOR'])
        or exists (
          select 1 from public.staff_assignments sa
          where sa.scan_point_id = sp.id
            and sa.user_id = auth.uid()
            and sa.is_active = true
            and (sa.valid_from is null or sa.valid_from <= now())
            and (sa.valid_until is null or sa.valid_until >= now())
        )
      )
    )
  );
$$;

-- Only an approved platform administrator can create an organization.
create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_timezone text default 'Asia/Bangkok'
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_org_id uuid;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  if not public.is_platform_admin() then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;

  insert into public.organizations(name, slug, timezone, created_by)
  values(trim(p_name), lower(trim(p_slug)), coalesce(nullif(trim(p_timezone),''),'Asia/Bangkok'), auth.uid())
  returning id into v_org_id;

  insert into public.organization_members(organization_id,user_id,role_code,status,created_by)
  values(v_org_id,auth.uid(),'OWNER','ACTIVE',auth.uid())
  on conflict (organization_id,user_id) do update
  set role_code='OWNER',status='ACTIVE',updated_at=now();

  return v_org_id;
end;
$$;

-- ------------------------------------------------------------
-- 4) FIRST ADMIN BOOTSTRAP AND ACCESS CONTEXT
-- ------------------------------------------------------------

create or replace function public.can_bootstrap_first_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and not exists (
      select 1 from public.profiles
      where platform_role='SUPER_ADMIN'
        and approval_status='APPROVED'
        and is_active=true
    );
$$;

create or replace function public.bootstrap_first_admin()
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  perform pg_advisory_xact_lock(hashtext('trail_scan_first_admin'));
  if not public.can_bootstrap_first_admin() then raise exception 'ADMIN_ALREADY_EXISTS'; end if;

  update public.profiles
  set platform_role='SUPER_ADMIN', approval_status='APPROVED', is_active=true,
      approved_by=auth.uid(), approved_at=now(), rejected_reason=null, updated_at=now()
  where id=auth.uid();
  return true;
end;
$$;

create or replace function public.get_my_access_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_profile jsonb;
  v_memberships jsonb;
  v_event_assignments jsonb;
  v_scan_assignments jsonb;
  v_pages jsonb;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;

  select to_jsonb(p) into v_profile
  from public.profiles p where p.id=auth.uid();

  select coalesce(jsonb_agg(to_jsonb(x) order by x.organization_name),'[]'::jsonb)
  into v_memberships
  from (
    select om.id,om.organization_id,o.name organization_name,o.slug organization_slug,
           om.role_code,om.status
    from public.organization_members om
    join public.organizations o on o.id=om.organization_id
    where om.user_id=auth.uid() and om.status='ACTIVE'
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_name),'[]'::jsonb)
  into v_event_assignments
  from (
    select eua.id,eua.organization_id,eua.event_id,e.name event_name,e.event_code,
           eua.role_code,eua.can_manage_categories,eua.can_manage_points,
           eua.can_manage_runners,eua.can_manage_staff,eua.can_manage_devices,
           eua.can_manage_results,eua.is_active
    from public.event_user_assignments eua
    join public.events e on e.id=eua.event_id
    where eua.user_id=auth.uid() and eua.is_active=true
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.event_name,x.display_order),'[]'::jsonb)
  into v_scan_assignments
  from (
    select sa.id,sa.organization_id,sa.event_id,e.name event_name,
           sa.scan_point_id,sp.name scan_point_name,sp.code scan_point_code,
           sp.point_type,sp.display_order,sa.role_code,sa.can_manual_entry,
           sa.can_override_warning,sa.is_active
    from public.staff_assignments sa
    join public.events e on e.id=sa.event_id
    left join public.scan_points sp on sp.id=sa.scan_point_id
    where sa.user_id=auth.uid() and sa.is_active=true
      and (sa.valid_from is null or sa.valid_from<=now())
      and (sa.valid_until is null or sa.valid_until>=now())
  ) x;

  with pages(page_code) as (
    select unnest(case
      when public.is_platform_admin() or exists (
        select 1 from public.organization_members om
        where om.user_id=auth.uid() and om.status='ACTIVE'
          and om.role_code in ('OWNER','ORG_ADMIN')
      ) then array['dashboard','organizations','users','events','categories','points','runners','bib','staff','devices','results','scanner']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code in ('EVENT_ADMIN','RACE_DIRECTOR')
      ) then array['dashboard','events','categories','points','runners','bib','staff','devices','results','scanner']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code in ('RESULT_ADMIN','VIEWER')
      ) then array['dashboard','results']
      else array[]::text[] end)
    union
    select unnest(case
      when exists (
        select 1 from public.event_user_assignments eua
        where eua.user_id=auth.uid() and eua.is_active=true
          and eua.role_code='SCAN_SUPERVISOR'
      ) or exists (
        select 1 from public.staff_assignments sa
        where sa.user_id=auth.uid() and sa.is_active=true
          and sa.role_code='SCAN_SUPERVISOR'
          and (sa.valid_from is null or sa.valid_from<=now())
          and (sa.valid_until is null or sa.valid_until>=now())
      ) then array['dashboard','results','scanner']
      else array[]::text[] end)
    union
    select 'scanner' where exists(
      select 1 from public.staff_assignments sa
      where sa.user_id=auth.uid() and sa.is_active=true
        and sa.role_code in ('START_STAFF','CP_STAFF','FINISH_STAFF','SCAN_VIEWER')
        and (sa.valid_from is null or sa.valid_from<=now())
        and (sa.valid_until is null or sa.valid_until>=now())
    )
  )
  select coalesce(jsonb_agg(page_code order by page_code),'[]'::jsonb)
  into v_pages from (select distinct page_code from pages) q;

  return jsonb_build_object(
    'profile',coalesce(v_profile,'{}'::jsonb),
    'memberships',v_memberships,
    'event_assignments',v_event_assignments,
    'scan_assignments',v_scan_assignments,
    'pages',v_pages
  );
end;
$$;

-- ------------------------------------------------------------
-- 5) ADMIN USER MANAGEMENT RPC
-- ------------------------------------------------------------

create or replace function public.admin_list_users(p_organization_id uuid)
returns table(
  user_id uuid,
  display_name text,
  email text,
  approval_status text,
  requested_org_code text,
  platform_role text,
  profile_active boolean,
  membership_id uuid,
  member_role text,
  membership_status text,
  event_count bigint,
  scan_point_count bigint,
  approved_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;

  return query
  select p.id,p.display_name,p.email,p.approval_status,p.requested_org_code,
         p.platform_role,p.is_active,
         om.id,om.role_code,om.status,
         (select count(*) from public.event_user_assignments eua
          where eua.user_id=p.id and eua.organization_id=p_organization_id and eua.is_active=true),
         (select count(*) from public.staff_assignments sa
          where sa.user_id=p.id and sa.organization_id=p_organization_id and sa.is_active=true),
         p.approved_at
  from public.profiles p
  left join public.organization_members om
    on om.user_id=p.id and om.organization_id=p_organization_id
  left join public.organizations o on o.id=p_organization_id
  where om.id is not null
     or public.is_platform_admin()
     or lower(coalesce(p.requested_org_code,'')) in (lower(coalesce(o.slug,'')), lower(coalesce(o.name,'')))
  order by
    case p.approval_status when 'PENDING' then 0 when 'APPROVED' then 1 else 2 end,
    p.created_at desc;
end;
$$;

create or replace function public.admin_save_user_access(
  p_user_id uuid,
  p_organization_id uuid,
  p_member_role text,
  p_event_ids uuid[] default array[]::uuid[],
  p_scan_point_ids uuid[] default array[]::uuid[],
  p_scan_role text default null,
  p_can_manual_entry boolean default false,
  p_can_override_warning boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_event_role text;
  v_point record;
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;

  if p_member_role not in ('OWNER','ORG_ADMIN','EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER','STAFF') then
    raise exception 'INVALID_MEMBER_ROLE';
  end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if p_member_role='OWNER'
     and not (public.is_platform_admin() or public.has_org_role(p_organization_id,array['OWNER'])) then
    raise exception 'OWNER_PERMISSION_REQUIRED';
  end if;

  if p_member_role in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER')
     and coalesce(array_length(p_event_ids,1),0)=0 then
    raise exception 'EVENT_ASSIGNMENT_REQUIRED';
  end if;

  if p_member_role='STAFF'
     and (p_scan_role is null or coalesce(array_length(p_scan_point_ids,1),0)=0) then
    raise exception 'SCAN_ASSIGNMENT_REQUIRED';
  end if;

  if p_scan_role is not null and coalesce(array_length(p_scan_point_ids,1),0)=0 then
    raise exception 'SCAN_POINT_REQUIRED';
  end if;

  if p_member_role<>'OWNER'
     and exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_DEMOTED';
  end if;

  update public.profiles
  set approval_status='APPROVED',is_active=true,approved_by=auth.uid(),
      approved_at=now(),rejected_reason=null,updated_at=now()
  where id=p_user_id;

  insert into public.organization_members(
    organization_id,user_id,role_code,status,created_by
  ) values (
    p_organization_id,p_user_id,p_member_role,'ACTIVE',auth.uid()
  )
  on conflict(organization_id,user_id) do update
  set role_code=excluded.role_code,status='ACTIVE',updated_at=now();

  delete from public.event_user_assignments
  where organization_id=p_organization_id and user_id=p_user_id;

  if p_member_role not in ('OWNER','ORG_ADMIN','STAFF') then
    v_event_role := p_member_role;
    if v_event_role not in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN','VIEWER') then
      v_event_role := 'VIEWER';
    end if;

    insert into public.event_user_assignments(
      organization_id,event_id,user_id,role_code,
      can_manage_categories,can_manage_points,can_manage_runners,
      can_manage_staff,can_manage_devices,can_manage_results,
      is_active,created_by
    )
    select e.organization_id,e.id,p_user_id,v_event_role,
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR'),
      v_event_role in ('EVENT_ADMIN','RACE_DIRECTOR','RESULT_ADMIN'),
      true,auth.uid()
    from public.events e
    where e.organization_id=p_organization_id and e.id=any(coalesce(p_event_ids,array[]::uuid[]));
  end if;

  delete from public.staff_assignments
  where organization_id=p_organization_id and user_id=p_user_id;

  if p_scan_role is not null and p_scan_role in (
    'SCAN_SUPERVISOR','START_STAFF','CP_STAFF','FINISH_STAFF','SCAN_VIEWER'
  ) then
    for v_point in
      select sp.* from public.scan_points sp
      where sp.organization_id=p_organization_id
        and sp.id=any(coalesce(p_scan_point_ids,array[]::uuid[]))
    loop
      if (p_scan_role='START_STAFF' and v_point.point_type<>'START')
         or (p_scan_role='CP_STAFF' and v_point.point_type<>'CHECKPOINT')
         or (p_scan_role='FINISH_STAFF' and v_point.point_type<>'FINISH') then
        raise exception 'SCAN_ROLE_POINT_TYPE_MISMATCH: % cannot use point % (%)',
          p_scan_role,v_point.code,v_point.point_type;
      end if;

      insert into public.staff_assignments(
        organization_id,event_id,user_id,scan_point_id,role_code,
        can_manual_entry,can_override_warning,is_active,created_by
      ) values (
        p_organization_id,v_point.event_id,p_user_id,v_point.id,p_scan_role,
        p_can_manual_entry,p_can_override_warning,true,auth.uid()
      );
    end loop;
  end if;

  insert into public.audit_logs(organization_id,actor_user_id,action,entity_type,entity_id,after_data)
  values(p_organization_id,auth.uid(),'SAVE_USER_ACCESS','PROFILE',p_user_id,
         jsonb_build_object('member_role',p_member_role,'event_ids',p_event_ids,
                            'scan_point_ids',p_scan_point_ids,'scan_role',p_scan_role));

  return jsonb_build_object('ok',true,'user_id',p_user_id);
end;
$$;

create or replace function public.admin_set_user_status(
  p_user_id uuid,
  p_organization_id uuid,
  p_status text,
  p_reason text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_status not in ('PENDING','APPROVED','REJECTED','SUSPENDED') then
    raise exception 'INVALID_STATUS';
  end if;

  if p_user_id=auth.uid() and p_status<>'APPROVED' then
    raise exception 'CANNOT_DISABLE_SELF';
  end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if p_status<>'APPROVED'
     and exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_DISABLED';
  end if;

  update public.profiles
  set approval_status=p_status,
      is_active=(p_status='APPROVED'),
      rejected_reason=case when p_status in ('REJECTED','SUSPENDED') then p_reason else null end,
      approved_by=case when p_status='APPROVED' then auth.uid() else approved_by end,
      approved_at=case when p_status='APPROVED' then now() else approved_at end,
      updated_at=now()
  where id=p_user_id;

  if p_status = 'APPROVED' then
    update public.organization_members set status='ACTIVE',updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.event_user_assignments set is_active=true,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.staff_assignments set is_active=true,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
  else
    update public.organization_members set status='DISABLED',updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.event_user_assignments set is_active=false,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
    update public.staff_assignments set is_active=false,updated_at=now()
    where organization_id=p_organization_id and user_id=p_user_id;
  end if;

  return true;
end;
$$;

create or replace function public.admin_remove_user_from_org(
  p_user_id uuid,
  p_organization_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not (
    public.is_platform_admin()
    or public.has_org_role(p_organization_id,array['OWNER','ORG_ADMIN'])
  ) then raise exception 'ACCESS_DENIED'; end if;
  if p_user_id=auth.uid() then raise exception 'CANNOT_REMOVE_SELF'; end if;

  if exists(select 1 from public.profiles where id=p_user_id and platform_role='SUPER_ADMIN')
     and not public.is_platform_admin() then
    raise exception 'PLATFORM_ADMIN_REQUIRED_FOR_SUPER_ADMIN';
  end if;

  if exists(
       select 1 from public.organization_members
       where organization_id=p_organization_id and user_id=p_user_id
         and role_code='OWNER' and status='ACTIVE'
     )
     and (select count(*) from public.organization_members
          where organization_id=p_organization_id and role_code='OWNER' and status='ACTIVE')<=1 then
    raise exception 'LAST_OWNER_CANNOT_BE_REMOVED';
  end if;

  delete from public.staff_assignments where organization_id=p_organization_id and user_id=p_user_id;
  delete from public.event_user_assignments where organization_id=p_organization_id and user_id=p_user_id;
  delete from public.organization_members where organization_id=p_organization_id and user_id=p_user_id;
  return true;
end;
$$;

-- ------------------------------------------------------------
-- 6) DETAILED ADMIN DASHBOARD
-- ------------------------------------------------------------

create or replace function public.admin_dashboard_runners(p_event_id uuid)
returns table(
  runner_id uuid,
  bib_number text,
  first_name text,
  last_name text,
  display_name text,
  category_id uuid,
  category_code text,
  category_name text,
  age_group text,
  runner_status text,
  check_in_at timestamptz,
  start_at timestamptz,
  last_point_name text,
  last_point_code text,
  last_point_distance_km numeric,
  last_scan_at timestamptz,
  finish_at timestamptz,
  elapsed_seconds bigint,
  missing_required_points integer,
  result_status text,
  overall_finish_order bigint,
  category_finish_order bigint,
  age_group_finish_order bigint
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if not public.can_view_dashboard(p_event_id) then raise exception 'ACCESS_DENIED'; end if;

  return query
  with accepted as (
    select sl.* from public.scan_logs sl
    where sl.event_id=p_event_id and sl.record_status='ACCEPTED'
  ), scan_agg as (
    select a.runner_id,
      min(a.estimated_server_time) filter(where a.scan_action='START_CHECKIN') check_in_at,
      min(a.estimated_server_time) filter(where a.scan_action='START') start_scan_at,
      min(a.estimated_server_time) filter(where a.scan_action='FINISH') finish_scan_at,
      max(a.estimated_server_time) last_scan_at
    from accepted a group by a.runner_id
  ), latest as (
    select distinct on (a.runner_id)
      a.runner_id,a.estimated_server_time,sp.name point_name,sp.code point_code,sp.distance_km
    from accepted a
    join public.scan_points sp on sp.id=a.scan_point_id
    order by a.runner_id,a.estimated_server_time desc,a.id desc
  ), base as (
    select r.id runner_id,r.bib_number,r.first_name,r.last_name,r.display_name,
      rc.id category_id,rc.code category_code,rc.name category_name,r.age_group,
      r.status runner_status,sa.check_in_at,
      coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at) start_at,
      l.point_name last_point_name,l.point_code last_point_code,l.distance_km last_point_distance_km,
      sa.last_scan_at,coalesce(rr.finish_at,sa.finish_scan_at) finish_at,
      coalesce(
        rr.elapsed_seconds,
        extract(epoch from (
          coalesce(rr.finish_at,sa.finish_scan_at)
          - coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at)
        ))::bigint
      ) elapsed_seconds,
      coalesce(rr.missing_required_points,0) missing_required_points,
      coalesce(rr.result_status,'PENDING') result_status
    from public.runners r
    join public.race_categories rc on rc.id=r.race_category_id
    left join public.race_results rr on rr.event_id=r.event_id and rr.runner_id=r.id
    left join scan_agg sa on sa.runner_id=r.id
    left join latest l on l.runner_id=r.id
    where r.event_id=p_event_id
  )
  select b.*,
    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end overall_finish_order,

    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(partition by b.category_id order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end category_finish_order,

    case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      then count(*) filter (

        where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

      ) over(partition by b.category_id,coalesce(b.age_group,'ไม่ระบุ') order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end age_group_finish_order
  from base b
  order by (b.finish_at is null),b.finish_at,b.bib_number;
end;
$$;

create or replace function public.admin_runner_detail(p_runner_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_event uuid;
  v_row jsonb;
  v_scans jsonb;
begin
  select event_id into v_event from public.runners where id=p_runner_id;
  if v_event is null or not public.can_view_dashboard(v_event) then raise exception 'ACCESS_DENIED'; end if;

  select to_jsonb(x) into v_row
  from public.admin_dashboard_runners(v_event) x where x.runner_id=p_runner_id;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.scan_time),'[]'::jsonb)
  into v_scans
  from (
    select sl.id,sl.estimated_server_time scan_time,sl.scan_action,sl.record_status,
           sl.is_offline,sp.code point_code,sp.name point_name,sp.point_type,sp.distance_km,
           sl.source,sl.notes
    from public.scan_logs sl
    join public.scan_points sp on sp.id=sl.scan_point_id
    where sl.runner_id=p_runner_id
    order by sl.estimated_server_time,sl.id
  ) q;

  return jsonb_build_object('runner',v_row,'scans',v_scans);
end;
$$;

-- ------------------------------------------------------------
-- 7) PUBLIC RESULT LOOKUP BY EVENT + BIB
-- ------------------------------------------------------------

create or replace function public.public_result_events()
returns table(
  event_id uuid,
  event_name text,
  event_code text,
  race_date date,
  location_name text,
  status text
)
language sql
stable
security definer
set search_path = public
as $$
  select e.id,e.name,e.event_code,e.race_date,e.location_name,e.status
  from public.events e
  where e.public_results_enabled=true
    and (e.public_results_mode='LIVE' or (e.public_results_mode='FINAL_ONLY' and e.status='FINISHED'))
    and e.status in ('ACTIVE','FINISHED')
  order by e.race_date desc,e.name;
$$;

create or replace function public.public_runner_result(
  p_event_id uuid,
  p_bib_number text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_event public.events%rowtype;
  v_runner uuid;
  v_result jsonb;
  v_scans jsonb;
begin
  select * into v_event from public.events
  where id=p_event_id and public_results_enabled=true
    and (public_results_mode='LIVE' or (public_results_mode='FINAL_ONLY' and status='FINISHED'))
    and status in ('ACTIVE','FINISHED');
  if v_event.id is null then return null; end if;

  select id into v_runner from public.runners
  where event_id=p_event_id and upper(bib_number)=upper(trim(p_bib_number));
  if v_runner is null then return null; end if;

  with accepted as (
    select sl.* from public.scan_logs sl
    where sl.event_id=p_event_id and sl.record_status='ACCEPTED'
  ), scan_agg as (
    select a.runner_id,
      min(a.estimated_server_time) filter(where a.scan_action='START_CHECKIN') check_in_at,
      min(a.estimated_server_time) filter(where a.scan_action='START') start_scan_at,
      min(a.estimated_server_time) filter(where a.scan_action='FINISH') finish_scan_at,
      max(a.estimated_server_time) last_scan_at
    from accepted a group by a.runner_id
  ), base as (
    select r.id runner_id,r.bib_number,r.first_name,r.last_name,r.display_name,
      rc.id category_id,rc.code category_code,rc.name category_name,rc.distance_km,
      r.age_group,r.status runner_status,sa.check_in_at,
      coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at) start_at,
      coalesce(rr.finish_at,sa.finish_scan_at) finish_at,
      coalesce(
        rr.elapsed_seconds,
        extract(epoch from (
          coalesce(rr.finish_at,sa.finish_scan_at)
          - coalesce(rr.individual_start_at,rr.official_start_at,sa.start_scan_at,rc.actual_start_at)
        ))::bigint
      ) elapsed_seconds,
      coalesce(rr.missing_required_points,0) missing_required_points,
      coalesce(rr.result_status,'PENDING') result_status
    from public.runners r
    join public.race_categories rc on rc.id=r.race_category_id
    left join public.race_results rr on rr.event_id=r.event_id and rr.runner_id=r.id
    left join scan_agg sa on sa.runner_id=r.id
    where r.event_id=p_event_id
  ), ranked as (
    select b.*,
      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end overall_finish_order,

      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(partition by b.category_id order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end category_finish_order,

      case when b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        then count(*) filter (

          where b.finish_at is not null and b.result_status in ('FINISHER','LATE_FINISH','PENDING_REVIEW')

        ) over(partition by b.category_id,coalesce(b.age_group,'ไม่ระบุ') order by b.finish_at,b.bib_number rows between unbounded preceding and current row) end age_group_finish_order
    from base b
  )
  select jsonb_build_object(
    'event',jsonb_build_object('id',v_event.id,'name',v_event.name,'event_code',v_event.event_code,
      'race_date',v_event.race_date,'location_name',v_event.location_name,'status',v_event.status,
      'results_mode',v_event.public_results_mode),
    'runner',to_jsonb(r)
  ) into v_result
  from ranked r where r.runner_id=v_runner;

  select coalesce(jsonb_agg(to_jsonb(q) order by q.scan_time),'[]'::jsonb)
  into v_scans
  from (
    select sl.estimated_server_time scan_time,sl.scan_action,sl.record_status,
      sp.code point_code,sp.name point_name,sp.point_type,sp.distance_km
    from public.scan_logs sl
    join public.scan_points sp on sp.id=sl.scan_point_id
    where sl.runner_id=v_runner and sl.record_status='ACCEPTED'
    order by sl.estimated_server_time,sl.id
  ) q;

  return coalesce(v_result,'{}'::jsonb) || jsonb_build_object('checkpoints',v_scans);
end;
$$;

-- ------------------------------------------------------------
-- 8) RLS POLICIES FOR NEW TABLE AND POINT-LEVEL VISIBILITY
-- ------------------------------------------------------------

-- Profiles: ordinary staff see only their own profile; managers can see members of organizations they manage.
drop policy if exists profiles_select_self_or_platform_admin on public.profiles;
drop policy if exists profiles_select_access on public.profiles;
create policy profiles_select_access on public.profiles
for select to authenticated
using (
  id=auth.uid()
  or public.is_platform_admin()
  or exists (
    select 1 from public.organization_members target_membership
    where target_membership.user_id=profiles.id
      and target_membership.status='ACTIVE'
      and public.can_manage_org_staff(target_membership.organization_id)
  )
);

-- Organization membership list is not exposed to ordinary scanner staff.
drop policy if exists organization_members_select_members on public.organization_members;
drop policy if exists organization_members_select_access on public.organization_members;
create policy organization_members_select_access on public.organization_members
for select to authenticated
using (
  user_id=auth.uid()
  or public.can_manage_org_staff(organization_id)
);

-- Only organization-level administrators can create a new Event.
drop policy if exists events_insert_org_admins on public.events;
create policy events_insert_org_admins on public.events
for insert to authenticated
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

-- Result adjustments are visible only to dashboard/result roles.
drop policy if exists result_adjustments_select_event_access on public.result_adjustments;
create policy result_adjustments_select_event_access on public.result_adjustments
for select to authenticated
using (public.can_view_dashboard(event_id));

-- Audit logs are organization-wide only for organization admins; Event managers see assigned Event logs.
drop policy if exists audit_logs_select_admins on public.audit_logs;
drop policy if exists audit_logs_select_scoped on public.audit_logs;
create policy audit_logs_select_scoped on public.audit_logs
for select to authenticated
using (
  public.is_platform_admin()
  or (organization_id is not null and public.has_org_role(organization_id,array['OWNER','ORG_ADMIN']))
  or (event_id is not null and public.can_manage_event(event_id))
);

drop policy if exists event_user_assignments_select on public.event_user_assignments;
create policy event_user_assignments_select on public.event_user_assignments
for select to authenticated
using (
  user_id=auth.uid()
  or public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
  or public.can_manage_event(event_id)
);

drop policy if exists event_user_assignments_insert on public.event_user_assignments;
create policy event_user_assignments_insert on public.event_user_assignments
for insert to authenticated
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

drop policy if exists event_user_assignments_update on public.event_user_assignments;
create policy event_user_assignments_update on public.event_user_assignments
for update to authenticated
using (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
)
with check (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

drop policy if exists event_user_assignments_delete on public.event_user_assignments;
create policy event_user_assignments_delete on public.event_user_assignments
for delete to authenticated
using (
  public.is_platform_admin()
  or public.has_org_role(organization_id,array['OWNER','ORG_ADMIN'])
);

-- Assigned scanner staff may read only their own point; managers may read every point.
drop policy if exists scan_points_select_event_access on public.scan_points;
create policy scan_points_select_event_access on public.scan_points
for select to authenticated
using (
  public.is_platform_admin()
  or public.can_manage_event(event_id)
  or public.can_manage_results(event_id)
  or public.has_event_assignment(event_id,array['VIEWER','SCAN_SUPERVISOR'])
  or public.can_scan_point(id)
);

-- Devices are visible to managers, the assigned user, or staff assigned to the same point.
drop policy if exists devices_select_event_access on public.devices;
create policy devices_select_event_access on public.devices
for select to authenticated
using (
  public.is_platform_admin()
  or public.can_manage_event(event_id)
  or assigned_user_id=auth.uid()
  or (scan_point_id is not null and public.can_scan_point(scan_point_id))
);

-- Basic point staff may read scan records only at an assigned point.
drop policy if exists scan_logs_select_event_access on public.scan_logs;
create policy scan_logs_select_event_access on public.scan_logs
for select to authenticated
using (
  public.can_view_dashboard(event_id)
  or public.can_scan_point(scan_point_id)
);

-- Results are visible only to dashboard/result roles, not ordinary CP staff.
drop policy if exists race_results_select_event_access on public.race_results;
create policy race_results_select_event_access on public.race_results
for select to authenticated
using (public.can_view_dashboard(event_id));

-- Exceptions follow dashboard or assigned-point scope.
drop policy if exists scan_exceptions_select_event_access on public.scan_exceptions;
create policy scan_exceptions_select_event_access on public.scan_exceptions
for select to authenticated
using (
  public.can_view_dashboard(event_id)
  or (scan_point_id is not null and public.can_scan_point(scan_point_id))
);

-- ------------------------------------------------------------
-- 9) PRIVILEGES
-- ------------------------------------------------------------

revoke all on function public.is_approved_user() from public;
revoke all on function public.has_event_assignment(uuid,text[]) from public;
revoke all on function public.can_view_dashboard(uuid) from public;
revoke all on function public.can_manage_org_staff(uuid) from public;
revoke all on function public.can_bootstrap_first_admin() from public;
revoke all on function public.bootstrap_first_admin() from public;
revoke all on function public.get_my_access_context() from public;
revoke all on function public.admin_list_users(uuid) from public;
revoke all on function public.admin_save_user_access(uuid,uuid,text,uuid[],uuid[],text,boolean,boolean) from public;
revoke all on function public.admin_set_user_status(uuid,uuid,text,text) from public;
revoke all on function public.admin_remove_user_from_org(uuid,uuid) from public;
revoke all on function public.admin_dashboard_runners(uuid) from public;
revoke all on function public.admin_runner_detail(uuid) from public;
revoke all on function public.public_result_events() from public;
revoke all on function public.public_runner_result(uuid,text) from public;

grant execute on function public.is_approved_user() to authenticated;
grant execute on function public.has_event_assignment(uuid,text[]) to authenticated;
grant execute on function public.can_view_dashboard(uuid) to authenticated;
grant execute on function public.can_manage_org_staff(uuid) to authenticated;
grant execute on function public.can_bootstrap_first_admin() to authenticated;
grant execute on function public.bootstrap_first_admin() to authenticated;
grant execute on function public.get_my_access_context() to authenticated;
grant execute on function public.admin_list_users(uuid) to authenticated;
grant execute on function public.admin_save_user_access(uuid,uuid,text,uuid[],uuid[],text,boolean,boolean) to authenticated;
grant execute on function public.admin_set_user_status(uuid,uuid,text,text) to authenticated;
grant execute on function public.admin_remove_user_from_org(uuid,uuid) to authenticated;
grant execute on function public.admin_dashboard_runners(uuid) to authenticated;
grant execute on function public.admin_runner_detail(uuid) to authenticated;
grant execute on function public.public_result_events() to anon,authenticated;
grant execute on function public.public_runner_result(uuid,text) to anon,authenticated;

grant select,insert,update,delete on public.event_user_assignments to authenticated;

commit;
