/* PLUJ — vendors describe their business and confirm it is true at sign-up;
   hosts confirm they will check vendors themselves; admins review every
   vendor application. Applied to the live database on 7 Oct 2026 in two
   migrations:

   1. vendor_signup_store   — new column profiles.responsibility_accepted_at;
      handle_new_user saves the sign-up description into
      vendor_profiles.description (the vendor's public "About" once approved)
      and records when the responsibility box was ticked; the admin "new
      vendor" email shows the description. Nothing is required yet.
   2. vendor_signup_require — handle_new_user refuses a sign-up without the
      responsibility box, and a vendor sign-up without a description of at
      least 40 characters; terms_version moves to 2026-10-07. Applied after
      the new sign-up form was live, so nobody mid-sign-up on the old form
      was blocked. Keep 40 in step with VENDOR_DESC_MIN in
      src/PlujMarketplace.jsx.

   Below is the final state. */

alter table public.profiles add column if not exists responsibility_accepted_at timestamptz;
comment on column public.profiles.responsibility_accepted_at is
  'When the account ticked the sign-up responsibility box. Vendors: everything they tell PLUJ is true and they are responsible for their posts. Hosts: they will check vendors themselves before booking. Set only by handle_new_user; cannot be changed by the account.';

/* Same as before, plus: an account cannot set or rewrite its own
   responsibility_accepted_at. */
create or replace function public.guard_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  if public.is_privileged_context() then return new; end if;

  if new.role is distinct from old.role then
    raise exception 'account role is managed by PLUJ';
  end if;

  if new.status is distinct from old.status then
    if not (old.status in ('active','deactivated') and new.status in ('active','deactivated')) then
      raise exception 'account status is managed by PLUJ';
    end if;
  end if;

  if new.blocked_reason is distinct from old.blocked_reason then
    raise exception 'account status is managed by PLUJ';
  end if;

  if new.terms_version is distinct from old.terms_version then
    if old.terms_version is not null
       and new.terms_version is not distinct from 'pre-tracking' then
      raise exception 'terms acceptance cannot be rewritten';
    end if;
    new.terms_accepted_at := now();
  elsif new.terms_accepted_at is distinct from old.terms_accepted_at then
    raise exception 'terms acceptance cannot be rewritten';
  end if;

  if new.responsibility_accepted_at is distinct from old.responsibility_accepted_at then
    raise exception 'acceptance records cannot be rewritten';
  end if;

  return new;
end $function$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare
  m          jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  requested  text  := coalesce(m->>'role', 'user');
  safe_role  text  := case when requested = 'vendor' then 'vendor' else 'user' end;
  cur_terms  text;
  v_dob      date;
  v_years    integer;
  v_travel   integer;
  v_desc     text  := left(nullif(btrim(coalesce(m->>'description', '')), ''), 1000);
  v_resp     boolean := lower(coalesce(m->>'responsibility_accepted', '')) = 'true';
begin
  select value into cur_terms from public.platform_settings where key = 'terms_version';

  /* Unparseable is treated as absent rather than fatal: a malformed string
     should not be the reason a signup fails. The rules still apply to every
     value that IS a date. */
  begin
    v_dob := nullif(btrim(coalesce(m->>'dob', '')), '')::date;
  exception when others then
    v_dob := null;
  end;

  if v_dob is not null then
    if v_dob > current_date then
      raise exception 'Date of birth cannot be in the future.';
    end if;
    if v_dob > (current_date - interval '18 years') then
      raise exception 'You must be at least 18 years old to create an account.';
    end if;
    if v_dob < (current_date - interval '120 years') then
      raise exception 'Please enter a valid date of birth.';
    end if;
  end if;

  /* REQUIRED (migration 2). The sign-up form checks both of these too; these
     are the checks a script calling the signup endpoint can't skip.
     Every account ticks the responsibility box: vendors that everything they
     tell PLUJ is true and they are responsible for their posts, hosts that
     they will check vendors themselves before booking. */
  if not v_resp then
    raise exception 'Please confirm the responsibility statement to create your account.';
  end if;
  /* Every vendor is reviewed by hand before going live, and the review starts
     from their own description of the business. */
  if safe_role = 'vendor' and length(coalesce(v_desc, '')) < 40 then
    raise exception 'Please describe your business in at least 40 characters.';
  end if;

  insert into public.profiles (
    id, role, display_name, full_name, phone, dob,
    email_verified, phone_verified, status, geo_signal,
    terms_accepted_at, terms_version, responsibility_accepted_at
  ) values (
    new.id,
    safe_role,
    coalesce(m->>'display_name', m->>'full_name', split_part(new.email, '@', 1)),
    coalesce(m->>'full_name', m->>'display_name'),
    m->>'biz_phone',
    v_dob,
    false, false,
    case when safe_role = 'vendor' then 'pending' else 'active' end,
    null,
    now(),
    coalesce(cur_terms, 'unversioned'),
    case when v_resp then now() end
  );

  if safe_role = 'vendor' then
    /* Strip non-digits before casting so a vendor typing "12 years" cannot
       abort their own signup with a cast error. */
    v_years  := nullif(regexp_replace(coalesce(m->>'years_in_biz', ''), '[^0-9]', '', 'g'), '')::integer;
    v_travel := nullif(regexp_replace(coalesce(m->>'travel_miles', ''), '[^0-9]', '', 'g'), '')::integer;

    insert into public.vendor_profiles (
      id, verification_status,
      business_name, biz_legal, biz_type, biz_license, ein,
      years_in_biz, biz_phone, biz_website, managing_members,
      biz_address, biz_city, biz_state, biz_zip,
      service_areas, schedule, category, capacity,
      travel_miles, project_size, doc_file_name, market_id,
      description
    ) values (
      new.id, 'pending',
      nullif(m->>'business_name',''),
      nullif(m->>'biz_legal',''),
      nullif(m->>'biz_type',''),
      nullif(m->>'biz_license',''),
      nullif(m->>'ein',''),
      v_years,
      nullif(m->>'biz_phone',''),
      nullif(m->>'biz_website',''),
      nullif(m->>'managing_members',''),
      nullif(m->>'biz_address',''),
      nullif(m->>'biz_city',''),
      coalesce(nullif(m->>'biz_state',''), 'TX'),
      nullif(m->>'biz_zip',''),
      nullif(m->>'service_areas',''),
      nullif(m->>'schedule',''),
      nullif(m->>'category',''),
      nullif(m->>'capacity',''),
      v_travel,
      nullif(m->>'project_size',''),
      nullif(m->>'doc_file_name',''),
      coalesce(nullif(m->>'market_id',''), 'houston-tx'),
      v_desc
    )
    on conflict (id) do nothing;
  end if;

  return new;
