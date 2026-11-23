-- PLUJ — rate-limit keys nobody outside can aim at someone else (16 Nov 2026)
-- Applied as migration rate_limit_keys_2026_11_16.
--
-- Found in the 16 Nov deep study, attacking as an outsider:
--   check_rate_limit has to be callable with the public key (the /api routes
--   call it that way), so anyone can bump any counter they can name.
--   * The waitlist counter was 'waitlist:' || md5(ip). md5 has no secret, so
--     someone who knew a visitor's address could use up that visitor's 11
--     sign-ups an hour.
--   * Anyone could also invent millions of keys and fill the table.
-- Fixes:
--   1. A random salt kept in Vault, readable only inside the database.
--   2. rl_hash(): HMAC of a value with that salt. No grants to anon or
--      authenticated, so only database functions can use it.
--   3. join_waitlist keys its counter with rl_hash(ip).
--   4. check_rate_limit stops adding new rows once the table holds 20,000
--      (it lets the request through instead: failing open, like the API
--      limiter). Known keys are still counted and limited. The nightly
--      retention job keeps clearing old rows.
-- The /api routes do the same in api/_rate-limit.js with a server-only secret.

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'),
                           'RATE_LIMIT_SALT',
                           'Salt for rate-limit keys, 16 Nov 2026')
 where not exists (select 1 from vault.secrets where name = 'RATE_LIMIT_SALT');

create or replace function public.rl_hash(p_value text)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select encode(extensions.hmac(coalesce(p_value, ''),
                                (select decrypted_secret from vault.decrypted_secrets
                                  where name = 'RATE_LIMIT_SALT' limit 1),
                                'sha256'), 'hex');
$$;
revoke all on function public.rl_hash(text) from public, anon, authenticated;

create or replace function public.join_waitlist(p_email text, p_lang text DEFAULT 'en'::text, p_source text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    /* Keyed with a secret (16 Nov 2026): md5(ip) could be worked out by
       anyone, who could then use up another visitor's tries. */
    rl := public.check_rate_limit('waitlist:' || left(public.rl_hash(ip), 32), 11, 3600);
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

CREATE OR REPLACE FUNCTION public.check_rate_limit(p_key text, p_max integer DEFAULT 5, p_window_seconds integer DEFAULT 900)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  r       public.rate_limits%rowtype;
  now_ts  timestamptz := now();
  win     interval;
  cap     integer := greatest(coalesce(p_max, 5), 5);
  rows_n  integer;
begin
  if p_key is null or btrim(p_key) = '' or char_length(p_key) > 200 then
    return jsonb_build_object('allowed', false, 'reason', 'missing key');
  end if;

  /* Anyone can call this, so it must not be a way to lock someone else out:
     a window is at most an hour and a limit is at least 5 tries. Callers key
     their counters with a secret (rl_hash, api/_rate-limit.js), so nobody can
     name someone else's counter. */
  win := make_interval(secs => least(greatest(coalesce(p_window_seconds, 900), 10), 3600));

  select * into r from public.rate_limits where identifier = p_key for update;

  if not found then
    /* Nor a way to fill the database: past 20,000 counters, new ones are not
       stored and the request is let through (16 Nov 2026). */
    select count(*) into rows_n from (select 1 from public.rate_limits limit 20000) s;
    if rows_n >= 20000 then
      return jsonb_build_object('allowed', true, 'attempts', 0, 'remaining', cap, 'note', 'full');
    end if;

    insert into public.rate_limits (identifier, attempts, last_attempt_at)
    values (p_key, 1, now_ts)
    on conflict (identifier) do update
       set attempts = public.rate_limits.attempts + 1,
           last_attempt_at = now_ts
    returning * into r;
    return jsonb_build_object('allowed', true, 'attempts', r.attempts,
                              'remaining', greatest(cap - r.attempts, 0));
  end if;

  if r.locked_until is not null and r.locked_until > now_ts then
    return jsonb_build_object(
      'allowed', false, 'attempts', r.attempts, 'remaining', 0,
      'retry_after_seconds', ceil(extract(epoch from (r.locked_until - now_ts)))::int);
  end if;

  if r.last_attempt_at < now_ts - win then
    update public.rate_limits
       set attempts = 1, last_attempt_at = now_ts, locked_until = null
     where identifier = p_key
    returning * into r;
    return jsonb_build_object('allowed', true, 'attempts', 1, 'remaining', cap - 1);
  end if;

  update public.rate_limits
     set attempts        = public.rate_limits.attempts + 1,
         last_attempt_at = now_ts,
         locked_until    = case when public.rate_limits.attempts + 1 >= cap
                                then now_ts + win else null end
   where identifier = p_key
  returning * into r;

  if r.locked_until is not null and r.locked_until > now_ts then
    return jsonb_build_object(
      'allowed', false, 'attempts', r.attempts, 'remaining', 0,
      'retry_after_seconds', ceil(extract(epoch from (r.locked_until - now_ts)))::int);
  end if;

  return jsonb_build_object('allowed', true, 'attempts', r.attempts,
                            'remaining', greatest(cap - r.attempts, 0));
end
$function$;
