/* 8 Oct 2026 — two migrations applied from the dashboard work, recorded here.

   1. "vendor_public_trust_flags": the public vendor view says what PLUJ has
      checked, without exposing the details themselves. A vendor profile shows
      "What PLUJ checked" from these three fields:
        legal_on_file    legal name, a 9-digit EIN, an address and the owners
        license_on_file  a license or permit number was given
        verified_at      when PLUJ approved the vendor

   2. "subcategories_cap_by_category": rentals companies carry many kinds of
      items, so a rentals listing can have up to 20 subcategories; every other
      category keeps the limit of 3. Matches normalise_service_subcategories(). */

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
            WHEN category = 'places'::text THEN biz_address
            ELSE NULL::text
        END AS biz_address,
        CASE
            WHEN category = 'places'::text THEN biz_zip
            ELSE NULL::text
        END AS biz_zip,
    COALESCE(btrim(biz_legal), ''::text) <> ''::text
      AND length(regexp_replace(COALESCE(ein, ''::text), '\D'::text, ''::text, 'g'::text)) = 9
      AND COALESCE(btrim(biz_address), ''::text) <> ''::text
      AND COALESCE(btrim(managing_members), ''::text) <> ''::text AS legal_on_file,
    COALESCE(btrim(biz_license), ''::text) <> ''::text AS license_on_file,
    verified_at
   FROM vendor_profiles
  WHERE verification_status = 'approved'::text;

alter table public.vendor_services drop constraint if exists vendor_services_subcategories_max3;
alter table public.vendor_services add constraint vendor_services_subcategories_cap
  check (cardinality(subcategories) <= case when category = 'rentals' then 20 else 3 end);
