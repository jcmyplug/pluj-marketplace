-- Normal operations still work after the 15 Nov 2026 security hardening.
-- Paste into the Supabase SQL editor and run. Everything runs inside one DO
-- block that ends by raising, so the whole transaction rolls back and nothing
-- is kept: the "error" it shows IS the report. Lines with FAILED need a look.
-- (The first test vendor has no legal business details, so editing its
-- listing is refused by the separate legal-info rule; that is expected.)
-- Companion: sql/tests/2026-11-15-attack-tests.sql (every attack refused).
do $t$
declare
  H  uuid := 'c4b3d98c-0105-47e0-aeec-0af094155dfe';   -- test host
  ven uuid := 'e7d74a14-0227-4a8e-9ed5-8cb9a7c0a69a';  -- test vendor
  A  uuid := 'b425bd23-0cd4-4be1-a90e-2ba00b9b1865';   -- an admin
  o  text := ''; t text; n int; svc uuid; cid uuid; mid uuid; j jsonb;
  newhost uuid := gen_random_uuid(); newvendor uuid := gen_random_uuid(); sneaky uuid := gen_random_uuid();
begin
  execute $f$create function pg_temp.as_user(u uuid) returns void language plpgsql as $b$
    begin
      reset role;
      perform set_config('request.jwt.claims', case when u is null then '' else json_build_object('sub',u,'role','authenticated')::text end, true);
      perform set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
      if u is not null then set local role authenticated; end if;
    end $b$$f$;
  perform pg_temp.as_user(null);
  select id into svc from public.vendor_services where vendor_id = ven and active limit 1;

  -- Sign-up path (what Supabase Auth runs when someone signs up)
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (newhost, 'authenticated', 'authenticated', 'test-host-sec@example.com', '{"display_name":"Ana","responsibility_accepted":"true"}');
    o := o || 'SIGNUP while private: allowed (unexpected)' || E'\n';
  exception when others then o := o || 'SIGNUP while private refused (expected): ' || sqlerrm || E'\n'; end;
  update public.private_mode_state set is_private = false where id = 1;   -- only inside this rolled-back test
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (newhost, 'authenticated', 'authenticated', 'test-host-sec@example.com', '{"display_name":"Ana","full_name":"Ana Test","dob":"1990-05-01","responsibility_accepted":"true","lang":"es"}');
    select role || ' / ' || status || ' / lang=' || lang || ' / verified=' || email_verified into t from public.profiles where id = newhost;
    o := o || 'SIGNUP host: ' || coalesce(t,'NO PROFILE (FAILED)') || E'\n';
    update auth.users set email_confirmed_at = now() where id = newhost;
    select 'after confirming email, verified=' || email_verified into t from public.profiles where id = newhost;
    o := o || 'SIGNUP host ' || t || E'\n';
  exception when others then o := o || 'SIGNUP host FAILED: ' || sqlerrm || E'\n'; end;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (newvendor, 'authenticated', 'authenticated', 'test-vendor-sec@example.com', '{"role":"vendor","display_name":"Bo","responsibility_accepted":"true","business_name":"Bo Tacos","description":"We cook tacos for weddings and parties all over Houston, Texas."}');
    select pp.role || ' / ' || pp.status || ' / vendor=' || coalesce(vv.verification_status,'NO VENDOR ROW (FAILED)') into t
      from public.profiles pp left join public.vendor_profiles vv on vv.id = pp.id where pp.id = newvendor;
    o := o || 'SIGNUP vendor: ' || coalesce(t,'NO PROFILE (FAILED)') || E'\n';
  exception when others then o := o || 'SIGNUP vendor FAILED: ' || sqlerrm || E'\n'; end;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (sneaky, 'authenticated', 'authenticated', 'test-sneaky-sec@example.com', '{"role":"admin","display_name":"X","responsibility_accepted":"true"}');
    select role into t from public.profiles where id = sneaky;
    o := o || 'SIGNUP asking to be admin gets role: ' || coalesce(t,'none') || E'\n';
  exception when others then o := o || 'SIGNUP sneaky error: ' || sqlerrm || E'\n'; end;
  begin
    insert into auth.users (id, aud, role, email, raw_user_meta_data) values
      (gen_random_uuid(), 'authenticated', 'authenticated', 'test-kid-sec@example.com', '{"display_name":"K","dob":"2015-01-01","responsibility_accepted":"true"}');
    o := o || 'SIGNUP under 18 FAILED: allowed' || E'\n';
  exception when others then o := o || 'SIGNUP under 18 refused (expected): ' || sqlerrm || E'\n'; end;

  -- Host
  perform pg_temp.as_user(H);
  begin
    insert into public.booking_requests (id, user_id, vendor_id, event_date, start_time, end_time, service_id, guests, message, city, state)
    values ('TEST-OPS-1', H, ven, current_date + 45, '18:00', '22:00', svc, '40', 'Birthday party', 'Houston', 'TX');
    select status into t from public.booking_requests where id = 'TEST-OPS-1';
    o := o || 'HOST sends booking request: ' || t || E'\n';
  exception when others then o := o || 'HOST booking FAILED: ' || sqlerrm || E'\n'; end;
  begin
    cid := public.start_conversation(ven, 'user_vendor');
    insert into public.messages (conversation_id, sender_id, recipient_id, body) values (cid, H, ven, 'Hi! Are you free?') returning id into mid;
    insert into public.favorites (user_id, vendor_id) values (H, ven);
    insert into public.notifications (user_id, type, title, body) values (H, 'request_sent', 'Request sent', 'We told the vendor.');
    select count(*) into n from public.party_names(array[ven]);
    o := o || 'HOST chats, saves a favorite, gets a notice, sees vendor name (' || n || '): ok' || E'\n';
  exception when others then o := o || 'HOST actions FAILED: ' || sqlerrm || E'\n'; end;

  -- Vendor
  perform pg_temp.as_user(ven);
  begin
    update public.booking_requests set status = 'confirmed', vendor_note = 'See you then!' where id = 'TEST-OPS-1';
    select status into t from public.booking_requests where id = 'TEST-OPS-1';
    o := o || 'VENDOR accepts: ' || t || E'\n';
    update public.messages set read_at = now() where id = mid;
    insert into public.messages (conversation_id, sender_id, recipient_id, body) values (cid, ven, H, 'Yes, we are!');
    insert into public.vendor_availability (vendor_id, date, status) values (ven, current_date + 60, 'blocked');
    insert into storage.objects (bucket_id, name, owner) values ('vendor-photos', ven::text || '/ops-test.jpg', ven);
    o := o || 'VENDOR replies, blocks a date, uploads a photo: ok' || E'\n';
    perform public.deactivate_my_account();
    perform public.reactivate_my_account();
    select pp.status || ' / ' || vv.verification_status into t from public.profiles pp join public.vendor_profiles vv on vv.id = pp.id where pp.id = ven;
    o := o || 'VENDOR pauses and returns: ' || t || E'\n';
  exception when others then o := o || 'VENDOR actions FAILED: ' || sqlerrm || E'\n'; end;

  perform pg_temp.as_user(H);
  begin
    update public.booking_requests set status = 'cancelled' where id = 'TEST-OPS-1';
    select status || ' by ' || coalesce(cancelled_by,'?') into t from public.booking_requests where id = 'TEST-OPS-1';
    o := o || 'HOST cancels: ' || t || E'\n';
  exception when others then o := o || 'HOST cancel FAILED: ' || sqlerrm || E'\n'; end;

  -- Admin
  perform pg_temp.as_user(A);
  begin
    select count(*) into n from public.admin_list_accounts();
    j := public.ops_dashboard();
    perform public.admin_message(H, 'message', 'Test', 'Hello from PLUJ');
    perform public.start_conversation(H, 'admin');
    o := o || 'ADMIN lists ' || n || ' accounts, opens the dashboard, messages, opens support thread: ok' || E'\n';
  exception when others then o := o || 'ADMIN FAILED: ' || sqlerrm || E'\n'; end;

  reset role;
  raise exception E'RESULTS (rolled back)\n%', o;
end $t$;
