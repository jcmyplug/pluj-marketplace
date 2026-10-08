/* 8 Oct 2026 — the waitlist (migration "waitlist")

   While the site is switched off, visitors see "Good parties are coming." and
   can leave their email. Every address is kept here so that on opening day an
   admin can send everyone a launch invite, and a reminder a few days later to
   the ones who have not made an account yet.

   Works while the site is off. Turning the site off revokes anonymous SELECT
   on every table and view; it does not touch functions, so the page talks to
   join_waitlist() and never to the table. Nobody but these functions can read
   or write the table at all (no grants, no policies).

   Sending is paced. The email plan (Resend free) allows 100 emails a day, and
   booking emails need some of those, so waitlist emails go out at most
   `waitlist_daily_cap` a day (default 80): the first 80 now, the next 80
   tomorrow, and so on. Raise the cap in the admin panel after upgrading the
   email plan.

   Marketing email rules (CAN-SPAM): every waitlist email says why it was
   sent, has a working unsubscribe link and shows a postal address. Sending is
   refused until the address is filled in. */

create table if not exists public.waitlist (
  id              bigint generated always as identity primary key,
  email           text not null check (char_length(email) between 6 and 254 and email = lower(btrim(email))),
  role            text not null default 'host' check (role in ('host', 'pro')),
  lang            text not null default 'en' check (lang in ('en', 'es')),
  source          text check (source is null or char_length(source) <= 60),
  token           uuid not null default gen_random_uuid() unique,
  ip_hash         text,
  created_at      timestamptz not null default now(),
  invited_at      timestamptz,
  reminded_at     timestamptz,
  unsubscribed_at timestamptz
);
create unique index if not exists waitlist_email_key on public.waitlist (email);
alter table public.waitlist enable row level security;   -- no policies: functions only
revoke all on public.waitlist from public, anon, authenticated;

insert into public.platform_settings (key, value, is_public) values
  ('waitlist_daily_cap', '80', false),
  ('mailing_address',    '',   false)
on conflict (key) do nothing;

/* ── Visitors ─────────────────────────────────────────────────────────────── */

/* Join. Returns {ok:true, token} for a new address, {ok:true} for one that is
   already on the list (same answer either way, so the form can't be used to
   find out who signed up), or {ok:false, error}. Ten tries an hour per
   connection. */
create or replace function public.join_waitlist(p_email text, p_lang text default 'en', p_source text default null)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  e   text := lower(btrim(coalesce(p_email, '')));
  hdr json;
  ip  text;
  rl  jsonb;
  tok uuid;
begin
  if char_length(e) > 254 or e !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then
    return jsonb_build_object('ok', false, 'error', 'invalid_email');
  end if;

  begin
    hdr := current_setting('request.headers', true)::json;
    ip  := nullif(btrim(split_part(coalesce(hdr->>'cf-connecting-ip', hdr->>'x-forwarded-for', ''), ',', 1)), '');
  exception when others then ip := null;
  end;
  if ip is not null then
    rl := public.check_rate_limit('waitlist:' || md5(ip), 11, 3600);
    if not coalesce((rl->>'allowed')::boolean, true) then
      return jsonb_build_object('ok', false, 'error', 'rate_limited', 'retry_after_seconds', rl->'retry_after_seconds');
    end if;
  end if;

  insert into public.waitlist (email, lang, source, ip_hash)
  values (e, case when p_lang = 'es' then 'es' else 'en' end,
          left(nullif(btrim(coalesce(p_source, '')), ''), 60),
          case when ip is null then null else md5('pluj-waitlist:' || ip) end)
  on conflict (email) do nothing
  returning token into tok;

  if tok is null then return jsonb_build_object('ok', true); end if;
  return jsonb_build_object('ok', true, 'token', tok);
end $function$;

/* "Help us get the invite right": host or event pro. Needs the token that
   join_waitlist() handed back to this browser (or the one in an email). */
create or replace function public.waitlist_set_role(p_token uuid, p_role text)
returns boolean language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  update public.waitlist set role = case when p_role = 'pro' then 'pro' else 'host' end
   where token = p_token and unsubscribed_at is null;
  return found;
end $function$;

/* The unsubscribe link in every waitlist email. Also drops anything still
   queued for them. Returns the address masked, for the confirmation page. */