end;
$function$;

/* The admin email gains the vendor's description: an 8-argument version.
   The 7-argument version from 2026-10-07-vendor-application-alerts.sql is
   left in place, unused (dropping it needs a confirmation the migration tool
   could not show); it is safe to drop later. */

create or replace function public.vendor_application_email_html(
  p_business text, p_contact text, p_email text, p_phone text,
  p_category text, p_location text, p_signed_up timestamptz, p_description text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_rows text;
  v_desc text;
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

  v_desc := case when coalesce(btrim(p_description), '') = ''
    then '<p style="margin:0 0 18px;padding:12px 14px;background:#FFFBEB;border-radius:10px;color:#92400E;font-size:13px">'
         || 'No business description given.</p>'
    else '<p style="margin:0 0 6px;color:#777;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">About the business</p>'
         || '<p style="margin:0 0 18px;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#111;font-size:14px;line-height:1.6;white-space:pre-wrap">'
         || public.email_html_escape(left(btrim(p_description), 1000)) || '</p>'
  end;

  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
      || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#FFF7ED;color:#C2410C">New vendor application</div>'
      || '<h2 style="margin:12px 0 6px;font-size:20px;color:#111">'
      || public.email_html_escape(coalesce(p_business, 'A new vendor')) || ' is waiting for approval</h2>'
      || '<p style="margin:0 0 18px;color:#555;font-size:14px;line-height:1.6">They confirmed their email and can now sign in. '
      || 'Review their application, then approve or decline them in the PLUJ admin panel.</p>'
      || v_desc
      || '<table style="width:100%;border-collapse:collapse;font-size:14px">' || v_rows || '</table>'
      || '<p style="margin:22px 0 0"><a href="https://www.pluj.us/" style="display:inline-block;padding:12px 22px;border-radius:999px;'
      || 'background:#FF5C28;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Open PLUJ to review</a></p>'
      || '<p style="margin:18px 0 0;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#555;font-size:12px;line-height:1.6">'
      || 'Sign in with your admin account, then tap the 🔔 notification, or open 🛡️ Admin → Vendors → Review application. '
      || 'Approve or Decline from there.</p>'
      || '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p>'
      || '</div>';
end $$;

revoke all on function public.vendor_application_email_html(text, text, text, text, text, text, timestamptz, text)
  from public, anon, authenticated;

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
  /* Only the false -> true flip of email_verified on a vendor. The sync trigger
     rewrites email_verified on every auth.users update (each sign-in), so
     "already true" must not fire again. */
  if new.role is distinct from 'vendor'
     or not coalesce(new.email_verified, false)
     or coalesce(old.email_verified, false) then
    return new;
  end if;

  /* Never block the vendor's email confirmation: any error here becomes a
     warning in the log. */
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
                    coalesce(vp.created_at, new.created_at),
                    vp.description);

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

revoke all on function public.notify_admins_vendor_application() from public, anon, authenticated;

/* Migration 2 also moved the terms version, so acceptances from today on are
   recorded against the Terms with the new vendor-responsibility and host
   due-diligence sections. */
update public.platform_settings set value = '2026-10-07' where key = 'terms_version';
