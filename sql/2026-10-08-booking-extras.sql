/* 8 Oct 2026 — extras in the one price (migration "booking_extras")

   A host can tick a listing's extras (add-ons) when booking, and the total on
   screen, in the cart and on the request is the option plus every extra. The
   request stores which extras were picked; the database prices them from the
   listing itself (as enforce_booking_price already does for the option), so a
   tampered request can't lower the price. Instant booking charges the option
   plus the extras. */

alter table public.booking_requests
  add column if not exists addons jsonb not null default '[]'::jsonb,
  add column if not exists addons_total numeric(10,2) not null default 0;

alter table public.booking_requests add constraint booking_requests_addons_total_check check (addons_total >= 0);

create or replace function public.enforce_booking_addons()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  listing jsonb;
  picked  jsonb := '[]'::jsonb;
  total   numeric := 0;
  want    jsonb;
  hit     jsonb;
begin
  -- An existing booking keeps its extras and their price unless they change.
  if TG_OP = 'UPDATE' and new.addons is not distinct from old.addons
     and new.service_id is not distinct from old.service_id then
    new.addons_total := old.addons_total;
    return new;
  end if;

  if new.service_id is null or jsonb_typeof(coalesce(new.addons, '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(new.addons, '[]'::jsonb)) = 0 then
    new.addons := '[]'::jsonb; new.addons_total := 0;
    return new;
  end if;

  select case when coalesce(btrim(s.addons), '') = '' then '[]'::jsonb else s.addons::jsonb end
    into listing from public.vendor_services s where s.id = new.service_id;
  if listing is null or jsonb_typeof(listing) <> 'array' then listing := '[]'::jsonb; end if;

  -- Keep only extras the listing really offers, at the listing's price, once each.
  for want in select e.value from jsonb_array_elements(new.addons) as e(value) loop
    select a.value into hit from jsonb_array_elements(listing) as a(value)
     where a.value->>'name' = want->>'name' limit 1;
    if hit is not null and not exists (select 1 from jsonb_array_elements(picked) as p(value) where p.value->>'name' = hit->>'name') then
      picked := picked || jsonb_build_array(jsonb_build_object(
                  'name',  hit->>'name',
                  'price', coalesce(nullif(hit->>'price', '')::numeric, 0)));
      total := total + coalesce(nullif(hit->>'price', '')::numeric, 0);
    end if;
  end loop;

  new.addons := picked;
  new.addons_total := round(total, 2);
  return new;
exception when others then
  -- A listing with malformed extras must not block a booking.
  new.addons := '[]'::jsonb; new.addons_total := 0;
  return new;
end $function$;

create trigger trg_enforce_booking_addons
  before insert or update on public.booking_requests
  for each row execute function public.enforce_booking_addons();

-- Instant booking: the price is the option (or starting price) plus extras.
do $mig$
declare
  def text := pg_get_functiondef('public.instant_book(text)'::regprocedure);
  old_s text := 'price := coalesce(b.package_price, s.price_value);';
begin
  if position('addons_total' in def) > 0 then return; end if;
  if position(old_s in def) = 0 then raise exception 'instant_book() not the expected version'; end if;
  execute replace(def, old_s, 'price := coalesce(b.package_price, s.price_value) + coalesce(b.addons_total, 0);');
end $mig$;
