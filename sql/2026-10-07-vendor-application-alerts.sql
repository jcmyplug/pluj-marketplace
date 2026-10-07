/* PLUJ — tell the admins when a new vendor is waiting for approval.
   Applied to the live database on 7 Oct 2026 (migration
   "vendor_application_alerts").

   When it fires: the moment a vendor confirms their email address. That is
   when they can sign in and when approving them means something; a sign-up
   that never confirms (typo, bot) never reaches the admins.

   What it does, for every account in admin_users:
     1. a notification in the 🔔 bell (type vendor_application). Tapping it
        opens the admin panel on the Vendors tab.
     2. an email through the normal email_outbox, which drains to Resend every
        minute, from PLUJ <noreply@pluj.us>.

   It never blocks the vendor. Any error inside it becomes a warning in the
   database log, and the email confirmation still goes through. */

create or replace function public.vendor_application_email_html(
  p_business text, p_contact text, p_email text, p_phone text,
  p_category text, p_location text, p_signed_up timestamptz)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_rows text;
begin
  select coalesce(string_agg(
           '<tr><td style="padding:8px 0;color:#777;border-top:1px solid #eee;vertical-align:top;white-space:nowrap;padding-right:16px">'
           || public.email_html_escape(d.k)
           || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #eee;color:#111">'
           || public.email_html_escape(d.v)
           || '</td></tr>',
           '' order by d.ord), '')
    into v_rows
  from (values
          (1, 'Business'::text, p_business),
          (2, 'Contact',        p_contact),
          (3, 'Email',          p_email),
          (4, 'Phone',          p_phone),
          /* Same labels as CATEGORIES in src/PlujMarketplace.jsx. */
          (5, 'Category',       case lower(p_category)
                                  when 'food'       then 'Food & Drinks'
                                  when 'music'      then 'Music & Performance'
                                  when 'production' then 'Decor & Styling'
                                  when 'logistics'  then 'Logistics'
                                  when 'places'     then 'Places & Venues'
                                  when 'rentals'    then 'Rentals'
                                  when 'av'         then 'Audio & Visual'
                                  when 'other'      then 'Other Services'
                                  else initcap(p_category) end),
          (6, 'Location',       p_location),
          (7, 'Signed up',      case when p_signed_up is null then null
                                     else to_char(p_signed_up at time zone 'America/Chicago',
                                                  'Mon FMDD, YYYY FMHH12:MI AM') || ' (Houston time)' end)
       ) as d(ord, k, v)
  where coalesce(d.v, '') <> '';

  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
      || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#FFF7ED;color:#C2410C">New vendor application</div>'
      || '<h2 style="margin:12px 0 6px;font-size:20px;color:#111">'
      || public.email_html_escape(coalesce(p_business, 'A new vendor')) || ' is waiting for approval</h2>'
      || '<p style="margin:0 0 18px;color:#555;font-size:14px;line-height:1.6">They confirmed their email and can now sign in. '
      || 'Review their details, then accept or decline them in the PLUJ admin panel.</p>'
      || '<table style="width:100%;border-collapse:collapse;font-size:14px">' || v_rows || '</table>'
      || '<p style="margin:22px 0 0"><a href="https://www.pluj.us/" style="display:inline-block;padding:12px 22px;border-radius:999px;'
      || 'background:#FF5C28;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Open PLUJ to review</a></p>'
      || '<p style="margin:18px 0 0;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#555;font-size:12px;line-height:1.6">'
      || 'Sign in with your admin account, then tap the 🔔 notification, or open 🛡️ Admin → Vendors, and press Accept or Decline.</p>'
      || '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p>'
      || '</div>';
end $$;

create or replace function public.notify_admins_vendor_application()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  vp         public.vendor_profiles%rowtype;
  v_email    text;
  v_name     text;
  v_business text;
  v_subject  text;
  v_html     text;
  a          record;
begin
  /* Only the false → true flip of email_verified on a vendor. The sync trigger
     rewrites email_verified on every auth.users update (each sign-in), so
     "already true" must not fire again. */
  if new.role is distinct from 'vendor'
     or not coalesce(new.email_verified, false)
     or coalesce(old.email_verified, false) then
    return new;
  end if;

  begin
    select * into vp from public.vendor_profiles where id = new.id;
    if not found or vp.verification_status is distinct from 'pending' then
      return new;
    end if;

    select coalesce(nullif(btrim(new.email), ''), u.email)
      into v_email from auth.users u where u.id = new.id;
    v_name     := coalesce(nullif(btrim(new.full_name), ''), nullif(btrim(new.display_name), ''));
    v_business := coalesce(nullif(btrim(vp.business_name), ''), nullif(btrim(vp.biz_legal), ''),
                           v_name, 'A new vendor');
    v_subject  := 'New vendor waiting for approval: ' || v_business;
    v_html     := public.vendor_application_email_html(
                    v_business, v_name, v_email,
                    coalesce(nullif(btrim(vp.biz_phone), ''), nullif(btrim(new.phone), '')),
                    nullif(btrim(vp.category), ''),
                    nullif(concat_ws(', ', nullif(btrim(vp.biz_city), ''), nullif(btrim(vp.biz_state), '')), ''),
                    coalesce(vp.created_at, new.created_at));

    for a in
      select au.user_id, coalesce(nullif(btrim(p.email), ''), u.email) as email
        from public.admin_users au
        left join public.profiles p on p.id = au.user_id
        left join auth.users   u on u.id = au.user_id
    loop
      insert into public.notifications (user_id, type, title, body)
      values (a.user_id, 'vendor_application', 'New vendor waiting for approval',
              v_business || coalesce(' (' || v_email || ')', '')
                || ' signed up as a vendor. Tap to review and approve.');

      if a.email like '%@%' and not exists (
           select 1 from public.email_outbox o
            where o.kind = 'vendor_application' and o.ref_id = new.id::text
              and lower(o.to_email) = lower(a.email)) then
        perform public.queue_email(a.email, v_subject, v_html, 'vendor_application', new.id::text);
      end if;
    end loop;
  exception when others then
    raise warning 'notify_admins_vendor_application failed for %: %', new.id, sqlerrm;
  end;

  return new;
end $$;

drop trigger if exists trg_notify_admins_vendor_application on public.profiles;
create trigger trg_notify_admins_vendor_application
  after update of email_verified on public.profiles
  for each row execute function public.notify_admins_vendor_application();

revoke all on function public.notify_admins_vendor_application() from public, anon, authenticated;
revoke all on function public.vendor_application_email_html(text, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
