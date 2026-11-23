-- PLUJ — "Have a PLUJ planner build it" (23 Nov 2026)
-- Applied as migration planner_requests_2026_11_23.
--
-- In Build My Event a host can choose to hand the whole event to a PLUJ event
-- planner instead of picking vendors one by one. They give the where and when
-- (same first step as the builder), the kind of event, their total budget, a
-- description, and how the planner should reach them. The PLUJ team sees the
-- request in Admin -> Planner, is notified (bell + email), and works it:
-- contacted -> planning -> booked, or closed.
--
-- Security model: the table is server-only (RLS on, no policies, no grants to
-- anon or authenticated). Every read and write goes through the functions
-- below, which check who is asking:
--   request_event_planner()           signed-in, active account; validated;
--                                      3 open and 5 per 24 hours per account
--   my_planner_requests()             your own requests, without the team's
--                                      private notes
--   cancel_planner_request()          your own, while it is still open
--   admin_planner_requests()          admins only, with the host's contact
--   admin_update_planner_request()    admins only: status and private note
-- Deleting an account deletes its requests (foreign key, on delete cascade).

create table if not exists public.planner_requests (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  event_type  text not null check (char_length(event_type) between 1 and 60),
  city        text not null check (char_length(city) between 1 and 80),
  event_date  date not null,
  end_date    date check (end_date is null or end_date >= event_date),
  start_time  text check (start_time is null or start_time ~ '^\d{2}:\d{2}$'),
  end_time    text check (end_time is null or end_time ~ '^\d{2}:\d{2}$'),
  guests      integer not null check (guests between 1 and 100000),
  budget      integer not null check (budget between 100 and 10000000),
  details     text not null check (char_length(details) between 20 and 4000),
  contact     text not null default 'email' check (contact in ('call','text','email')),
  phone       text check (phone is null or char_length(phone) <= 30),
  lang        text not null default 'en' check (lang in ('en','es')),
  status      text not null default 'new'
              check (status in ('new','contacted','planning','booked','closed','cancelled')),
  assigned_to uuid references public.profiles(id) on delete set null,
  admin_note  text check (admin_note is null or char_length(admin_note) <= 4000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists planner_requests_user_idx   on public.planner_requests (user_id, created_at desc);
create index if not exists planner_requests_status_idx on public.planner_requests (status, created_at desc);

alter table public.planner_requests enable row level security;
revoke all on table public.planner_requests from public, anon, authenticated;

/* The money and dates, written the same way in the emails and the app. */
create or replace function public.planner_when_text(p public.planner_requests)
returns text language sql immutable set search_path = public, pg_temp as $$
  select to_char(p.event_date, 'Dy, Mon FMDD, YYYY')
      || case when p.end_date is not null and p.end_date <> p.event_date
              then ' – ' || to_char(p.end_date, 'Dy, Mon FMDD') else '' end
      || case when p.start_time is not null
              then ', ' || to_char(p.start_time::time, 'FMHH12:MI AM')
                 || coalesce(' – ' || to_char(p.end_time::time, 'FMHH12:MI AM'), '')
              else '' end;
$$;
revoke all on function public.planner_when_text(public.planner_requests) from public, anon, authenticated;

create or replace function public.planner_request_email_html(p public.planner_requests, p_name text, p_email text)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare v_rows text;
begin
  select coalesce(string_agg(
           '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7;vertical-align:top;white-space:nowrap">'
           || public.email_html_escape(d.k)
           || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7;color:#0B0C17">'
           || public.email_html_escape(d.v) || '</td></tr>', '' order by d.ord), '')
    into v_rows
  from (values
          (1, 'Event'::text, p.event_type),
          (2, 'When',        public.planner_when_text(p)),
          (3, 'Where',       p.city),
          (4, 'Guests',      p.guests::text),
          (5, 'Budget',      '$' || to_char(p.budget, 'FM999,999,999')),
          (6, 'Host',        p_name),
          (7, 'Email',       p_email),
          (8, 'Phone',       p.phone),
          (9, 'Reach them by', case p.contact when 'call' then 'Phone call' when 'text' then 'Text message' else 'Email' end),
          (10,'Language',    case p.lang when 'es' then 'Spanish' else 'English' end)
       ) as d(ord, k, v)
  where coalesce(d.v, '') <> '';

  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
      || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#EEF2FF;color:#1E40FF">New planner request</div>'
      || '<h2 style="margin:12px 0 6px;font-size:20px;color:#0B0C17">'
      || public.email_html_escape(coalesce(p_name, 'A host')) || ' wants PLUJ to plan their '
      || public.email_html_escape(lower(p.event_type)) || '</h2>'
      || '<p style="margin:0 0 18px;color:#3F4560;font-size:14px;line-height:1.6">They were told a PLUJ planner will contact them within 1 business day.</p>'
      || '<p style="margin:0 0 6px;color:#5A6080;font-size:12px;font-weight:700">About the event</p>'
      || '<p style="margin:0 0 18px;padding:12px 14px;background:#F4F7FF;border-radius:10px;color:#0B0C17;font-size:14px;line-height:1.6;white-space:pre-wrap">'
      || public.email_html_escape(p.details) || '</p>'
      || '<table style="width:100%;border-collapse:collapse;font-size:14px">' || v_rows || '</table>'
      || '<p style="margin:22px 0 0"><a href="https://www.pluj.us/" style="display:inline-block;padding:12px 22px;border-radius:999px;'
      || 'background:#1E40FF;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Open PLUJ</a></p>'
      || '<p style="margin:18px 0 0;padding:12px 14px;background:#F4F7FF;border-radius:10px;color:#3F4560;font-size:12px;line-height:1.6">'
      || 'Sign in with your admin account, then open Admin → Planner to mark it contacted, keep notes and message the host.</p>'
      || '<p style="margin:22px 0 0;color:#5A6080;font-size:12px">Sent by PLUJ · pluj.us</p>'
      || '</div>';
end $$;
revoke all on function public.planner_request_email_html(public.planner_requests, text, text) from public, anon, authenticated;

create or replace function public.planner_host_email_html(p public.planner_requests, p_name text)
returns text language plpgsql stable set search_path = public, pg_temp as $$
declare
  es boolean := p.lang = 'es';
  how text;
begin
  how := case p.contact
           when 'call' then case when es then 'te llamará' else 'will call you' end
           when 'text' then case when es then 'te enviará un mensaje de texto' else 'will text you' end
           else case when es then 'te escribirá por correo' else 'will email you' end end;
  return '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
      || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#EEF2FF;color:#1E40FF">'
      || case when es then 'Solicitud recibida' else 'Request received' end || '</div>'
      || '<h2 style="margin:12px 0 6px;font-size:20px;color:#0B0C17">'
      || case when es then 'Hola' else 'Hi' end
      || coalesce(' ' || public.email_html_escape(nullif(split_part(btrim(p_name), ' ', 1), '')), case when es then '' else ' there' end)
      || case when es then ', tu organizador de PLUJ ya está en eso' else ', your PLUJ planner is on it' end || '</h2>'
      || '<p style="margin:0 0 18px;color:#3F4560;font-size:14px;line-height:1.6">'
      || case when es
           then 'Recibimos tu solicitud. Un organizador de PLUJ ' || how || ' dentro de 1 día hábil para hablar de tu evento. Nada se reserva ni se cobra sin tu aprobación.'
           else 'We got your request. A PLUJ planner ' || how || ' within 1 business day to talk through your event. Nothing is booked or charged without your OK.' end
      || '</p>'
      || '<table style="width:100%;border-collapse:collapse;font-size:14px">'
      || '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7">' || case when es then 'Evento' else 'Event' end
      || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7">' || public.email_html_escape(p.event_type) || '</td></tr>'
      || '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7">' || case when es then 'Cuándo' else 'When' end
      || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7">' || public.email_html_escape(public.planner_when_text(p)) || '</td></tr>'
      || '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7">' || case when es then 'Dónde' else 'Where' end
      || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7">' || public.email_html_escape(p.city) || '</td></tr>'
      || '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7">' || case when es then 'Invitados' else 'Guests' end
      || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7">' || p.guests || '</td></tr>'
      || '<tr><td style="padding:8px 16px 8px 0;color:#5A6080;border-top:1px solid #E3E8F7">' || case when es then 'Presupuesto' else 'Budget' end
      || '</td><td style="padding:8px 0;text-align:right;font-weight:600;border-top:1px solid #E3E8F7">$' || to_char(p.budget, 'FM999,999,999') || '</td></tr>'
      || '</table>'
      || '<p style="margin:18px 0 0;color:#3F4560;font-size:13px;line-height:1.6">'
      || case when es then 'Puedes seguirla en PLUJ, en Mis solicitudes.' else 'You can follow it on PLUJ under My Requests.' end || '</p>'
      || '<p style="margin:22px 0 0;color:#5A6080;font-size:12px">PLUJ · pluj.us</p>'
      || '</div>';
end $$;
revoke all on function public.planner_host_email_html(public.planner_requests, text) from public, anon, authenticated;

create or replace function public.request_event_planner(
  p_event_type text, p_city text, p_event_date date, p_end_date date,
  p_start_time text, p_end_time text, p_guests integer, p_budget integer,
  p_details text, p_contact text, p_phone text, p_lang text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid      uuid := auth.uid();
  today    date := (now() at time zone 'America/Chicago')::date;
  v_type   text := nullif(btrim(coalesce(p_event_type, '')), '');
  v_city   text := nullif(btrim(coalesce(p_city, '')), '');
  v_det    text := btrim(coalesce(p_details, ''));
  v_con    text := coalesce(nullif(btrim(p_contact), ''), 'email');
  v_phone  text := nullif(btrim(coalesce(p_phone, '')), '');
  v_lang   text := case when p_lang = 'es' then 'es' else 'en' end;
  v_name   text;
  v_email  text;
  r        public.planner_requests%rowtype;
  a        record;
  n        integer;
begin
  if uid is null then raise exception 'Log in to send this request.' using errcode = '42501'; end if;
  if not public.is_active() then raise exception 'This account is not active.' using errcode = '42501'; end if;

  if v_type is null or char_length(v_type) > 60 then raise exception 'Choose the kind of event.'; end if;
  if v_city is null or char_length(v_city) > 80 then raise exception 'Choose where the event is.'; end if;
  if p_event_date is null or p_event_date < today then raise exception 'Choose a date from today on.'; end if;
  if p_event_date > today + 1095 then raise exception 'Choose a date within the next 3 years.'; end if;
  if p_end_date is not null and (p_end_date < p_event_date or p_end_date > p_event_date + 14) then
    raise exception 'The end date must be on or up to 14 days after the start date.';
  end if;
  if (p_start_time is not null and p_start_time !~ '^\d{2}:\d{2}$')
     or (p_end_time is not null and p_end_time !~ '^\d{2}:\d{2}$') then
    raise exception 'Choose the start and end times again.';
  end if;
  if p_guests is null or p_guests < 1 or p_guests > 100000 then raise exception 'Enter how many guests.'; end if;
  if p_budget is null or p_budget < 100 then raise exception 'Enter a budget of at least $100.'; end if;
  if p_budget > 10000000 then raise exception 'Enter a budget under $10,000,000.'; end if;
  if char_length(v_det) < 20 then raise exception 'Tell us a little more about the event (at least 20 characters).'; end if;
  if char_length(v_det) > 4000 then raise exception 'Keep the description under 4,000 characters.'; end if;
  if v_con not in ('call', 'text', 'email') then raise exception 'Choose how the planner should reach you.'; end if;
  if v_phone is not null and (char_length(v_phone) > 30 or v_phone !~ '^[0-9 ()+.\-]+$') then
    raise exception 'Enter a phone number using digits only.';
  end if;
  if v_con in ('call', 'text') and (v_phone is null or char_length(regexp_replace(v_phone, '\D', '', 'g')) < 10) then
    raise exception 'Enter a phone number with area code so the planner can reach you.';
  end if;

  select count(*) into n from public.planner_requests
   where user_id = uid and status in ('new', 'contacted', 'planning');
  if n >= 3 then
    raise exception 'You already have 3 open planner requests. Cancel one in My Requests, or message PLUJ.';
  end if;
  select count(*) into n from public.planner_requests
   where user_id = uid and created_at > now() - interval '24 hours';
  if n >= 5 then raise exception 'Too many requests today. Please try again tomorrow.'; end if;

  insert into public.planner_requests
    (user_id, event_type, city, event_date, end_date, start_time, end_time,
     guests, budget, details, contact, phone, lang)
  values
    (uid, v_type, v_city, p_event_date, nullif(p_end_date, p_event_date), p_start_time, p_end_time,
     p_guests, p_budget, v_det, v_con, v_phone, v_lang)
  returning * into r;

  select coalesce(nullif(btrim(p.full_name), ''), nullif(btrim(p.display_name), '')),
         coalesce(nullif(btrim(p.email), ''), u.email)
    into v_name, v_email
    from public.profiles p left join auth.users u on u.id = p.id
   where p.id = uid;

  /* Tell the team. A failure to notify must not lose the request. */
  begin
    for a in
      select au.user_id, coalesce(nullif(btrim(p.email), ''), u.email) as email
        from public.admin_users au
        left join public.profiles p on p.id = au.user_id
        left join auth.users   u on u.id = au.user_id
    loop
      insert into public.notifications (user_id, type, title, body)
      values (a.user_id, 'planner_request', 'New planner request',
              coalesce(v_name, 'A host') || ': ' || r.event_type || ' for ' || r.guests || ' guests on '
                || to_char(r.event_date, 'Mon FMDD') || ' in ' || r.city
                || ', budget $' || to_char(r.budget, 'FM999,999,999') || '.');
      if a.email like '%@%' then
        perform public.queue_email(a.email,
          'Planner request: ' || r.event_type || ', ' || to_char(r.event_date, 'Mon FMDD') || ', ' || r.city,
          public.planner_request_email_html(r, v_name, v_email), 'planner_request', r.id::text);
      end if;
    end loop;
    if v_email like '%@%' then
      perform public.queue_email(v_email,
        case when v_lang = 'es' then 'Recibimos tu solicitud: tu organizador de PLUJ ya está en eso'
             else 'We got your request: your PLUJ planner is on it' end,
        public.planner_host_email_html(r, v_name), 'planner_confirmation', r.id::text);
    end if;
  exception when others then
    raise warning 'request_event_planner notify failed for %: %', r.id, sqlerrm;
  end;

  return jsonb_build_object('id', r.id, 'status', r.status);
end $$;
revoke all on function public.request_event_planner(text, text, date, date, text, text, integer, integer, text, text, text, text) from public, anon;
grant execute on function public.request_event_planner(text, text, date, date, text, text, integer, integer, text, text, text, text) to authenticated;

create or replace function public.my_planner_requests()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id, 'event_type', r.event_type, 'city', r.city,
           'event_date', r.event_date, 'end_date', r.end_date,
           'start_time', r.start_time, 'end_time', r.end_time,
           'guests', r.guests, 'budget', r.budget, 'details', r.details,
           'contact', r.contact, 'status', r.status,
           'created_at', r.created_at, 'updated_at', r.updated_at)
         order by r.created_at desc), '[]'::jsonb)
    from public.planner_requests r
   where auth.uid() is not null and r.user_id = auth.uid();
