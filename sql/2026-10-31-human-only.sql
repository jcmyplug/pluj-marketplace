/* ════════════════════════════════════════════════════════════════════════════
   PLUJ — real people only (31 Oct 2026)

   Turnstile already stops bots at sign-up, log-in and password reset. This is
   the layer behind it: whatever gets a signed-in session, a person or a script,
   cannot act faster than a person does. Every limit is in the database, so it
   holds for someone calling the API directly with the public key.

   1. The nightly clean-up had failed every night since at least 29 Oct (it
      looked for rate_limits.created_at, which does not exist), and because it
      runs as one transaction nothing else it was meant to clear was cleared.
   2. action_caps: how many of each thing one account can create in a short
      window and in a day. Generous for a person, low for a script.
   3. The same long message sent to many people in an hour is refused.
   4. Anonymous analytics rows are capped per browser session and overall, so
      nobody can fill the database from outside.
   5. Every 10 minutes, accounts that reached a limit are recorded in the error
      log and the alert address gets one email per account per hour.
   ════════════════════════════════════════════════════════════════════════════ */

/* ── 1. Nightly clean-up ──────────────────────────────────────────────────── */
create or replace function public.run_retention_cleanup()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare n_notif int; n_err int; n_rate int; n_codes int; n_outbox int; n_events int;
begin
  delete from public.notifications where created_at < now() - interval '90 days';
  get diagnostics n_notif = row_count;

  delete from public.error_events where last_seen < now() - interval '90 days';
  get diagnostics n_err = row_count;

  /* rate_limits has last_attempt_at, not created_at. A row still inside its
     lock is kept, so clearing old rows never lifts a lock early. */
  delete from public.rate_limits
   where coalesce(last_attempt_at, '-infinity') < now() - interval '24 hours'
     and (locked_until is null or locked_until < now());
  get diagnostics n_rate = row_count;

  delete from public.verify_codes where created_at < now() - interval '1 hour';
  get diagnostics n_codes = row_count;

  delete from public.email_outbox
   where status = 'sent' and sent_at < now() - interval '30 days';
  get diagnostics n_outbox = row_count;

  delete from public.app_events where created_at < now() - interval '90 days';
  get diagnostics n_events = row_count;

  return jsonb_build_object(
    'ran_at', now(), 'notifications', n_notif, 'error_events', n_err,
    'rate_limits', n_rate, 'verify_codes', n_codes, 'email_outbox_sent', n_outbox,
    'app_events', n_events);
end $function$;
revoke all on function public.run_retention_cleanup() from public, anon, authenticated;

/* ── 2. Per-account limits ────────────────────────────────────────────────── */
create table if not exists public.action_caps (
  tbl          text primary key,
  actor_col    text not null,
  what         text not null,               -- plain words, for the alert email
  short_max    integer not null check (short_max >= 0),
  short_window interval not null check (short_window between interval '1 minute' and interval '1 day'),
  day_max      integer not null check (day_max >= 0)
);
alter table public.action_caps enable row level security;
revoke all on public.action_caps from anon, authenticated;

/* A busy person is well inside these; a script is not. An admin can raise any
   of them with one update, no code change. */
insert into public.action_caps (tbl, actor_col, what, short_max, short_window, day_max) values
  ('booking_requests', 'user_id',   'booking requests',  25, interval '1 hour',     60),
  ('conversations',    'a_id',      'new conversations', 20, interval '1 hour',     60),
  ('messages',         'sender_id', 'messages',          40, interval '10 minutes', 500),
  ('inquiries',        'user_id',   'inquiries',         15, interval '1 hour',     40),
  ('reviews',          'author_id', 'reviews',           20, interval '1 hour',     40),
  ('vendor_services',  'vendor_id', 'listings',          20, interval '1 hour',     60),
  ('vendor_photos',    'vendor_id', 'photos',            60, interval '1 hour',     150),
  ('favorites',        'user_id',   'saved vendors',     60, interval '1 hour',     300),
  ('event_recaps',     'vendor_id', 'event recaps',      10, interval '1 hour',     20)
on conflict (tbl) do nothing;

create or replace function public.enforce_action_cap()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := (select auth.uid());
  cap     public.action_caps%rowtype;
  n       integer;
begin
  /* Database jobs and triggers run with no signed-in user, and admins are
     trusted: only a person's own actions are counted. */
  if v_actor is null or (select public.is_admin()) then return new; end if;
  select * into cap from public.action_caps where tbl = tg_table_name;
  if not found or (to_jsonb(new) ->> cap.actor_col) is distinct from v_actor::text then
    return new;
  end if;

  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - $2',
                 tg_table_name, cap.actor_col)
     into n using v_actor, cap.short_window;
  if n >= cap.short_max then
    /* PT429 makes the API answer 429 Too Many Requests. */
    raise exception using errcode = 'PT429',
      message = 'That''s a lot in a short time. To keep PLUJ free of automated accounts, please wait a few minutes and try again.',
      hint = 'action_cap:' || tg_table_name;
  end if;

  execute format('select count(*) from public.%I where %I = $1 and created_at > now() - interval ''24 hours''',
                 tg_table_name, cap.actor_col)
     into n using v_actor;
  if n >= cap.day_max then
    raise exception using errcode = 'PT429',
      message = 'You''ve reached today''s limit for this. To keep PLUJ free of automated accounts, please try again tomorrow, or write to info@pluj.us if you need more.',
      hint = 'action_cap_day:' || tg_table_name;
  end if;
  return new;
