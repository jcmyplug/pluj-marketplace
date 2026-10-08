/* 8 Oct 2026 — the PLUJ promise: if a pro cancels, PLUJ finds a replacement
   (migration "replacement_promise")

   The Terms commit PLUJ to send the host approved vendors for the same
   service, date and area within one business day of a vendor cancelling a
   confirmed booking. This makes sure nobody at PLUJ can miss one:
     - the host's notification says what happens and points to
       "Find a replacement" on the booking;
     - every admin gets a notification and an email with the booking, the
       service, the date and the deadline (one business day). */

do $mig$
declare
  def text := pg_get_functiondef('public.handle_cancellation()'::regprocedure);
  old_s text := $o$'. You will be refunded in full. Browse similar vendors to rebook — '
              || 'your event details are saved so you can request a replacement quickly.'$o$;
  new_s text := $n$'. If you paid through PLUJ, every dollar comes back to you. PLUJ will send you other '
              || 'approved pros who are free on your date within one business day, or open the booking '
              || 'and press Find a replacement to look now.'$n$;
begin
  if position('Find a replacement' in def) > 0 then return; end if;
  if position(old_s in def) = 0 then raise exception 'handle_cancellation() not the expected version'; end if;
  execute replace(def, old_s, new_s);
end $mig$;

create or replace function public.replacement_followup()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  a      record;
  vname  text;
  due    text;
begin
  if not (new.status = 'cancelled' and old.status = any (array['confirmed','accepted','approved'])
          and coalesce(new.cancelled_by, '') = 'vendor') then
    return new;
  end if;
  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'A vendor') into vname
    from public.vendor_profiles where id = new.vendor_id;
  -- One business day, Houston time (Friday or weekend -> Monday).
  due := to_char(
           case extract(isodow from (now() at time zone 'America/Chicago'))::int
             when 5 then (now() at time zone 'America/Chicago') + interval '3 days'
             when 6 then (now() at time zone 'America/Chicago') + interval '2 days'
             else (now() at time zone 'America/Chicago') + interval '1 day' end,
           'Dy Mon DD');
  for a in
    select au.user_id, coalesce(nullif(p.email,''), u.email) as email
      from public.admin_users au
      left join public.profiles p on p.id = au.user_id
      left join auth.users u on u.id = au.user_id
  loop
    insert into public.notifications (user_id, type, title, body, request_id)
    values (a.user_id, 'replacement_needed', '🔁 Find a replacement by ' || due,
            vname || ' cancelled ' || coalesce(nullif(new.service_name,''), 'a booking') || ' for '
              || coalesce(to_char(new.event_date, 'Mon DD, YYYY'), 'an event')
              || ' (booking ' || new.id || '). The PLUJ promise: send the host approved vendors for the same service, date and area by ' || due || '.',
            new.id);
    if a.email is not null then
      begin
        perform public.queue_email(a.email,
          'Find a replacement by ' || due || ' — ' || new.id,
          '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
          || '<h2 style="margin:0 0 8px;font-size:20px;color:#111">' || public.email_html_escape(vname) || ' cancelled a confirmed booking</h2>'
          || '<p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.6">Booking ' || public.email_html_escape(new.id)
          || ', ' || public.email_html_escape(coalesce(new.service_name, '')) || ', '
          || public.email_html_escape(coalesce(to_char(new.event_date, 'Mon DD, YYYY'), '')) || ', '
          || public.email_html_escape(coalesce(new.guests, '')) || ' guests, '
          || public.email_html_escape(coalesce(new.city, '')) || '.</p>'
          || '<p style="margin:0 0 12px;color:#333;font-size:14px;line-height:1.6">The PLUJ promise in the Terms: send the host approved vendors for the same service, free on that date and covering that area, by <b>'
          || due || '</b>.</p>'
          || '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p></div>',
          'replacement_needed', new.id);
      exception when others then
        raise warning '[replacement_followup] email to admin failed: %', sqlerrm;
      end;
    end if;
  end loop;
  return new;
exception when others then
  raise warning '[replacement_followup] booking %: %', new.id, sqlerrm;
  return new;
end $function$;

create trigger trg_replacement_followup
  after update on public.booking_requests
  for each row execute function public.replacement_followup();
