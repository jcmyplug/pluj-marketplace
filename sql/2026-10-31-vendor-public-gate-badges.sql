-- 31 Oct 2026 — Vendor profiles go public only with complete legal information;
-- the licence becomes optional and earns a badge once PLUJ checks it.
-- Also closes a hole: the public views were writable.

-- 0 ── The views are read-only to the website ──────────────────────────────
/* vendor_public and vendor_directory are simple views owned by postgres, so
   Postgres let anyone with UPDATE/DELETE on them write straight through to
   vendor_profiles, skipping its row-level security. anon and authenticated had
   those grants (the Supabase defaults), and is_privileged_context() counts a
   signed-out caller as privileged, so a signed-out visitor could rewrite or
   delete an approved vendor's public profile. The site only ever reads them. */
revoke insert, update, delete, truncate, references, trigger
  on public.vendor_public, public.vendor_directory, public.review_ratings, public.vendor_booked_dates
  from anon, authenticated;

-- 1 ── Licence check, set by PLUJ only ──────────────────────────────────────
alter table public.vendor_profiles
  add column if not exists license_checked_at timestamptz;

create or replace function public.guard_vendor_checks()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if public.is_privileged_context() then return new; end if;
  if TG_OP = 'INSERT' then
    new.coi_checked_at := null; new.dshs_checked_at := null; new.tabc_checked_at := null;
    new.license_checked_at := null;
    return new;
  end if;
  new.coi_checked_at     := old.coi_checked_at;
  new.dshs_checked_at    := old.dshs_checked_at;
  new.tabc_checked_at    := old.tabc_checked_at;
  new.license_checked_at := old.license_checked_at;
  if (new.coi_insurer, new.coi_expires_on) is distinct from (old.coi_insurer, old.coi_expires_on) then new.coi_checked_at := null; end if;
  if new.dshs_permit is distinct from old.dshs_permit then new.dshs_checked_at := null; end if;
  if new.tabc_permit is distinct from old.tabc_permit then new.tabc_checked_at := null; end if;
  if new.biz_license is distinct from old.biz_license then new.license_checked_at := null; end if;
  return new;
end $function$;

-- 2 ── What a vendor still has to add (licence no longer on the list) ────────
create or replace function public.vendor_missing_items(v public.vendor_profiles)
returns text[] language sql immutable set search_path to 'public', 'pg_temp' as $function$
  select array_remove(array[
    case when coalesce(btrim(v.biz_legal), '') = '' then 'legal business name' end,
    case when coalesce(btrim(v.biz_type), '') = '' then 'business type' end,
    case when length(regexp_replace(coalesce(v.ein, ''), '\D', '', 'g')) <> 9 then 'EIN (9 digits)' end,
    case when coalesce(btrim(v.managing_members), '') = '' then 'owner / managing members' end,
    case when coalesce(btrim(v.biz_address), '') = '' then 'street address' end,
    case when coalesce(btrim(v.biz_city), '') = '' then 'city' end,
    case when coalesce(btrim(v.biz_state), '') = '' then 'state' end,
    case when coalesce(btrim(v.biz_zip), '') !~ '^\d{5}(-\d{4})?$' then 'ZIP code' end,
    case when length(regexp_replace(coalesce(v.biz_phone, ''), '\D', '', 'g')) < 10 then 'business phone' end
  ], null)
$function$;
grant execute on function public.vendor_missing_items(public.vendor_profiles) to anon, authenticated;

create or replace function public.vendor_legal_missing(p_vendor uuid)
returns text[] language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select public.vendor_missing_items(v)
  from public.vendor_profiles v
  where v.id = p_vendor
    -- only the vendor themselves, an admin, or the database itself
    and (v.id = auth.uid() or public.is_admin() or public.is_privileged_context())
$function$;

-- 3 ── Public = approved by PLUJ AND details complete ───────────────────────
create or replace function public.vendor_is_public(p_vendor uuid)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $function$
  select exists (
    select 1 from public.vendor_profiles v
    where v.id = p_vendor
      and v.verification_status = 'approved'
      and cardinality(public.vendor_missing_items(v)) = 0
  )
$function$;
revoke all on function public.vendor_is_public(uuid) from public;
grant execute on function public.vendor_is_public(uuid) to anon, authenticated;

alter policy vendor_services_public_select on public.vendor_services
  using ((active is not false) and public.vendor_is_public(vendor_id));
alter policy vendor_photos_public on public.vendor_photos
  using (public.vendor_is_public(vendor_id));