end
$fn$;
revoke all on function public.enforce_action_cap() from public, anon, authenticated;

do $do$
declare t text;
begin
  for t in select tbl from public.action_caps loop
    execute format('create or replace trigger trg_action_cap before insert on public.%I
                    for each row execute function public.enforce_action_cap()', t);
  end loop;
end
$do$;

/* ── 3. One long message copied to many people ────────────────────────────── */
create or replace function public.guard_message_repeat()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_actor uuid := (select auth.uid());
  n       integer;
begin
  /* Short replies ("Thank you!", "See you Saturday") are naturally repeated;
     only longer messages count. */
  if v_actor is null or new.sender_id is distinct from v_actor or (select public.is_admin())
     or char_length(btrim(coalesce(new.body, ''))) < 40 then
    return new;
  end if;
  select count(distinct m.conversation_id) into n
    from public.messages m
   where m.sender_id = v_actor
     and m.created_at > now() - interval '1 hour'
     and m.conversation_id is distinct from new.conversation_id
     and lower(btrim(m.body)) = lower(btrim(new.body));
  if n >= 5 then
    raise exception using errcode = 'PT429',
      message = 'This same message has already gone to several people in the last hour. To protect hosts and pros from spam, please write to each one personally.',
      hint = 'message_repeat';
  end if;
  return new;
end
$fn$;
revoke all on function public.guard_message_repeat() from public, anon, authenticated;
create or replace trigger trg_message_repeat before insert on public.messages
  for each row execute function public.guard_message_repeat();

/* ── 4. Anonymous analytics rows ──────────────────────────────────────────── */
create index if not exists app_events_created_idx on public.app_events (created_at);

create or replace function public.cap_app_events()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare n integer;
begin
  /* A real visit writes fewer than 10 rows an hour (31 Oct: the busiest of
     336 sessions wrote 9). Over the cap the row is dropped quietly; the page
     does not wait for, or show, these writes. */
  if new.session_id is not null then
    select count(*) into n from public.app_events
     where session_id = new.session_id and created_at > now() - interval '1 hour';
    if n >= 200 then return null; end if;
  end if;
  select count(*) into n from public.app_events where created_at > now() - interval '10 minutes';
  if n >= 3000 then return null; end if;
  return new;
end
$fn$;
revoke all on function public.cap_app_events() from public, anon, authenticated;
create or replace trigger trg_cap_app_events before insert on public.app_events
  for each row execute function public.cap_app_events();

/* ── 5. Tell PLUJ when an account reaches a limit ─────────────────────────── */
create or replace function public.scan_action_caps()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  cap     public.action_caps%rowtype;
  r       record;
  v_res   jsonb;
  v_to    text;
  v_mins  int;
  flagged int := 0;
begin
  for cap in select * from public.action_caps order by tbl loop
    v_mins := (extract(epoch from cap.short_window) / 60)::int;
    for r in execute format(
      'select %1$I as actor,
              count(*) filter (where created_at > now() - $1) as short_n,
              count(*) as day_n
         from public.%2$I
        where created_at > now() - interval ''24 hours'' and %1$I is not null
        group by 1
       having count(*) filter (where created_at > now() - $1) >= $2 or count(*) >= $3',
      cap.actor_col, cap.tbl) using cap.short_window, cap.short_max, cap.day_max
    loop
      continue when exists (select 1 from public.admin_users a where a.user_id = r.actor);
      flagged := flagged + 1;
      v_res := public.record_error(
        'action_cap:' || cap.tbl || ':' || r.actor,
        'An account reached the limit for ' || cap.what || ' (' || r.short_n || ' in ' || v_mins
          || ' minutes, ' || r.day_n || ' in 24 hours). It may be automated.',
        'Account id: ' || r.actor, null, null, 'security');
      if (v_res->>'alert') = 'true' then
        select value into v_to from public.platform_settings where key = 'alert_email';
        v_to := coalesce(nullif(v_to, ''), 'info@pluj.us');
        perform public.queue_email(v_to, 'PLUJ: an account may be automated',
          '<p>An account reached the PLUJ limit for <b>' || public.email_html_escape(cap.what) || '</b>: '
          || r.short_n || ' in ' || v_mins || ' minutes, ' || r.day_n || ' in the last 24 hours.</p>'
          || '<p>A person rarely does this. Look at the account in the admin panel (Users) and block it '
          || 'if it is not a real host or pro.</p><p>Account id: <code>' || r.actor || '</code></p>',
          'alert', 'action_cap');
      end if;
    end loop;
  end loop;
  return jsonb_build_object('flagged', flagged);
end
$fn$;
revoke all on function public.scan_action_caps() from public, anon, authenticated;

select cron.schedule('scan-action-caps', '*/10 * * * *', 'select public.scan_action_caps();');

/* ── 6. Analytics events the site sends but the check refused ─────────────
   Found in the API logs: language_changed, vendor_listing_switched and
   waitlist_joined came back 400 (app_events_known_event) and were lost.
   Applied as migration app_events_known_event_complete. */
alter table public.app_events drop constraint if exists app_events_known_event;
alter table public.app_events add constraint app_events_known_event check (event = any (array[
  'page_view','search_performed','search_empty','category_selected','listing_viewed','vendor_saved',
  'booking_started','booking_submitted','booking_abandoned','signup_started','signup_completed',
  'vendor_listing_saved','message_sent','language_changed','vendor_listing_switched','waitlist_joined']));
