-- "Have a PLUJ planner build it" (sql/2026-11-23-planner-requests.sql): checks.
-- Paste into the Supabase SQL editor and run. One DO block that ends by
-- raising, so everything rolls back (no emails go out): the "error" it shows
-- IS the report. Any line starting with FAIL needs a look.
-- Run 23 Nov 2026: every check passed.
do $t$
declare
  me uuid := gen_random_uuid();
  st uuid := gen_random_uuid();
  A  uuid := (select user_id from public.admin_users limit 1);
  o text := ''; res jsonb; rid uuid; n int; t text;
  d date := (now() at time zone 'America/Chicago')::date + 40;
begin
  execute $f$create function pg_temp.as_user(u uuid) returns void language plpgsql as $b$
    begin
      reset role;
      perform set_config('request.jwt.claims', case when u is null then json_build_object('role','anon')::text else json_build_object('sub',u,'role','authenticated')::text end, true);
      perform set_config('request.jwt.claim.sub', coalesce(u::text,''), true);
      if u is not null then set local role authenticated; else set local role anon; end if;
    end $b$$f$;
  perform pg_temp.as_user(null); reset role;
  update public.private_mode_state set is_private = false where id = 1;   -- rolled back too
  insert into auth.users (id, aud, role, email, raw_user_meta_data, email_confirmed_at) values
    (me, 'authenticated', 'authenticated', 'host-plan@example.com', '{"display_name":"Paula Host","dob":"1990-01-01","responsibility_accepted":"true"}', now()),
    (st, 'authenticated', 'authenticated', 'stranger-plan@example.com', '{"display_name":"Mallory","dob":"1990-01-01","responsibility_accepted":"true"}', now());

  -- 1. Bad input is refused with a clear message
  perform pg_temp.as_user(me);
  begin perform public.request_event_planner('Wedding','Houston', d, null,'18:00','23:00',150,20000,'short','email',null,'en'); o := o || 'FAIL short; ';
  exception when others then o := o || 'short: ' || sqlerrm || E'\n'; end;
  begin perform public.request_event_planner('Wedding','Houston', d - 60, null,'18:00','23:00',150,20000,'A garden wedding with dinner and dancing','email',null,'en'); o := o || 'FAIL past; ';
  exception when others then o := o || 'past: ' || sqlerrm || E'\n'; end;
  begin perform public.request_event_planner('Wedding','Houston', d, null,'18:00','23:00',150,50,'A garden wedding with dinner and dancing','email',null,'en'); o := o || 'FAIL budget; ';
  exception when others then o := o || 'budget: ' || sqlerrm || E'\n'; end;
  begin perform public.request_event_planner('Wedding','Houston', d, null,'18:00','23:00',150,20000,'A garden wedding with dinner and dancing','call',null,'en'); o := o || 'FAIL phone; ';
  exception when others then o := o || 'no phone: ' || sqlerrm || E'\n'; end;
  begin perform public.request_event_planner('Wedding','Houston', d, null,'6pm','23:00',150,20000,'A garden wedding with dinner and dancing','email',null,'en'); o := o || 'FAIL time; ';
  exception when others then o := o || 'time: ' || sqlerrm || E'\n'; end;
  begin perform public.request_event_planner('Wedding','Houston', d, null,'18:00','23:00',150,20000,'A garden wedding with dinner and dancing','text','<b>555</b>','en'); o := o || 'FAIL phone chars; ';
  exception when others then o := o || 'phone chars: ' || sqlerrm || E'\n'; end;

  -- 2. A good request (HTML in the description must come out escaped)
  res := public.request_event_planner('Wedding','Houston', d, d + 1,'18:00','01:00',150,20000,
           'Garden wedding <script>alert(1)</script> with dinner & dancing. Venue not booked yet.','text','(713) 555-0100','es');
  rid := (res->>'id')::uuid;
  o := o || 'created: ' || res::text || E'\n';
  reset role;
  select count(*) into n from public.notifications where type = 'planner_request' and created_at > now() - interval '1 minute';
  o := o || 'admin bell notices: ' || n || E'\n';
  select string_agg(kind || ' [' || left(subject, 60) || ']', ' | ') into t from public.email_outbox where ref_id = rid::text;
  o := o || 'emails: ' || coalesce(t,'FAIL none') || E'\n';
  select (html like '%&lt;script&gt;%' and html not like '%<script>%')::text into t from public.email_outbox where ref_id = rid::text and kind='planner_request' limit 1;
  o := o || 'admin email escapes html: ' || coalesce(t,'FAIL') || E'\n';
  select (html like '%Recibimos tu solicitud%')::text into t from public.email_outbox where ref_id = rid::text and kind='planner_confirmation' limit 1;
  o := o || 'host email in Spanish: ' || coalesce(t,'FAIL') || E'\n';

  -- 3. The host sees their own, without the team's note or their phone
  perform pg_temp.as_user(me);
  res := public.my_planner_requests();
  o := o || 'mine count=' || jsonb_array_length(res) || ' has admin_note=' || (res->0 ? 'admin_note')::text || E'\n';
  begin perform public.admin_planner_requests(); o := o || 'FAIL host admin list; '; exception when others then o := o || 'host admin list refused; '; end;
  begin perform public.admin_update_planner_request(rid, 'booked', 'x'); o := o || 'FAIL host admin update; '; exception when others then o := o || 'host admin update refused; '; end;
  begin execute 'select count(*) from public.planner_requests' into n; o := o || 'FAIL host direct read; '; exception when others then o := o || 'host direct read refused; '; end;
  begin update public.planner_requests set status='booked' where id = rid; o := o || 'FAIL direct update; '; exception when others then o := o || 'direct update refused; '; end;

  -- 4. At most 3 open requests per account
  perform public.request_event_planner('Birthday Party','Katy', d, null,'12:00','16:00',30,1500,'Kids birthday with a bounce house and tacos','email',null,'en');
  perform public.request_event_planner('Birthday Party','Katy', d, null,'12:00','16:00',30,1500,'Second kids birthday with a bounce house','email',null,'en');
  begin perform public.request_event_planner('Birthday Party','Katy', d, null,'12:00','16:00',30,1500,'Third kids birthday with a bounce house','email',null,'en'); o := o || E'\nFAIL 4th open; ';
  exception when others then o := o || E'\n4th open: ' || sqlerrm || E'\n'; end;

  -- 5. Someone else, and a logged-out visitor
  perform pg_temp.as_user(st);
  o := o || 'stranger sees ' || jsonb_array_length(public.my_planner_requests()) || '; ';
  begin perform public.cancel_planner_request(rid); o := o || 'FAIL stranger cancel; '; exception when others then o := o || 'stranger cancel: ' || sqlerrm || '; '; end;
  perform pg_temp.as_user(null);
  begin perform public.request_event_planner('Wedding','Houston', d, null,'18:00','23:00',150,20000,'A garden wedding with dinner and dancing','email',null,'en'); o := o || 'FAIL anon request; ';
  exception when others then o := o || E'\nanon request: ' || sqlerrm || '; '; end;
  begin perform public.my_planner_requests(); o := o || 'FAIL anon mine; '; exception when others then o := o || 'anon mine refused; '; end;
  begin execute 'select count(*) from public.planner_requests' into n; o := o || 'FAIL anon read; '; exception when others then o := o || 'anon read refused; '; end;

  -- 6. The team works it; the host is told
  perform pg_temp.as_user(A);
  res := public.admin_planner_requests();
  o := o || E'\nadmin sees ' || jsonb_array_length(res) || ' first: ' || (res->0->>'host_name') || ' / ' || (res->0->>'host_email') || ' / ' || (res->0->>'when_text') || E'\n';
  perform public.admin_update_planner_request(rid, 'contacted', 'Called Paula, sending 3 venue options');
  reset role;
  select title || ': ' || body into t from public.notifications where user_id = me and type = 'planner_update' order by created_at desc limit 1;
  o := o || 'host told: ' || coalesce(t,'FAIL nothing') || E'\n';
  perform pg_temp.as_user(A);
  begin perform public.admin_update_planner_request(rid, 'hacked', null); o := o || 'FAIL bad status; '; exception when others then o := o || 'bad status refused; '; end;

  -- 7. The host cancels, once
  perform pg_temp.as_user(me);
  o := o || 'host cancel: ' || public.cancel_planner_request(rid)::text || '; ';
  begin perform public.cancel_planner_request(rid); o := o || 'FAIL double cancel; '; exception when others then o := o || 'double cancel: ' || sqlerrm || '; '; end;
  reset role;
  raise exception E'PLANNER TESTS\n%', o;
end $t$;