create or replace function public.waitlist_unsubscribe(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare e text;
begin
  update public.waitlist set unsubscribed_at = coalesce(unsubscribed_at, now())
   where token = p_token returning email into e;
  if e is null then return jsonb_build_object('ok', false); end if;
  update public.email_outbox
     set status = 'failed', last_error = 'unsubscribed', alerted_at = now()
   where lower(to_email) = e and kind like 'waitlist_%' and status = 'pending';
  return jsonb_build_object('ok', true,
    'email', left(e, 1) || '•••@' || split_part(e, '@', 2));
end $function$;

/* ── The emails ───────────────────────────────────────────────────────────── */

/* Subject and HTML for one waitlist email: kind invite|reminder, role
   host|pro, lang en|es. Written in the reader's language here rather than
   translated by queue_email, so the Spanish reads as written. */
create or replace function public.waitlist_email(p_kind text, p_role text, p_lang text, p_token uuid, p_address text)
returns jsonb language plpgsql stable set search_path to 'public', 'pg_temp' as $function$
declare
  es   boolean := p_lang = 'es';
  pro  boolean := p_role = 'pro';
  inv  boolean := p_kind <> 'reminder';
  subj text; pre text; h1 text; body text; cta text; small text; foot text; unsub text;
  link text;
begin
  link := 'https://www.pluj.us/?signup=' || case when pro then 'pro' else 'host' end
       || '&utm_source=waitlist&utm_medium=email&utm_campaign=' || case when inv then 'launch' else 'launch-reminder' end;

  if inv and not pro then
    subj := case when es then 'PLUJ ya abrió. Planeemos tu fiesta.' else 'PLUJ is open. Let''s plan your party.' end;
    pre  := case when es then 'Te dijimos que serías de los primeros. Reserva toda la fiesta o solo una parte.'
                         else 'You asked to hear first. Book the whole party or just one piece.' end;
    h1   := case when es then '¡Ya abrimos!' else 'We''re open.' end;
    body := case when es then 'Te uniste a la lista de espera, así que eres de los primeros en saberlo: PLUJ ya está reservando en Houston. DJs, catering, food trucks, bartenders, lugares, iluminación y más, todo en un solo lugar, con un solo precio y nada extra al pagar.'
                         else 'You joined the waitlist, so you''re hearing it first: PLUJ is now booking in Houston. DJs, catering, food trucks, bartenders, venues, lighting and more, all in one place, at one price with nothing added at checkout.' end;
    cta  := case when es then 'Empezar a planear' else 'Start planning' end;
    small:= case when es then 'Reserva toda la fiesta o solo una cosa. Gracias por esperarnos.' else 'Book the whole party, or just one thing. Thank you for waiting for us.' end;
  elsif inv and pro then
    subj := case when es then 'PLUJ ya abrió. Tu perfil de pro te espera.' else 'PLUJ is open. Your pro profile is waiting.' end;
    pre  := case when es then 'Los anfitriones ya están buscando. Sin suscripciones y sin pagar por contactos.'
                         else 'Hosts are already looking. No subscriptions, no paying for leads.' end;
    h1   := case when es then 'Ya abrimos, y los anfitriones están buscando.' else 'We''re open, and hosts are looking.' end;
    body := case when es then 'Te uniste a la lista de espera como profesional de eventos, así que eres de los primeros en saberlo: PLUJ ya abrió en Houston. Crea tu perfil, agrega tus servicios y precios, y recibe reservas de anfitriones que ya tienen fecha, número de invitados y presupuesto.'
                         else 'You joined the waitlist as an event pro, so you''re hearing it first: PLUJ is now open in Houston. Create your profile, add your services and prices, and get booked by hosts who already have a date, a guest count and a budget.' end;
    cta  := case when es then 'Crear mi perfil de pro' else 'Create my pro profile' end;
    small:= case when es then 'Sin suscripciones y sin pagar por contactos. Solo pagas cuando te reservan.' else 'No subscriptions, no paying for leads. You pay only when you get booked.' end;
  elsif not pro then
    subj := case when es then 'Un recordatorio: PLUJ ya está abierto' else 'A quick reminder: PLUJ is open' end;
    pre  := case when es then 'Tu lugar está guardado. Crear tu cuenta toma como un minuto.'
                         else 'Your spot is saved. Making an account takes about a minute.' end;
    h1   := case when es then '¿Sigues planeando algo?' else 'Still planning something?' end;
    body := case when es then 'PLUJ abrió hace unos días y tu lugar está guardado. Crear tu cuenta toma como un minuto, y luego puedes reservar toda la fiesta o solo una parte.'
                         else 'PLUJ opened a few days ago and your spot is saved. Making an account takes about a minute, and then you can book the whole party or just one piece.' end;
    cta  := case when es then 'Crear mi cuenta' else 'Create my account' end;
    small:= case when es then 'Este es el último correo de la lista de espera.' else 'This is the last email from the waitlist.' end;
  else
    subj := case when es then 'Un recordatorio: los anfitriones ya reservan en PLUJ' else 'A quick reminder: hosts are booking on PLUJ' end;
    pre  := case when es then 'Crea tu perfil para que te encuentren.' else 'Create your profile so they can find you.' end;
    h1   := case when es then 'Tu perfil de pro está a un paso.' else 'Your pro profile is one step away.' end;
    body := case when es then 'PLUJ abrió hace unos días y los anfitriones ya están buscando. Crea tu perfil y agrega tus servicios para que te encuentren. Solo pagas cuando te reservan.'
                         else 'PLUJ opened a few days ago and hosts are already searching. Create your profile and add your services so they can find you. You pay only when you get booked.' end;
    cta  := case when es then 'Crear mi perfil de pro' else 'Create my pro profile' end;
    small:= case when es then 'Este es el último correo de la lista de espera.' else 'This is the last email from the waitlist.' end;
  end if;

  unsub := 'https://www.pluj.us/unsubscribe?t=' || p_token::text;
  foot  := case when es
    then 'Recibes este correo porque te uniste a la lista de espera de PLUJ en pluj.us. <a href="' || unsub || '" style="color:#3F4560">Cancelar suscripción</a>.'
    else 'You''re getting this because you joined the PLUJ waitlist at pluj.us. <a href="' || unsub || '" style="color:#3F4560">Unsubscribe</a>.' end
    || '<br/>PLUJ · ' || public.email_html_escape(coalesce(nullif(btrim(p_address), ''), 'Houston, TX'));

  return jsonb_build_object('subject', subj, 'html',
    '<!doctype html><html lang="' || case when es then 'es' else 'en' end || '"><body style="margin:0;padding:0;background:#EEF2FF">'
    || '<div style="display:none;max-height:0;overflow:hidden;opacity:0">' || public.email_html_escape(pre) || '</div>'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#EEF2FF"><tr><td align="center" style="padding:28px 14px">'
    || '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#FFFFFF;border-radius:24px;overflow:hidden">'
    || '<tr><td style="height:10px;background:#1E40FF;background-image:linear-gradient(90deg,#1E40FF,#6366F1,#8B7CF6,#C4B5FD)"></td></tr>'
    || '<tr><td style="padding:34px 34px 8px;font-family:''Plus Jakarta Sans'',system-ui,-apple-system,''Segoe UI'',sans-serif">'
    || '<img src="https://www.pluj.us/pluj-logo-512.png" width="52" height="52" alt="PLUJ" style="display:block;border:0;border-radius:14px"/>'
    || '<h1 style="margin:26px 0 12px;font-size:30px;line-height:1.1;letter-spacing:-0.03em;font-weight:800;color:#000000">' || public.email_html_escape(h1) || '</h1>'
    || '<p style="margin:0 0 26px;font-size:16px;line-height:1.6;color:#3F4560">' || public.email_html_escape(body) || '</p>'
    || '<a href="' || link || '" style="display:inline-block;background:#1E40FF;color:#FFFFFF;text-decoration:none;font-weight:800;font-size:16px;padding:15px 28px;border-radius:999px">' || public.email_html_escape(cta) || '</a>'
    || '<p style="margin:26px 0 0;font-size:14px;line-height:1.6;color:#3F4560">' || public.email_html_escape(small) || '</p>'
    || '<p style="margin:22px 0 30px;font-size:13px;letter-spacing:0.22em;color:#000000">we know a guy</p>'
    || '</td></tr></table>'
    || '<p style="max-width:540px;margin:18px auto 0;font-family:system-ui,-apple-system,''Segoe UI'',sans-serif;font-size:12px;line-height:1.6;color:#5A6080">' || foot || '</p>'
    || '</td></tr></table></body></html>');
end $function$;

/* ── Admins ───────────────────────────────────────────────────────────────── */

/* Everything the admin panel shows, in one call. */
create or replace function public.waitlist_admin()
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return jsonb_build_object(
    'summary', (select jsonb_build_object(
        'total',        count(*) filter (where unsubscribed_at is null),
        'hosts',        count(*) filter (where unsubscribed_at is null and role = 'host'),
        'pros',         count(*) filter (where unsubscribed_at is null and role = 'pro'),
        'spanish',      count(*) filter (where unsubscribed_at is null and lang = 'es'),
        'invited',      count(*) filter (where invited_at is not null),
        'reminded',     count(*) filter (where reminded_at is not null),
        'joined',       count(*) filter (where j.joined),
        'unsubscribed', count(*) filter (where unsubscribed_at is not null),
        'to_invite',    count(*) filter (where unsubscribed_at is null and invited_at is null),
        'to_remind',    count(*) filter (where unsubscribed_at is null and invited_at is not null and reminded_at is null
                                           and invited_at < now() - interval '2 days' and not j.joined))
      from public.waitlist w
      cross join lateral (select exists (select 1 from public.profiles p where lower(p.email) = w.email) as joined) j),
    'rows', (select coalesce(jsonb_agg(jsonb_build_object(
        'email', w.email, 'role', w.role, 'lang', w.lang, 'created_at', w.created_at,
        'invited_at', w.invited_at, 'reminded_at', w.reminded_at, 'unsubscribed_at', w.unsubscribed_at,
        'joined', exists (select 1 from public.profiles p where lower(p.email) = w.email))
        order by w.created_at desc), '[]'::jsonb) from public.waitlist w),
    'mailing_address', (select value from public.platform_settings where key = 'mailing_address'),
    'daily_cap', coalesce((select nullif(value, '')::int from public.platform_settings where key = 'waitlist_daily_cap'), 80),
    'site_private', coalesce((select is_private from public.private_mode_state where id = 1), false),
    'queued', (select count(*) from public.email_outbox where kind like 'waitlist_%' and status in ('pending', 'in_flight')),
    'sent',   (select count(*) from public.email_outbox where kind like 'waitlist_%' and status = 'sent'));
end $function$;

create or replace function public.waitlist_settings(p_address text, p_daily_cap int)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_daily_cap is null or p_daily_cap < 1 or p_daily_cap > 5000 then
    raise exception 'The daily limit has to be between 1 and 5000.';
  end if;
  insert into public.platform_settings (key, value, is_public) values
    ('mailing_address', left(btrim(coalesce(p_address, '')), 200), false),
    ('waitlist_daily_cap', p_daily_cap::text, false)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $function$;

/* A preview of one email, with a dummy unsubscribe link. */
create or replace function public.waitlist_email_preview(p_kind text, p_role text, p_lang text)
returns jsonb language plpgsql stable security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  return public.waitlist_email(p_kind, p_role, p_lang, '00000000-0000-0000-0000-000000000000'::uuid,
                               (select value from public.platform_settings where key = 'mailing_address'));
end $function$;

/* Queue the launch invite (to everyone not yet invited) or the reminder (to
   people invited 2+ days ago who still have no account), paced at the daily
   limit. Returns how many were queued and over how many days. */
create or replace function public.waitlist_send(p_kind text)
returns jsonb language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  addr text; cap int; n int := 0; r record; m jsonb; t0 timestamptz := now();
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  if p_kind not in ('invite', 'reminder') then raise exception 'Unknown email: %', p_kind; end if;
  if coalesce((select is_private from public.private_mode_state where id = 1), false) then
    raise exception 'Turn the site on first. These emails tell people PLUJ is open.';
  end if;
  select nullif(btrim(value), '') into addr from public.platform_settings where key = 'mailing_address';
  if addr is null then
    raise exception 'Add your mailing address first. US law requires one in marketing emails.';
  end if;
  if exists (select 1 from public.email_outbox where kind like 'waitlist_%' and status = 'pending') then
    raise exception 'The last batch is still going out. Send this once it has finished.';
  end if;
  cap := greatest(coalesce((select nullif(value, '')::int from public.platform_settings where key = 'waitlist_daily_cap'), 80), 1);

  for r in
    select w.* from public.waitlist w
     where w.unsubscribed_at is null
       and case when p_kind = 'invite' then w.invited_at is null
                else w.invited_at is not null and w.reminded_at is null and w.invited_at < now() - interval '2 days'
                     and not exists (select 1 from public.profiles p where lower(p.email) = w.email) end
     order by w.created_at
  loop
    m := public.waitlist_email(p_kind, r.role, r.lang, r.token, addr);
    insert into public.email_outbox (to_email, subject, html, kind, ref_id, next_attempt_at)
    values (r.email, m->>'subject', m->>'html', 'waitlist_' || p_kind, r.id::text,
            t0 + (n / cap) * interval '1 day');
    if p_kind = 'invite' then update public.waitlist set invited_at  = t0 where id = r.id;
    else                      update public.waitlist set reminded_at = t0 where id = r.id; end if;
    n := n + 1;
  end loop;

  return jsonb_build_object('queued', n, 'days', ceil(n::numeric / cap)::int, 'daily_cap', cap);
end $function$;

/* Who may call what. Supabase grants EXECUTE to everyone by default. */
revoke execute on function public.join_waitlist(text, text, text), public.waitlist_set_role(uuid, text),
  public.waitlist_unsubscribe(uuid), public.waitlist_email(text, text, text, uuid, text),
  public.waitlist_admin(), public.waitlist_settings(text, int), public.waitlist_email_preview(text, text, text),
  public.waitlist_send(text) from public, anon, authenticated;
grant execute on function public.join_waitlist(text, text, text), public.waitlist_set_role(uuid, text),
  public.waitlist_unsubscribe(uuid) to anon, authenticated;
grant execute on function public.waitlist_admin(), public.waitlist_settings(text, int),
  public.waitlist_email_preview(text, text, text), public.waitlist_send(text) to authenticated;
