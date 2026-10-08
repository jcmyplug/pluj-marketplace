/* 8 Oct 2026 — refund reserve (migration "refund_reserve")

   Releases already follow the host cancellation schedule: before the event,
   PLUJ never releases more than the vendor would keep if the host cancelled
   that day (nothing until 7 days out, when a host cancelling would get 70%
   back and the vendor keeps 30%, which is the first release).

   The gap was a VENDOR cancellation after the first release: the host gets
   100% back, but 30% has already gone to the vendor's bank. So the first
   release is now held as a refund reserve, and paid the day after the event
   together with the second part, when the vendor
     - has fewer than 3 fully released bookings on PLUJ (setting
       refund_reserve_bookings), or
     - cancelled a confirmed booking in the last 12 months.
   Proven vendors keep getting the first part a week before the event.

   Patched in place with replace() on the live function body so nothing else
   in payments_on_booking_change() is retyped. */

insert into public.platform_settings (key, value)
values ('refund_reserve_bookings', '3')
on conflict (key) do nothing;

do $mig$
declare
  def text := pg_get_functiondef('public.payments_on_booking_change()'::regprocedure);
  anchor text := 'fin_at := public.booking_release_at(new.event_date, new.end_date);';
  old_note text := '|| split[1] || ''% a week before the event, '' || split[2] || ''% the day after, and the last '' || split[3]';
begin
  if position('refund_reserve_bookings' in def) > 0 then return; end if;   -- already applied
  if position(anchor in def) = 0 or position(old_note in def) = 0 then
    raise exception 'payments_on_booking_change() is not the expected version; not patched';
  end if;

  def := replace(def, anchor, anchor || $add$

    /* Refund reserve (8 Oct 2026): for vendors without a track record, the
       first part waits until the day after the event, so a vendor
       cancellation can always be refunded in full from what is locked. */
    if (case when plan.booking_id is null
             then (select count(*) from public.booking_payment_plans p
                    where p.vendor_id = new.vendor_id and p.status = 'released')
             else coalesce(plan.vendor_completed_before, 0) end)
         < coalesce((select nullif(value, '')::int from public.platform_settings where key = 'refund_reserve_bookings'), 3)
       or exists (select 1 from public.booking_payment_plans p
                   where p.vendor_id = new.vendor_id and p.booking_id <> new.id
                     and p.status = 'cancelled' and coalesce(p.cancelled_by, '') <> 'customer'
                     and p.updated_at > now() - interval '12 months') then
      ret_at := greatest(ev_at, ret_at);
    end if;$add$);

  def := replace(def, old_note,
    $new$|| split[1] || (case when ret_at >= ev_at then '% the day after the event (held until then as a refund reserve), ' else '% a week before the event, ' end)
                || split[2] || '% the day after, and the last ' || split[3]$new$);

  execute def;
end $mig$;

/* Wording of the host's "Pay to secure" note (migration
   "refund_reserve_note_wording"): "30% and 20% the day after the event, and
   the last 50% …" with the reserve, "30% a week before the event, 50% the
   day after the event, and the last 20% …" without. */
do $mig$
declare
  def text := pg_get_functiondef('public.payments_on_booking_change()'::regprocedure);
  old_s text := $o$(case when ret_at >= ev_at then '% the day after the event (held until then as a refund reserve), ' else '% a week before the event, ' end)
                || split[2] || '% the day after, and the last '$o$;
  new_s text := $n$(case when ret_at >= ev_at then '% and ' else '% a week before the event, ' end)
                || split[2] || '% the day after the event, and the last '$n$;
begin
  if position(old_s in def) = 0 then return; end if;
  execute replace(def, old_s, new_s);
end $mig$;
