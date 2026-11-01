/* ============================================================================
   PLUJ — database self-test.  Checklist item 30.
   Repo location: sql/tests/selftest.sql  (applied as migration "selftest_suite")

   WHAT IT IS
   The security invariants from TESTS-security-invariants.sql (14 Aug), brought
   across to the new repository and rewritten for October's database: the
   legal-information gate, the badge checks, the public views, the payment
   tables. Every property here was verified by hand at some point; hand checks
   do not survive the next change, so the database now re-checks them itself.

   HOW IT RUNS
   * Every night at 10:41 UTC (05:41 Houston) from pg_cron: selftest_record()
     runs the suite, stores the result in selftest_runs, and if anything failed
     it emails the alert address (platform_settings.alert_email, else
     info@pluj.us) and logs an error the admin panel shows.
   * By hand, after any database change:
         select * from public.selftest_run() where not pass;   -- empty = good
         select * from public.selftest_run();                  -- everything

   WHY IT CANNOT CHANGE ANYTHING
   Every check runs inside one block that ends by raising an exception, which
   rolls back the test booking, the hidden-vendor edit and the test error row.
   Only the list of results (a plpgsql variable, not a table) survives.

   WHY IT IS NOT CALLABLE FROM THE WEBSITE
   It impersonates the anon and authenticated roles with set_config('role'),
   which only works for a caller who is allowed to become those roles. EXECUTE
   is revoked from anon and authenticated, so /rest/v1/rpc/selftest_run is a
   permission error for everyone except the database owner and pg_cron.

   A NOTE ON FIXTURES (kept from 14 Aug, still true)
   A test that picks the wrong "stranger" reports a leak that does not exist,
   and a test that cries wolf gets ignored. Every fixture below is chosen by an
   explicit rule, and a missing fixture is reported as a harness failure rather
   than silently skipped.
   ========================================================================= */

create table if not exists public.selftest_runs (
  id        bigserial primary key,
  ran_at    timestamptz not null default now(),
  total     integer not null,
  failed    integer not null,
  failures  jsonb not null default '[]'::jsonb
);
alter table public.selftest_runs enable row level security;
revoke all on public.selftest_runs from anon, authenticated;

create or replace function public.selftest_run()
returns table (n integer, area text, invariant text, got text, want text, pass boolean)
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  acc        jsonb := '[]'::jsonb;
  me         text  := session_user;
  v_pub      uuid;  v_admin uuid;  v_stranger uuid;
  c          bigint; c2 bigint; t text; g text; bid text;
  before_ts  timestamptz; after_ts timestamptz;