$$;
revoke all on function public.my_planner_requests() from public, anon;
grant execute on function public.my_planner_requests() to authenticated;

create or replace function public.cancel_planner_request(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.planner_requests%rowtype; a record;
begin
  if auth.uid() is null then raise exception 'Log in first.' using errcode = '42501'; end if;
  select * into r from public.planner_requests where id = p_id and user_id = auth.uid() for update;
  if not found then raise exception 'Request not found.'; end if;
  if r.status not in ('new', 'contacted', 'planning') then
    raise exception 'This request is already %.', r.status;
  end if;
  update public.planner_requests set status = 'cancelled', updated_at = now() where id = r.id;
  for a in select user_id from public.admin_users loop
    insert into public.notifications (user_id, type, title, body)
    values (a.user_id, 'planner_request', 'Planner request cancelled',
            'The host cancelled their ' || lower(r.event_type) || ' on ' || to_char(r.event_date, 'Mon FMDD') || '.');
  end loop;
  return jsonb_build_object('id', r.id, 'status', 'cancelled');
end $$;
revoke all on function public.cancel_planner_request(uuid) from public, anon;
grant execute on function public.cancel_planner_request(uuid) to authenticated;

create or replace function public.admin_planner_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', r.id, 'user_id', r.user_id, 'event_type', r.event_type, 'city', r.city,
             'event_date', r.event_date, 'end_date', r.end_date,
             'start_time', r.start_time, 'end_time', r.end_time,
             'when_text', public.planner_when_text(r),
             'guests', r.guests, 'budget', r.budget, 'details', r.details,
             'contact', r.contact, 'phone', r.phone, 'lang', r.lang,
             'status', r.status, 'admin_note', r.admin_note,
             'assigned_to', r.assigned_to,
             'assigned_name', coalesce(nullif(btrim(ap.display_name), ''), nullif(btrim(ap.full_name), '')),
             'host_name', coalesce(nullif(btrim(hp.full_name), ''), nullif(btrim(hp.display_name), '')),
             'host_email', coalesce(nullif(btrim(hp.email), ''), hu.email),
             'host_phone', hp.phone,
             'created_at', r.created_at, 'updated_at', r.updated_at)
           order by (r.status = 'new') desc, r.event_date, r.created_at desc), '[]'::jsonb)
      from public.planner_requests r
      left join public.profiles hp on hp.id = r.user_id
      left join auth.users      hu on hu.id = r.user_id
      left join public.profiles ap on ap.id = r.assigned_to);
