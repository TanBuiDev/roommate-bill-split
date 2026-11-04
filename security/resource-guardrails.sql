-- Server-side resource guardrails for Ở Ghép.
-- Keep all counters in an unexposed private schema and preserve existing user data.
create table if not exists app_private.request_quotas (
  action_key text not null,
  principal text not null,
  bucket_epoch bigint not null,
  hits integer not null default 1 check (hits > 0),
  created_at timestamptz not null default now(),
  primary key(action_key, principal, bucket_epoch)
);
revoke all on app_private.request_quotas from public, anon, authenticated;
alter table app_private.request_quotas enable row level security;

create or replace function app_private.consume_quota(
  p_action text,p_principal text,p_limit integer,p_window_seconds integer
) returns void language plpgsql security definer set search_path to '' as $$
declare v_hits integer;
begin
  if p_action is null or p_principal is null or length(p_action)>80
     or length(p_principal)>120 or p_limit not between 1 and 1000
     or p_window_seconds not between 60 and 86400 then
    raise exception 'Invalid quota configuration';
  end if;
  insert into app_private.request_quotas(action_key,principal,bucket_epoch,hits)
    values(p_action,p_principal,
      floor(extract(epoch from statement_timestamp())/p_window_seconds)::bigint,1)
    on conflict(action_key,principal,bucket_epoch) do update
       set hits=app_private.request_quotas.hits+1
       where app_private.request_quotas.hits<p_limit
    returning hits into v_hits;
  if v_hits is null then
    raise exception 'Too many requests. Please retry later.' using errcode='P0001';
  end if;
end $$;
revoke all on function app_private.consume_quota(text,text,integer,integer) from public, anon, authenticated;

create or replace function app_private.guard_apartment_creation()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then return new; end if;
  if new.owner_id is distinct from v_uid then
    raise exception 'Invalid apartment owner';
  end if;
  -- Serializes concurrent apartment creation for the same account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('oghep:create_apartment:'||v_uid::text,0)
  );
  if (select count(*) from public.apartments where owner_id=v_uid)>=5 then
    raise exception 'You can own at most 5 apartments';
  end if;
  perform app_private.consume_quota('apartment:create',v_uid::text,3,86400);
  return new;
end $$;
revoke all on function app_private.guard_apartment_creation() from public, anon, authenticated;
drop trigger if exists oghep_guard_apartment_creation on public.apartments;
create trigger oghep_guard_apartment_creation
 before insert on public.apartments for each row
 execute function app_private.guard_apartment_creation();

create or replace function app_private.guard_invitation_creation()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_uid uuid:=auth.uid();
begin
  if v_uid is null then return new; end if;
  if new.invited_by is distinct from v_uid
      or not app_private.is_owner(new.apartment_id) then
    raise exception 'Only the apartment owner can invite members';
  end if;
  perform app_private.consume_quota('invite:apartment',new.apartment_id::text,5,3600);
  perform app_private.consume_quota('invite:account',v_uid::text,10,3600);
  return new;
end $$;
revoke all on function app_private.guard_invitation_creation() from public, anon, authenticated;
drop trigger if exists oghep_guard_invitation_creation on public.apartment_invitations;
create trigger oghep_guard_invitation_creation
 before insert on public.apartment_invitations for each row
 execute function app_private.guard_invitation_creation();

create or replace function app_private.guard_bill_mutation()
returns trigger language plpgsql security definer set search_path to '' as $$
declare v_uid uuid:=auth.uid();v_action text;
begin
  if v_uid is null then return new; end if;
  if not app_private.is_owner(new.apartment_id) then
    raise exception 'Only the apartment owner can modify billing data';
  end if;
  if tg_op='UPDATE' and new is not distinct from old then return new;end if;
  if tg_table_name='apartment_fee_periods' then
    v_action:='period:save';
    perform app_private.consume_quota(v_action,v_uid::text,10,60);
  elsif tg_table_name='apartment_bills' then
    perform app_private.consume_quota('legacy_bill:save',v_uid::text,10,60);
  elsif tg_table_name='apartment_fee_templates' then
    if tg_op='INSERT' and
      (select count(*) from public.apartment_fee_templates
       where apartment_id=new.apartment_id)>=30 then
       raise exception 'Maximum of 30 custom bill types per apartment';
    end if;
    perform app_private.consume_quota('template:write',v_uid::text,30,86400);
  end if;
  return new;
end $$;
revoke all on function app_private.guard_bill_mutation() from public, anon, authenticated;
drop trigger if exists oghep_guard_period_write on public.apartment_fee_periods;
create trigger oghep_guard_period_write
 before insert or update on public.apartment_fee_periods for each row
 execute function app_private.guard_bill_mutation();
drop trigger if exists oghep_guard_legacy_bill_write on public.apartment_bills;
create trigger oghep_guard_legacy_bill_write
 before insert or update on public.apartment_bills for each row
 execute function app_private.guard_bill_mutation();
drop trigger if exists oghep_guard_fee_template_write on public.apartment_fee_templates;
create trigger oghep_guard_fee_template_write
 before insert or update on public.apartment_fee_templates for each row
 execute function app_private.guard_bill_mutation();

-- Target index coverage only for relations used in common owner/resident lookups.
create index if not exists oghep_apartments_owner_idx
 on public.apartments(owner_id);
create index if not exists oghep_residents_user_idx
 on public.apartment_residents(user_id) where user_id is not null;
create index if not exists oghep_allocations_resident_idx
 on public.apartment_allocations(resident_id);
create index if not exists oghep_invitation_resident_idx
 on public.apartment_invitations(resident_id) where resident_id is not null;

comment on table app_private.request_quotas is
  'Fixed-window successful-write quotas; private, inaccessible to browser roles. Failed transactions roll back attempted quota updates.';