begin
  begin  /* everything in here is rolled back by the raise at the end */

    /* ── Fixtures, chosen as the database owner ─────────────────────────── */
    select v.id into v_pub from public.vendor_profiles v
     where public.vendor_is_public(v.id) order by v.created_at limit 1;
    select a.user_id into v_admin from public.admin_users a limit 1;
    /* A plain customer with no booking, conversation or inquiry with v_pub:
       someone who has every reason NOT to see that vendor's private details. */
    select p.id into v_stranger from public.profiles p
     where not exists (select 1 from public.vendor_profiles v where v.id = p.id)
       and not exists (select 1 from public.admin_users a where a.user_id = p.id)
       and coalesce(p.status,'active') not in ('blocked','deactivated')
       and not exists (select 1 from public.booking_requests b where b.user_id = p.id and b.vendor_id = v_pub)
       and not exists (select 1 from public.conversations k where (k.a_id = p.id and k.b_id = v_pub) or (k.b_id = p.id and k.a_id = v_pub))
       and not exists (select 1 from public.inquiries i where i.user_id = p.id and i.vendor_id = v_pub)
     order by p.created_at limit 1;

    if v_pub is null or v_admin is null or v_stranger is null then
      raise exception 'fixtures missing: public vendor %, admin %, stranger %', v_pub, v_admin, v_stranger;
    end if;

    /* ══ 1. A signed-out visitor: anyone with the anon key from the bundle ══ */
    perform set_config('role', 'anon', true);
    perform set_config('request.jwt.claims', '', true);

    /* The half that was missing on 15 Aug: the marketplace must still WORK.
       A table that errors instead of returning rows means a policy is reaching
       for something the caller cannot read. */
    foreach t in array array['vendor_public','vendor_services','vendor_photos','vendor_availability',
                             'reviews','review_ratings','vendor_booked_dates','platform_settings','event_recaps']
    loop
      begin execute format('select count(*) from public.%I', t) into c; g := 'readable';
      exception when others then g := 'error: ' || sqlerrm; end;
      acc := acc || jsonb_build_array(jsonb_build_array('visitor can browse', t, g, 'readable'));
    end loop;

    select count(*) into c from public.vendor_public where id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('visitor can browse', 'a public vendor is listed',
      case when c = 1 then 'yes' else 'no' end, 'yes'));
    select count(*) into c from public.vendor_services where vendor_id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('visitor can browse', 'its listings are visible',
      case when c > 0 then 'yes' else 'none' end, 'yes'));
    begin perform public.site_status(); g := 'works'; exception when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('visitor can browse', 'site_status() answers', g, 'works'));

    /* And everything private stays private. 0 rows and "permission denied"
       both count as locked. */
    foreach t in array array['vendor_profiles','vendor_directory','profiles','booking_requests','conversations',
                             'messages','notifications','inquiries','favorites','waitlist','email_outbox',
                             'admin_users','rate_limits','error_events','booking_payments','booking_payment_plans',
                             'payment_release_requests','stripe_events','verify_codes','selftest_runs',
                             'app_events_daily','booking_funnel_7d']
    loop
      begin execute format('select count(*) from public.%I', t) into c;
            g := case when c = 0 then 'locked' else 'LEAK: ' || c || ' rows' end;
      exception when others then g := 'locked'; end;
      acc := acc || jsonb_build_array(jsonb_build_array('visitor is locked out', t, g, 'locked'));
    end loop;

    /* ══ 2. A signed-in customer who owns nothing. Sign-up is free, so this is
          the realistic attacker. ════════════════════════════════════════ */
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);

    select count(*) into c from public.vendor_profiles;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'vendor_profiles (EIN, licence, owners)',
      case when c = 0 then 'locked' else 'LEAK: ' || c || ' rows' end, 'locked'));
    /* People they are talking to or have booked are visible (that is how a
       host sees who they are messaging); everyone else is not. */
    select count(*) into c from public.profiles where id <> v_stranger and not public.is_counterparty(id);
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'profiles of people they have no dealings with',
      case when c = 0 then 'locked' else 'LEAK: ' || c || ' rows' end, 'locked'));
    select count(*) into c from public.booking_requests where user_id <> v_stranger and vendor_id <> v_stranger;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'other people''s bookings',
      case when c = 0 then 'locked' else 'LEAK: ' || c || ' rows' end, 'locked'));
    select count(*) into c from public.vendor_directory where id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'can still see a public vendor''s name',
      case when c = 1 then 'yes' else 'no' end, 'yes'));

    begin
      update public.vendor_profiles set description = 'selftest' where id = v_pub;
      get diagnostics c = row_count;
      g := case when c = 0 then 'blocked' else 'ALLOWED' end;
    exception when others then g := 'blocked'; end;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'editing someone else''s vendor profile', g, 'blocked'));

    begin
      update public.vendor_services set name = 'selftest' where vendor_id = v_pub;
      get diagnostics c = row_count;
      g := case when c = 0 then 'blocked' else 'ALLOWED' end;
    exception when others then g := 'blocked'; end;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'editing someone else''s listing', g, 'blocked'));

    /* Two locks stop this (the legal-information trigger fires first, then the
       ownership rule); either one refusing is a pass. */
    begin
      insert into public.vendor_services (vendor_id, category, name) values (v_pub, 'food', 'selftest');
      g := 'ALLOWED';
    exception when others then g := 'blocked'; end;
    acc := acc || jsonb_build_array(jsonb_build_array('signed-in stranger', 'adding a listing to someone else''s profile', g, 'blocked'));

    /* ══ 3. The vendor themselves ═════════════════════════════════════════ */
    perform set_config('request.jwt.claims', json_build_object('sub', v_pub, 'role', 'authenticated')::text, true);
    select count(*) into c from public.vendor_profiles;
    acc := acc || jsonb_build_array(jsonb_build_array('vendor', 'reads their own full row and nobody else''s',
      c::text, '1'));

    /* Badges: only PLUJ can stamp a check. The guard quietly puts the old
       value back, so read it again rather than waiting for an error. */
    select license_checked_at, coi_checked_at into before_ts, after_ts from public.vendor_profiles where id = v_pub;
    begin
      update public.vendor_profiles
         set license_checked_at = now() - interval '1 day', coi_checked_at = now() - interval '1 day'
       where id = v_pub;
    exception when others then null; end;
    select count(*) into c from public.vendor_profiles
     where id = v_pub
       and license_checked_at is not distinct from before_ts
       and coi_checked_at     is not distinct from after_ts;
    acc := acc || jsonb_build_array(jsonb_build_array('vendor', 'stamping their own licence/insurance badge',
      case when c = 1 then 'blocked' else 'ALLOWED' end, 'blocked'));

    /* ══ 4. The admin review queue sees everything ════════════════════════ */
    perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select count(*) into c from public.vendor_profiles;
    perform set_config('role', me, true);
    select count(*) into c2 from public.vendor_profiles;
    acc := acc || jsonb_build_array(jsonb_build_array('admin', 'reads every vendor',
      case when c = c2 then 'all' else c || ' of ' || c2 end, 'all'));

    /* ══ 5. A vendor whose legal information goes missing disappears ═══════ */
    perform set_config('request.jwt.claims', '', true);
    update public.vendor_profiles set biz_legal = null where id = v_pub;   -- rolled back at the end

    perform set_config('role', 'anon', true);
    select count(*) into c from public.vendor_public where id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('legal-information gate', 'visitor: incomplete vendor is not listed',
      case when c = 0 then 'hidden' else 'SHOWN' end, 'hidden'));
    select count(*) into c from public.vendor_services where vendor_id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('legal-information gate', 'visitor: its listings are not visible',
      case when c = 0 then 'hidden' else 'SHOWN: ' || c end, 'hidden'));

    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    select count(*) into c from public.vendor_directory where id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('legal-information gate', 'stranger: its legal name is not readable',
      case when c = 0 then 'hidden' else 'LEAK' end, 'hidden'));

    /* ══ 6. Bookings still work end to end (as the system) ═══════════════ */
    perform set_config('role', me, true);
    perform set_config('request.jwt.claims', '', true);
    bid := 'selftest-' || gen_random_uuid()::text;
    begin
      insert into public.booking_requests (id, user_id, vendor_id, event_date, status)
      values (bid, v_stranger, v_pub, current_date + 30, 'pending');
      g := 'works';
    exception when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('bookings', 'a booking request can be created', g, 'works'));
    begin update public.booking_requests set status = 'confirmed' where id = bid; g := 'works';
    exception when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('bookings', 'the vendor can confirm it', g, 'works'));

    /* Someone you booked keeps their name in your bookings and messages, even
       while their profile is hidden from the marketplace. */
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    select count(*) into c from public.vendor_directory where id = v_pub;
    acc := acc || jsonb_build_array(jsonb_build_array('bookings', 'a host still sees the name of a vendor they booked',
      case when c = 1 then 'yes' else 'no' end, 'yes'));
    select count(*) into c from public.booking_requests where id = bid;
    acc := acc || jsonb_build_array(jsonb_build_array('bookings', 'the host can read their own booking', c::text, '1'));
    perform set_config('role', me, true);
    perform set_config('request.jwt.claims', '', true);

    begin update public.booking_requests set status = 'cancelled', cancelled_by = 'user', cancelled_at = now() where id = bid; g := 'works';
    exception when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('bookings', 'the host can cancel it', g, 'works'));

    /* ══ 7. Nothing can record a charge while payments are switched off ═══ */
    begin update public.booking_requests set platform_fee = 12.50 where id = bid; g := 'ALLOWED';
    exception when others then g := 'blocked'; end;
    acc := acc || jsonb_build_array(jsonb_build_array('payments stay off', 'recording a platform fee', g, 'blocked'));
    begin update public.booking_requests set stripe_payment_intent_id = 'pi_selftest' where id = bid; g := 'ALLOWED';
    exception when others then g := 'blocked'; end;
    acc := acc || jsonb_build_array(jsonb_build_array('payments stay off', 'recording a Stripe payment', g, 'blocked'));
    acc := acc || jsonb_build_array(jsonb_build_array('payments stay off', 'payments_enabled setting',
      coalesce((select value from public.platform_settings where key = 'payments_enabled'), '(missing)'), 'false'));

    /* ══ 8. Error alerting fires once, then stays quiet ════════════════════ */
    acc := acc || jsonb_build_array(jsonb_build_array('alerting', 'a new error sends an alert',
      coalesce(public.record_error('selftest_fp_' || bid, 'Self test')->>'alert', 'null'), 'true'));
    acc := acc || jsonb_build_array(jsonb_build_array('alerting', 'the same error again stays silent',
      coalesce(public.record_error('selftest_fp_' || bid, 'Self test')->>'alert', 'null'), 'false'));

    /* ══ 8b. Real people only: an account cannot act faster than a person ═══
          (31 Oct). The limit is lowered to zero here, inside the rolled-back
          block, so the refusal can be seen without creating 25 requests. */
    update public.action_caps set short_max = 0 where tbl = 'booking_requests';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    begin
      insert into public.booking_requests (id, user_id, vendor_id, event_date, status)
      values ('selftest-cap-' || gen_random_uuid()::text, v_stranger, v_pub, current_date + 40, 'pending');
      g := 'ALLOWED';
    exception when sqlstate 'PT429' then g := 'refused (429)';
              when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('real people only', 'an account over its booking limit is refused', g, 'refused (429)'));
    perform set_config('role', me, true);
    perform set_config('request.jwt.claims', '', true);
    update public.action_caps set short_max = 25 where tbl = 'booking_requests';
    perform set_config('role', 'authenticated', true);
    perform set_config('request.jwt.claims', json_build_object('sub', v_stranger, 'role', 'authenticated')::text, true);
    begin
      insert into public.booking_requests (id, user_id, vendor_id, event_date, status)
      values ('selftest-cap-' || gen_random_uuid()::text, v_stranger, v_pub, current_date + 41, 'pending');
      g := 'works';
    exception when sqlstate 'PT429' then g := 'REFUSED';
              when others then g := 'error: ' || sqlerrm; end;
    acc := acc || jsonb_build_array(jsonb_build_array('real people only', 'a host under the limit can still book', g, 'works'));
    perform set_config('role', me, true);
    perform set_config('request.jwt.claims', '', true);
    acc := acc || jsonb_build_array(jsonb_build_array('real people only', 'tables with a per-account limit',
      (select coalesce(string_agg(c.relname::text, ',' order by c.relname::text), 'none')
         from pg_trigger t join pg_class c on c.oid = t.tgrelid
        where c.relnamespace = 'public'::regnamespace and t.tgname = 'trg_action_cap' and t.tgenabled <> 'D'),
      'booking_requests,conversations,event_recaps,favorites,inquiries,messages,reviews,vendor_photos,vendor_services'));
    acc := acc || jsonb_build_array(jsonb_build_array('real people only', 'repeated-message and analytics guards are on',
      (select count(*)::text from pg_trigger t
        where t.tgname in ('trg_message_repeat', 'trg_cap_app_events') and t.tgenabled <> 'D'), '2'));

    /* ══ 8c. Scheduled jobs: the most recent run of each one succeeded ═════
          (31 Oct: the nightly clean-up had failed for days unnoticed). */
    acc := acc || jsonb_build_array(jsonb_build_array('scheduled jobs', 'jobs whose last run failed',
      (select coalesce(string_agg(j.jobname, ',' order by j.jobname), 'none')
         from cron.job j
         join lateral (select d.status from cron.job_run_details d where d.jobid = j.jobid
                        order by d.start_time desc limit 1) last on true
        where j.active and last.status = 'failed'), 'none'));

    /* ══ 9. Structure: facts read straight from the catalogue ══════════════ */
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'vendor_public has no licence/EIN/owners/phone columns',
      (select coalesce(string_agg(column_name, ',' order by column_name), 'none') from information_schema.columns
        where table_schema = 'public' and table_name = 'vendor_public'
          and column_name in ('biz_license','ein','managing_members','biz_phone','rejection_reason','coi_insurer','dshs_permit','tabc_permit')),
      'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'vendor_directory is names only',
      (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
        where table_schema = 'public' and table_name = 'vendor_directory'),
      'id,business_name,biz_legal'));
    /* A venue's address is the event location. A caterer's is often a home. */
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'only venues show a street address',
      (select count(*)::text from public.vendor_public where category is distinct from 'places' and biz_address is not null), '0'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'tables without row-level security',
      (select coalesce(string_agg(c.relname::text, ',' order by c.relname::text), 'none') from pg_class c join pg_namespace s on s.oid = c.relnamespace
        where s.nspname = 'public' and c.relkind in ('r','p') and not c.relrowsecurity), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'public views anyone can write to',
      (select coalesce(string_agg(distinct c.relname::text, ',' order by c.relname::text), 'none') from pg_class c join pg_namespace s on s.oid = c.relnamespace
        cross join unnest(array['anon','authenticated']) r(role) cross join unnest(array['INSERT','UPDATE','DELETE']) p(priv)
        where s.nspname = 'public' and c.relkind = 'v' and has_table_privilege(r.role, c.oid, p.priv)), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'SECURITY DEFINER functions without a fixed search_path',
      (select coalesce(string_agg(p.proname::text, ',' order by p.proname::text), 'none') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'functions without a fixed search_path',
      (select coalesce(string_agg(p.proname::text, ',' order by p.proname::text), 'none') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.prokind = 'f'
          and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) x where x like 'search_path=%')), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'trigger functions the website can call directly',
      (select coalesce(string_agg(p.proname::text, ',' order by p.proname::text), 'none') from pg_proc p join pg_namespace s on s.oid = p.pronamespace
        where s.nspname = 'public' and p.prorettype = 'trigger'::regtype
          and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'test suite is not callable from the website',
      case when has_function_privilege('anon', 'public.selftest_run()', 'execute')
             or has_function_privilege('authenticated', 'public.selftest_run()', 'execute') then 'CALLABLE' else 'private' end, 'private'));
    /* Rules that call auth.uid() bare re-run it for every row; wrapped in a
       sub-select it runs once per query (Supabase lint 0003). */
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'security rules that re-check the user on every row',
      (select coalesce(string_agg(tablename || '.' || policyname, ',' order by tablename, policyname), 'none') from pg_policies
        where schemaname = 'public'
          and (coalesce(qual, '') ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)' or coalesce(with_check, '') ~ '(?<!SELECT )auth\.(uid|jwt|role)\(\)')), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'foreign keys without an index',
      (select coalesce(string_agg(cn.conrelid::regclass::text || '.' || cn.conname, ',' order by cn.conrelid::regclass::text || '.' || cn.conname), 'none')
         from pg_constraint cn join pg_namespace s on s.oid = cn.connamespace
        where cn.contype = 'f' and s.nspname = 'public'
          and not exists (select 1 from pg_index i where i.indrelid = cn.conrelid
                           and (i.indkey::int2[])[0:cardinality(cn.conkey)-1] @> cn.conkey
                           and (i.indkey::int2[])[0:cardinality(cn.conkey)-1] <@ cn.conkey)), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'indexes that exist twice',
      (select coalesce(string_agg(x, ',' order by x), 'none') from (
         select min(i.indexrelid::regclass::text) || '=' || max(i.indexrelid::regclass::text) x
           from pg_index i join pg_class c on c.oid = i.indrelid join pg_namespace s on s.oid = c.relnamespace
          where s.nspname = 'public'
          group by i.indrelid, i.indkey::text, i.indclass::text, coalesce(pg_get_expr(i.indexprs, i.indrelid), ''),
                   coalesce(pg_get_expr(i.indpred, i.indrelid), ''), i.indisunique
         having count(*) > 1) d), 'none'));
    acc := acc || jsonb_build_array(jsonb_build_array('structure', 'vendor documents bucket is private',
      coalesce((select case when public then 'PUBLIC' else 'private' end from storage.buckets where id = 'vendor-documents'), '(missing)'),
      'private'));

    raise exception 'selftest_rollback';
  exception when others then
    if sqlerrm <> 'selftest_rollback' then
      acc := acc || jsonb_build_array(jsonb_build_array('harness', 'the suite ran to the end', 'stopped: ' || sqlerrm, 'ran'));
    end if;
  end;

  return query
    select (e.ord)::integer, e.v->>0, e.v->>1, e.v->>2, e.v->>3, (e.v->>2) = (e.v->>3)
      from jsonb_array_elements(acc) with ordinality as e(v, ord)
     order by e.ord;
