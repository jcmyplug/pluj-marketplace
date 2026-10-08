/* 8 Oct 2026 — trust (migration "blind_reviews_checks_languages")

   1. Reviews only from a real booking, after the event, revealed together.
      A host can review a vendor (and a vendor a host) only for a confirmed
      booking between them whose event date has passed. Neither side sees the
      other's review until both have written one, or 14 days have gone by, so
      nobody reviews in retaliation. The subject's notification no longer
      carries the stars or the text before the reveal.

   2. Checks PLUJ does by hand, shown as badges: certificate of insurance
      (with its expiry date), DSHS food permit (food trucks and caterers) and
      TABC permit (alcohol). The vendor enters the details; only an admin can
      mark one checked, and changing the details clears the check.

   3. Languages a vendor speaks with clients, for the "Habla español" filter. */

-- 1. Reviews -----------------------------------------------------------------
alter table public.reviews add column if not exists revealed_at timestamptz;

alter policy reviews_gated_insert on public.reviews with check (
  author_id = auth.uid() and is_active() and booking_id is not null and exists (
    select 1 from public.booking_requests b
     where b.id = reviews.booking_id
       and b.status = any (array['confirmed','accepted','approved','completed'])
       and b.event_date is not null and b.event_date <= current_date
       and ((reviews.direction = 'user_to_vendor' and b.user_id = auth.uid() and b.vendor_id = reviews.subject_id)
         or (reviews.direction = 'vendor_to_user' and b.vendor_id = auth.uid() and b.user_id = reviews.subject_id))));

alter policy reviews_public_select on public.reviews using (
  revealed_at is not null or created_at < now() - interval '14 days'
  or author_id = auth.uid() or is_admin());

-- One review per side per booking.
create unique index if not exists reviews_one_per_side
  on public.reviews (booking_id, direction) where booking_id is not null;

create or replace function public.notify_on_review()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  author_name text;
  other       public.reviews%rowtype;
begin
  if new.direction = 'user_to_vendor' then
    select coalesce(nullif(display_name,''), nullif(full_name,''), 'Your host')
      into author_name from public.profiles where id = new.author_id;
  else
    select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'Your vendor')
      into author_name from public.vendor_profiles where id = new.author_id;
  end if;

  select * into other from public.reviews
   where booking_id = new.booking_id and direction <> new.direction and id <> new.id limit 1;

  if other.id is not null then
    -- Both sides have written: reveal both and tell both.
    perform set_config('plug.self_service', 'on', true);
    update public.reviews set revealed_at = now() where id in (new.id, other.id) and revealed_at is null;
    perform set_config('plug.self_service', '', true);
    insert into public.notifications (user_id, type, title, body, request_id) values
      (new.subject_id,  'review', 'Your reviews are now public', 'You and ' || coalesce(author_name, 'the other side') || ' have both reviewed this booking, so both reviews are now visible.', new.booking_id),
      (new.author_id,   'review', 'Your reviews are now public', 'Both reviews for this booking are now visible.', new.booking_id);
  else
    insert into public.notifications (user_id, type, title, body, request_id)
    values (new.subject_id, 'review', coalesce(author_name, 'Someone') || ' reviewed you',
            'Write your review of them too: both reviews appear together once you have, or in 14 days.',
            new.booking_id);
  end if;
  return new;
end $function$;

-- Reviews written before this change stay visible.
update public.reviews set revealed_at = created_at where revealed_at is null;

-- 2. Checks ------------------------------------------------------------------
alter table public.vendor_profiles
  add column if not exists coi_insurer       text,
  add column if not exists coi_expires_on    date,
  add column if not exists coi_checked_at    timestamptz,
  add column if not exists dshs_permit       text,
  add column if not exists dshs_checked_at   timestamptz,
  add column if not exists tabc_permit       text,
  add column if not exists tabc_checked_at   timestamptz,
  add column if not exists languages         text[] not null default array['en']::text[];

create or replace function public.guard_vendor_checks()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  -- Admins (and the system) set checks; vendors cannot mark their own.
  if public.is_privileged_context() then return new; end if;
  if TG_OP = 'INSERT' then
    new.coi_checked_at := null; new.dshs_checked_at := null; new.tabc_checked_at := null;
    return new;
  end if;
  new.coi_checked_at  := old.coi_checked_at;
  new.dshs_checked_at := old.dshs_checked_at;
  new.tabc_checked_at := old.tabc_checked_at;
  -- Changing what was checked means it has to be checked again.
  if (new.coi_insurer, new.coi_expires_on) is distinct from (old.coi_insurer, old.coi_expires_on) then new.coi_checked_at := null; end if;
  if new.dshs_permit is distinct from old.dshs_permit then new.dshs_checked_at := null; end if;
  if new.tabc_permit is distinct from old.tabc_permit then new.tabc_checked_at := null; end if;
  return new;
end $function$;

create trigger trg_guard_vendor_checks
  before insert or update on public.vendor_profiles
  for each row execute function public.guard_vendor_checks();

alter table public.vendor_profiles add constraint vendor_profiles_languages_known
  check (languages <@ array['en','es','vi','zh','ar','fr','hi','ur','tl','ko','pt']::text[]);

-- The public view gets the badges (whether a check is current), not the details.
create or replace view public.vendor_public as
 SELECT id, business_name, biz_legal, biz_website, category, subcategory, service_type, description,
    price_value, capacity, project_size, photos, event_types, service_categories, years_in_biz,
    travel_miles, service_areas, schedule, biz_city, biz_state, photo_count, verification_status, created_at,
    CASE WHEN category = 'places'::text THEN biz_address ELSE NULL::text END AS biz_address,
    CASE WHEN category = 'places'::text THEN biz_zip ELSE NULL::text END AS biz_zip,
    COALESCE(btrim(biz_legal), ''::text) <> ''::text
      AND length(regexp_replace(COALESCE(ein, ''::text), '\D'::text, ''::text, 'g'::text)) = 9
      AND COALESCE(btrim(biz_address), ''::text) <> ''::text
      AND COALESCE(btrim(managing_members), ''::text) <> ''::text AS legal_on_file,
    COALESCE(btrim(biz_license), ''::text) <> ''::text AS license_on_file,
    verified_at,
    coi_checked_at IS NOT NULL AND coi_expires_on >= current_date AS coi_checked,
    CASE WHEN coi_checked_at IS NOT NULL AND coi_expires_on >= current_date THEN coi_expires_on END AS coi_valid_until,
    dshs_checked_at IS NOT NULL AS dshs_checked,
    tabc_checked_at IS NOT NULL AS tabc_checked,
    languages
   FROM vendor_profiles
  WHERE verification_status = 'approved'::text;
