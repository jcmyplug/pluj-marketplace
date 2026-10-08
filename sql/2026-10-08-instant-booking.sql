/* 8 Oct 2026 — instant booking (migration "instant_booking")

   A vendor can switch on Instant booking for a listing that has a fixed
   price. A host can then book an open date at least 72 hours away and it is
   confirmed straight away, at the listed price, without waiting for the
   vendor. Anything that doesn't fit (a blocked date, a weekday the listing
   doesn't work, a full day, too little notice, no price, too many guests)
   falls back to an ordinary request the vendor answers. */

alter table public.vendor_services
  add column if not exists instant_book boolean not null default false,
  add column if not exists instant_terms_accepted_at timestamptz;

/* Instant booking needs a fixed price and the vendor's acceptance of the
   payment terms (they can't tick a box per booking). */
create or replace function public.check_instant_book_listing()
returns trigger language plpgsql set search_path to 'public', 'pg_temp' as $function$
begin
  if coalesce(new.instant_book, false) then
    if coalesce(new.price_value, 0) <= 0 and not exists (
         select 1 from jsonb_array_elements(coalesce(new.packages, '[]'::jsonb)) p
          where coalesce(nullif(p->>'price', '')::numeric, 0) > 0) then
      raise exception 'Instant booking needs a price: add a starting price or a priced option.';
    end if;
    if new.instant_terms_accepted_at is null then
      raise exception 'Tick the box to accept the instant booking terms.';
    end if;
  end if;
  return new;
end $function$;

create trigger trg_check_instant_book_listing
  before insert or update on public.vendor_services
  for each row execute function public.check_instant_book_listing();

/* Called by the host right after their request is saved. Returns
   'confirmed', or the reason it stays a request. */
create or replace function public.instant_book(p_booking text)
returns text language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  b        public.booking_requests%rowtype;
  s        public.vendor_services%rowtype;
  vp       public.vendor_profiles%rowtype;
  starts   timestamptz;
  dow      text;
  days     jsonb;
  taken    integer;
  price    numeric;
  guests_n bigint;
  pay_on   boolean;
begin
  select * into b from public.booking_requests where id = p_booking for update;
  if not found or b.user_id is distinct from auth.uid() then
    return 'not_found';
  end if;
  if b.status <> 'pending' then return 'not_pending'; end if;
  if b.service_id is null then return 'no_listing'; end if;

  select * into s from public.vendor_services where id = b.service_id;
  if not found or not coalesce(s.instant_book, false) or s.active = false or s.instant_terms_accepted_at is null then
    return 'not_instant';
  end if;
  select * into vp from public.vendor_profiles where id = b.vendor_id;
  if not found or vp.verification_status <> 'approved' then return 'vendor_not_approved'; end if;

  if b.event_date is null then return 'no_date'; end if;
  starts := public.booking_starts_at(b.event_date, b.start_time);
  if starts is null or starts < now() + interval '72 hours' then return 'too_soon'; end if;
  if coalesce(s.min_notice_hours, 0) > 0 and starts < now() + make_interval(hours => s.min_notice_hours) then
    return 'too_soon';
  end if;

  -- the weekday must be one the listing works (no days marked = every day)
  dow := (array['Sun','Mon','Tue','Wed','Thu','Fri','Sat'])[extract(dow from b.event_date)::int + 1];
  begin days := coalesce(nullif(s.avail_days, '')::jsonb, '[]'::jsonb);
  exception when others then days := '[]'::jsonb; end;
  if jsonb_typeof(days) = 'array' and jsonb_array_length(days) > 0 and not (days ? dow) then
    return 'day_off';
  end if;

  -- the vendor hasn't blocked the date
  if exists (select 1 from public.vendor_availability
              where vendor_id = b.vendor_id and date = b.event_date and status = 'blocked') then
    return 'date_blocked';
  end if;

  -- room left that day for this listing
  select count(*) into taken from public.booking_requests
   where vendor_id = b.vendor_id and service_id = b.service_id and id <> b.id
     and event_date = b.event_date and status = any (array['confirmed','accepted','approved']);
  if taken >= greatest(coalesce(s.max_per_day, 1), 1) then return 'day_full'; end if;

  guests_n := nullif(regexp_replace(coalesce(b.guests, ''), '[^0-9]', '', 'g'), '')::bigint;
  if guests_n is not null and ((s.capacity_max is not null and guests_n > s.capacity_max)
                            or (s.capacity_min is not null and guests_n < s.capacity_min)) then
    return 'guests';
  end if;

  price := coalesce(b.package_price, s.price_value);
  if coalesce(price, 0) <= 0 then return 'no_price'; end if;

  select coalesce(value = 'true', false) into pay_on from public.platform_settings where key = 'payments_enabled';
  if coalesce(pay_on, false) and not (coalesce(vp.stripe_charges_enabled, false) and coalesce(vp.stripe_payouts_locked, false)) then
    return 'vendor_payments_not_ready';
  end if;

  -- Confirm on the vendor's behalf, under the terms they accepted for instant booking.
  perform set_config('plug.self_service', 'on', true);
  update public.booking_requests
     set total_price = price,
         payment_terms_accepted = true,
         vendor_note = coalesce(vendor_note, 'Confirmed instantly (Instant booking).'),
         status = 'confirmed'
   where id = b.id;
  perform set_config('plug.self_service', '', true);

  insert into public.notifications (user_id, type, title, body, request_id)
  values (b.vendor_id, 'instant_booking', '⚡ New instant booking',
          coalesce(b.service_name, 'Your listing') || ' was booked for ' || to_char(b.event_date, 'Mon DD, YYYY')
            || ' at $' || to_char(price, 'FM999,999,990.00') || '. It is confirmed: open Requests for the details.',
          b.id);
  return 'confirmed';
end $function$;

revoke all on function public.instant_book(text) from public, anon;
grant execute on function public.instant_book(text) to authenticated;

/* A first version took a uuid, but booking ids are text; it was never called.
   (migration "instant_book_text_id") */
revoke all on function public.instant_book_confirm(uuid) from public, anon, authenticated;
