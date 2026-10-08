/* 8 Oct 2026 — listing editor and vendor legal information
   (applied as migration "listings_legal_time")

   1. Rentals can pick more than 3 subcategories (a rental company often has
      tables, tents, linens, dance floors…). Other categories stay at 3.
   2. Time on a listing: how many hours the starting price covers, and the
      price of each extra hour. Pricing options carry their own hours and
      requirements inside the packages JSON, so they need no column.
   3. Legal information is required before a vendor can post (or re-activate)
      a listing: legal business name, business type, EIN, full business
      address, business phone, owners / managing members, and a licence or
      permit number unless the vendor says their service doesn't need one. */

-- 1 ── subcategory cap by category
create or replace function public.normalise_service_subcategories()
returns trigger language plpgsql as $function$
declare
  cleaned text[];
  cap integer := case when new.category = 'rentals' then 20 else 3 end;
begin
  if new.subcategories is null or cardinality(new.subcategories) = 0 then
    if new.subcategory is not null and btrim(new.subcategory) <> '' then
      new.subcategories := array[new.subcategory];
    else
      new.subcategories := '{}';
    end if;
  end if;

  /* Drop blanks, de-duplicate KEEPING the vendor's chosen order (so the first
     one they picked stays primary), then cap. */
  select array(
    select d.x
    from (
      select u.x, min(u.ord) as ord
      from unnest(new.subcategories) with ordinality as u(x, ord)
      where u.x is not null and btrim(u.x) <> ''
      group by u.x
    ) d
    order by d.ord
    limit cap
  ) into cleaned;

  new.subcategories := cleaned;
  new.subcategory := case when cardinality(cleaned) > 0 then cleaned[1] else null end;
  return new;
end $function$;

-- 2 ── service time
alter table public.vendor_services
  add column if not exists duration_hours   numeric,
  add column if not exists extra_hour_price numeric;

alter table public.vendor_services
  add constraint vendor_services_duration_hours_check
    check (duration_hours is null or (duration_hours > 0 and duration_hours <= 720)),
  add constraint vendor_services_extra_hour_price_check
    check (extra_hour_price is null or extra_hour_price >= 0);

-- 3 ── legal information
alter table public.vendor_profiles
  add column if not exists license_not_required boolean not null default false;

/* What is still missing, in words a vendor can act on. Empty = complete. */
create or replace function public.vendor_legal_missing(p_vendor uuid)
returns text[] language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select array_remove(array[
    case when coalesce(btrim(v.biz_legal), '') = '' then 'legal business name' end,
    case when coalesce(btrim(v.biz_type), '') = '' then 'business type' end,
    case when length(regexp_replace(coalesce(v.ein, ''), '\D', '', 'g')) <> 9 then 'EIN (9 digits)' end,
    case when coalesce(btrim(v.managing_members), '') = '' then 'owner / managing members' end,
    case when coalesce(btrim(v.biz_address), '') = '' then 'street address' end,
    case when coalesce(btrim(v.biz_city), '') = '' then 'city' end,
    case when coalesce(btrim(v.biz_state), '') = '' then 'state' end,
    case when coalesce(btrim(v.biz_zip), '') !~ '^\d{5}(-\d{4})?$' then 'ZIP code' end,
    case when length(regexp_replace(coalesce(v.biz_phone, ''), '\D', '', 'g')) < 10 then 'business phone' end,
    case when coalesce(btrim(v.biz_license), '') = '' and not coalesce(v.license_not_required, false)
         then 'licence / permit number (or tick that your service doesn''t need one)' end
  ], null)
  from public.vendor_profiles v
  where v.id = p_vendor
    -- only the vendor themselves, an admin, or the database itself (migration "vendor_legal_missing_own_only")
    and (v.id = auth.uid() or public.is_admin() or public.is_privileged_context())
$function$;

revoke all on function public.vendor_legal_missing(uuid) from public, anon;
grant execute on function public.vendor_legal_missing(uuid) to authenticated;

create or replace function public.require_vendor_legal_info()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare missing text[];
begin
  if public.is_privileged_context() or not coalesce(new.active, true) then return new; end if;
  /* New listings are always checked; updates only when the vendor saves
     their own listing (not system updates made on their behalf). */
  if tg_op = 'UPDATE' and auth.uid() is distinct from new.vendor_id then
    return new;
  end if;
  missing := coalesce(public.vendor_legal_missing(new.vendor_id), array['your business details']);
  if cardinality(missing) > 0 then
    raise exception 'Complete your legal information before posting a listing. Missing: %. Open Business details in your dashboard.',
      array_to_string(missing, ', ');
  end if;
  return new;
end $function$;

create trigger trg_require_vendor_legal_info
  before insert or update on public.vendor_services
  for each row execute function public.require_vendor_legal_info();