end $$;
revoke all on function public.admin_planner_requests() from public, anon;
grant execute on function public.admin_planner_requests() to authenticated;

create or replace function public.admin_update_planner_request(p_id uuid, p_status text, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare r public.planner_requests%rowtype; v_status text := coalesce(nullif(btrim(p_status), ''), null); msg text;
begin
  if not public.is_admin() then raise exception 'Admins only.' using errcode = '42501'; end if;
  select * into r from public.planner_requests where id = p_id for update;
  if not found then raise exception 'Request not found.'; end if;
  if v_status is not null and v_status not in ('new','contacted','planning','booked','closed','cancelled') then
    raise exception 'Unknown status.';
  end if;
  if p_note is not null and char_length(p_note) > 4000 then raise exception 'Keep the note under 4,000 characters.'; end if;

  update public.planner_requests
     set status      = coalesce(v_status, status),
         admin_note  = case when p_note is null then admin_note else nullif(btrim(p_note), '') end,
         assigned_to = coalesce(assigned_to, auth.uid()),
         updated_at  = now()
   where id = r.id;

  /* Let the host know when their request moves on. */
  if v_status is not null and v_status <> r.status then
    msg := case v_status
      when 'contacted' then 'A PLUJ planner has your ' || lower(r.event_type) || ' request and is reaching out.'
      when 'planning'  then 'Your PLUJ planner is putting together your ' || lower(r.event_type) || '.'
      when 'booked'    then 'Your ' || lower(r.event_type) || ' is planned and booked.'
      when 'closed'    then 'Your planner request for your ' || lower(r.event_type) || ' is closed.'
      else null end;
    if msg is not null then
      insert into public.notifications (user_id, type, title, body)
      values (r.user_id, 'planner_update', 'Your PLUJ planner request', msg);
    end if;
  end if;
  return jsonb_build_object('id', r.id, 'status', coalesce(v_status, r.status));
end $$;
revoke all on function public.admin_update_planner_request(uuid, text, text) from public, anon;
grant execute on function public.admin_update_planner_request(uuid, text, text) to authenticated;