create or replace view public.vendor_public as
 SELECT id,
    business_name,
    biz_legal,
    biz_website,
    category,
    subcategory,
    service_type,
    description,
    price_value,
    capacity,
    project_size,
    photos,
    event_types,
    service_categories,
    years_in_biz,
    travel_miles,
    service_areas,
    schedule,
    biz_city,
    biz_state,
    photo_count,
    verification_status,
    created_at,
        CASE
            WHEN (category = 'places'::text) THEN biz_address
            ELSE NULL::text
        END AS biz_address,
        CASE
            WHEN (category = 'places'::text) THEN biz_zip
            ELSE NULL::text
        END AS biz_zip,
    ((COALESCE(btrim(biz_legal), ''::text) <> ''::text) AND (length(regexp_replace(COALESCE(ein, ''::text), '\D'::text, ''::text, 'g'::text)) = 9) AND (COALESCE(btrim(biz_address), ''::text) <> ''::text) AND (COALESCE(btrim(managing_members), ''::text) <> ''::text)) AS legal_on_file,
    (COALESCE(btrim(biz_license), ''::text) <> ''::text) AS license_on_file,
    verified_at,
    ((coi_checked_at IS NOT NULL) AND (coi_expires_on >= CURRENT_DATE)) AS coi_checked,
        CASE
            WHEN ((coi_checked_at IS NOT NULL) AND (coi_expires_on >= CURRENT_DATE)) THEN coi_expires_on
            ELSE NULL::date
        END AS coi_valid_until,
    (dshs_checked_at IS NOT NULL) AS dshs_checked,
    (tabc_checked_at IS NOT NULL) AS tabc_checked,
    languages,
    ((license_checked_at IS NOT NULL) AND (COALESCE(btrim(biz_license), ''::text) <> ''::text)) AS license_checked
   FROM vendor_profiles
  WHERE (verification_status = 'approved'::text)
    AND (cardinality(public.vendor_missing_items(vendor_profiles.*)) = 0);

-- recreating the view keeps its grants; make sure it stays read-only
revoke insert, update, delete, truncate, references, trigger on public.vendor_public from anon, authenticated;

-- 4 ── The approval notice says what's left ─────────────────────────────────
create or replace function public.notify_vendor_on_approval_decision()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.verification_status is distinct from old.verification_status then
    if new.verification_status = 'approved' then
      if cardinality(public.vendor_missing_items(new)) = 0 then
        insert into public.notifications (user_id, type, title, body)
        values (new.id, 'vendor_approved', 'Your business is approved 🎉',
                'Your listings are now live on PLUJ and hosts can send you booking requests.');
      else
        insert into public.notifications (user_id, type, title, body)
        values (new.id, 'vendor_approved', 'Your business is approved 🎉',
                'One step left: add your legal information in Business details (' ||
                array_to_string(public.vendor_missing_items(new), ', ') ||
                '). Your profile and listings go live on PLUJ as soon as it''s complete.');
      end if;
    elsif new.verification_status = 'rejected' then
      insert into public.notifications (user_id, type, title, body)
      values (new.id, 'vendor_rejected', 'Your business was not approved',
              coalesce('Reason: ' || nullif(new.rejection_reason, ''), 'Check your business details and contact PLUJ if you have questions.'));
    end if;
  end if;
  return new;
end $function$;

/* Approved vendors who finish their legal information go live by themselves;
   tell them when it happens. */
create or replace function public.notify_vendor_went_live()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if new.verification_status = 'approved'
     and old.verification_status = 'approved'
     and cardinality(public.vendor_missing_items(old)) > 0
     and cardinality(public.vendor_missing_items(new)) = 0 then
    insert into public.notifications (user_id, type, title, body)
    values (new.id, 'vendor_live', 'Your profile is live on PLUJ 🎉',
            'Your legal information is complete, so hosts can now see your profile and listings and send you booking requests.');
  end if;
  return new;
end $function$;
create or replace trigger trg_notify_vendor_went_live
  after update on public.vendor_profiles
  for each row execute function public.notify_vendor_went_live();

-- 5 ── Instant booking only with a public vendor ────────────────────────────
do $patch$
declare d text; old_txt text := $x$vp.verification_status <> 'approved' then return 'vendor_not_approved'$x$;
begin
  d := pg_get_functiondef('public.instant_book(text)'::regprocedure);
  if (length(d) - length(replace(d, old_txt, ''))) / length(old_txt) <> 1 then
    raise exception 'instant_book: expected exactly one approval check to patch';
  end if;
  d := replace(d, old_txt,
    $x$vp.verification_status <> 'approved' or not public.vendor_is_public(vp.id) then return 'vendor_not_approved'$x$);
  execute d;
end $patch$;
