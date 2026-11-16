-- Attack tests for the 15 Nov 2026 hardening (sql/2026-11-15-security-hardening.sql).
-- Paste into the Supabase SQL editor and run. Everything runs inside one DO
-- block that ends by raising, so the whole transaction rolls back and nothing
-- is kept: the "error" it shows IS the report. Every line should read "ok",
-- "kept", "refused" or "(expected)"; any line with FAIL is a hole.
-- The ids are PLUJ's own test accounts (a host and two vendors).
do $t$
declare
  H  uuid := 'c4b3d98c-0105-47e0-aeec-0af094155dfe';   -- host
  V  uuid := 'e7d74a14-0227-4a8e-9ed5-8cb9a7c0a69a';   -- vendor
  V2 uuid := 'cef46fe9-d024-45b6-bc76-f71d37e435c8';   -- other vendor
  o  text := '';
  t  text; n int; svc uuid; bfut text := 'TEST-SEC-FUT'; bpast text := 'TEST-SEC-PAST'; bnew text := 'TEST-SEC-NEW';
  rv uuid; j jsonb;
begin
  execute $f$create function pg_temp.as_user(u uuid) returns void language plpgsql as $b$
    begin
      reset role;
      perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub',u,'role','authenticated')::text end, true);
      perform set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
      if u is not null then set local role authenticated; end if;
    end $b$$f$;

  -- fixtures (as the system)
  perform pg_temp.as_user(null);
  select id into svc from public.vendor_services where vendor_id = V limit 1;
  insert into public.booking_requests (id, user_id, vendor_id, status, event_date, start_time, service_id, guests, created_at)
  values (bfut, H, V, 'confirmed', current_date + 30, '18:00', svc, '20', now() - interval '10 days'),
         (bpast, H, V, 'confirmed', current_date - 2, '18:00', svc, '20', now() - interval '20 days');

  -- C1: host makes himself an approved vendor
  perform pg_temp.as_user(H);
  begin
    insert into public.vendor_profiles (id, verification_status, business_name) values (H, 'approved', 'Fake');
    o := o || 'C1 FAIL host inserted a vendor profile' || E'\n';
  exception when others then o := o || 'C1 ok: ' || sqlerrm || E'\n'; end;

  -- C1b: vendor pre-sets prev_verification_status / created_at
  perform pg_temp.as_user(V);
  update public.vendor_profiles set prev_verification_status = 'approved', created_at = '2020-01-01' where id = V;
  select prev_verification_status || ' / ' || created_at::date into t from public.vendor_profiles where id = V;
  o := o || 'C1b prev/created after tamper: ' || coalesce(t,'null') || E'\n';

  -- H1: host opens a "PLUJ Support" thread
  perform pg_temp.as_user(H);
  begin
    perform public.start_conversation(V, 'admin');
    o := o || 'H1 FAIL rpc admin conversation' || E'\n';
  exception when others then o := o || 'H1 rpc ok: ' || sqlerrm || E'\n'; end;
  begin
    insert into public.conversations (kind, a_id, b_id) values ('admin', H, V);
    o := o || 'H1 FAIL direct admin conversation' || E'\n';
  exception when others then o := o || 'H1 direct ok: ' || sqlerrm || E'\n'; end;

  -- M4: closed conversation reopened by the other side
  perform pg_temp.as_user(H);
  rv := public.start_conversation(V2, 'user_vendor');
  update public.conversations set status = 'closed', closed_by = H, closed_at = now() where id = rv;
  perform pg_temp.as_user(V2);
  begin
    update public.conversations set status = 'open', closed_by = null where id = rv;
    get diagnostics n = row_count;
    o := o || 'M4 FAIL reopened rows=' || n || E'\n';
  exception when others then o := o || 'M4 ok: ' || sqlerrm || E'\n'; end;

  -- H3: booking inserted already confirmed with a tiny price
  perform pg_temp.as_user(H);
  begin
    insert into public.booking_requests (id, user_id, vendor_id, status, event_date, start_time, service_id, guests, total_price, payment_terms_accepted, created_at)
    values (bnew, H, V, 'confirmed', current_date + 40, '18:00', svc, '20', 1, true, '2020-01-01');
    select status || ' / price=' || coalesce(total_price::text,'null') || ' / terms=' || payment_terms_accepted || ' / created=' || created_at::date
      into t from public.booking_requests where id = bnew;
    o := o || 'H3 stored: ' || t || E'\n';
  exception when others then o := o || 'H3 insert refused: ' || sqlerrm || E'\n'; end;

  -- M1a: cancel while moving the date (to dodge the 48-hour rule)
  perform pg_temp.as_user(H);
  update public.booking_requests set status = 'cancelled', event_date = current_date + 300 where id = bfut;
  select status || ' / date kept=' || (event_date = current_date + 30) || ' / created kept=' || (created_at::date = (now() - interval '10 days')::date)
    into t from public.booking_requests where id = bfut;
  o := o || 'M1a: ' || t || E'\n';
  -- M1b: revive the cancelled booking
  begin
    update public.booking_requests set status = 'pending' where id = bfut;
    o := o || 'M1b FAIL revived' || E'\n';
  exception when others then o := o || 'M1b ok: ' || sqlerrm || E'\n'; end;
  -- M1c: vendor revives it
  perform pg_temp.as_user(V);
  begin
    update public.booking_requests set status = 'confirmed' where id = bfut;
    o := o || 'M1c FAIL vendor revived' || E'\n';
  exception when others then o := o || 'M1c ok: ' || sqlerrm || E'\n'; end;

  -- H4: review with fake date/name, then subject hides it, author re-points it
  perform pg_temp.as_user(H);
  begin
    insert into public.reviews (booking_id, author_id, subject_id, direction, rating, body, created_at, revealed_at, show_name, author_name, reply)
    values (bpast, H, V, 'user_to_vendor', 5, 'Great', '2020-01-01', now(), true, 'Totally Real Celebrity', 'fake reply');
    select 'created today=' || (created_at::date = current_date) || ' / revealed=' || coalesce(revealed_at::text,'null')
           || ' / name=' || coalesce(author_name,'null') || ' / reply=' || coalesce(reply,'null'), id
      into t, rv from public.reviews where booking_id = bpast and author_id = H;
    o := o || 'H4 insert: ' || t || E'\n';
    perform pg_temp.as_user(V);
    update public.reviews set created_at = now() + interval '1 year', revealed_at = null where id = rv;
    perform pg_temp.as_user(H);
    update public.reviews set subject_id = V2 where id = rv;
    perform pg_temp.as_user(null);
    select 'subject kept=' || (subject_id = V) || ' / created today=' || (created_at::date = current_date) into t from public.reviews where id = rv;
    o := o || 'H4 after tamper: ' || t || E'\n';
  exception when others then o := o || 'H4 error: ' || sqlerrm || E'\n'; end;

  -- M3: fake notifications
  perform pg_temp.as_user(H);
  begin
    insert into public.notifications (user_id, type, title, body) values (V, 'admin', 'PLUJ: verify your bank', 'Click here');
    o := o || 'M3 FAIL notified another user' || E'\n';
  exception when others then o := o || 'M3 other-user ok: ' || sqlerrm || E'\n'; end;
  begin
    insert into public.notifications (user_id, type, title) values (H, 'request_sent', 'Request sent! ✓');
    o := o || 'M3 own request_sent allowed (expected)' || E'\n';
  exception when others then o := o || 'M3 FAIL own request_sent refused: ' || sqlerrm || E'\n'; end;

  -- M5/M2: email and verified flags
  perform pg_temp.as_user(H);
  update public.profiles set email = 'attacker@example.com', email_verified = false, phone_verified = true, created_at = '2020-01-01' where id = H;
  select (email <> 'attacker@example.com') || ' / ev=' || email_verified || ' / pv=' || phone_verified into t from public.profiles where id = H;
  o := o || 'M5 email kept / flags: ' || t || E'\n';

  -- H2: party_names
  perform pg_temp.as_user(H);
  select count(*) into n from public.party_names(array[V, V2, 'b425bd23-0cd4-4be1-a90e-2ba00b9b1865'::uuid]);
  o := o || 'H2 party_names rows (V,V2 counterparties; admin not): ' || n || E'\n';

  -- L1: lockout window
  perform pg_temp.as_user(null);
  set local role anon;
  j := public.check_rate_limit('sec-test-key', 1, 999999);
  o := o || 'L1 first call: ' || j::text || E'\n';

  -- L4: answer_release_request
  perform pg_temp.as_user(H);
  begin
    perform public.answer_release_request(gen_random_uuid(), true);
    o := o || 'L4 FAIL callable' || E'\n';
  exception when others then o := o || 'L4 ok: ' || sqlerrm || E'\n'; end;

  -- L6: foreign photo URL on a listing
  perform pg_temp.as_user(V);
  begin
    update public.vendor_services set photos = '["https://evil.example/x.jpg"]'::jsonb where id = svc;
    o := o || 'L6 FAIL foreign photo accepted' || E'\n';
  exception when others then o := o || 'L6 ok: ' || sqlerrm || E'\n'; end;

  -- L11: storage
  perform pg_temp.as_user(H);
  begin
    insert into storage.objects (bucket_id, name, owner) values ('vendor-photos', H::text || '/x.jpg', H);
    o := o || 'L11 FAIL host uploaded a photo' || E'\n';
  exception when others then o := o || 'L11 host upload ok: ' || sqlerrm || E'\n'; end;
  perform pg_temp.as_user(null);
  set local role anon;
  select count(*) into n from storage.objects where bucket_id = 'vendor-photos';
  o := o || 'L11 anon can list photo files: ' || n || E'\n';

  -- L7: anon sees calendars
  begin
    select count(*) into n from public.vendor_availability;
    o := o || 'L7 anon calendar rows: ' || n || E'\n';
  exception when others then o := o || 'L7 anon: ' || sqlerrm || E'\n'; end;

  -- L8: pg_net from the browser
  perform pg_temp.as_user(H);
  begin
    perform net.http_get('https://example.com');
    o := o || 'L8 note: pg_net is callable (owned by Supabase, not exposed by the API)' || E'\n';
  exception when others then o := o || 'L8 ok: ' || sqlerrm || E'\n'; end;

  -- M7: delete with a live booking (fixture bnew is pending, so make a confirmed one)
  perform pg_temp.as_user(null);
  insert into public.booking_requests (id, user_id, vendor_id, status, event_date, start_time, service_id, guests)
  values ('TEST-SEC-LIVE', H, V, 'confirmed', current_date + 20, '18:00', svc, '20');
  perform pg_temp.as_user(H);
  begin
    perform public.delete_my_account();
    o := o || 'M7 FAIL deleted with a live booking' || E'\n';
  exception when others then o := o || 'M7 ok: ' || sqlerrm || E'\n'; end;
  begin
    perform public.delete_my_account_core();
    o := o || 'M7 FAIL core callable' || E'\n';
  exception when others then o := o || 'M7 core ok: ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'RESULTS (rolled back)\n%', o;
end $t$;