end
$fn$;

revoke all on function public.selftest_run() from public, anon, authenticated;

/* Nightly wrapper: keep a record, shout only when something broke. */
create or replace function public.selftest_record()
returns jsonb
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  v_total int; v_failed int; v_fail jsonb; v_to text; v_body text; v_res jsonb;
begin
  select count(*), count(*) filter (where not r.pass),
         coalesce(jsonb_agg(jsonb_build_object('area', r.area, 'invariant', r.invariant, 'got', r.got, 'want', r.want))
                    filter (where not r.pass), '[]'::jsonb)
    into v_total, v_failed, v_fail
    from public.selftest_run() r;

  insert into public.selftest_runs (total, failed, failures) values (v_total, v_failed, v_fail);
  delete from public.selftest_runs where ran_at < now() - interval '90 days';

  if v_failed > 0 then
    v_res := public.record_error('selftest_failed',
               'Database self-test: ' || v_failed || ' of ' || v_total || ' checks failed', v_fail::text, null, null, 'server');
    if (v_res->>'alert') = 'true' then
      select value into v_to from public.platform_settings where key = 'alert_email';
      v_to := coalesce(nullif(v_to, ''), 'info@pluj.us');
      v_body := '<p><b>' || v_failed || ' of ' || v_total || ' database checks failed tonight.</b></p><ul>'
             || (select string_agg('<li>' || public.email_html_escape(f->>'area') || ': '
                    || public.email_html_escape(f->>'invariant') || ' &mdash; got <code>'
                    || public.email_html_escape(f->>'got') || '</code>, expected <code>'
                    || public.email_html_escape(f->>'want') || '</code></li>', '')
                   from jsonb_array_elements(v_fail) f)
             || '</ul><p>To see them: <code>select * from public.selftest_run() where not pass;</code></p>';
      perform public.queue_email(v_to, 'PLUJ: ' || v_failed || ' database check(s) failed', v_body, 'alert', 'selftest');
    end if;
  end if;

  return jsonb_build_object('total', v_total, 'failed', v_failed);
end
$fn$;

revoke all on function public.selftest_record() from public, anon, authenticated;

select cron.unschedule(jobid) from cron.job where jobname = 'nightly-selftest';
select cron.schedule('nightly-selftest', '41 10 * * *', 'select public.selftest_record();');
