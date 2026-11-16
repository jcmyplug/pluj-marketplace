-- PLUJ security hardening, 15 Nov 2026 (security items 1-3, 10, 11, 13)
-- Applied to the live database on 15 Nov 2026 as migrations
-- security_hardening_2026_11_15_a … _h, and checked with
-- sql/tests/2026-11-15-attack-tests.sql (every attack below is refused).
--
-- Fixes from the independent security review of the live database. Every fix
-- is enforced in Postgres, so it holds no matter what a browser sends: the
-- repository is public, so assume an attacker has read the app and the SQL.
--
-- Pattern used throughout: columns a person must not control are silently
-- reset to the right value (or to their old value) instead of raising, unless
-- the request is privileged (is_privileged_context(): PLUJ's own functions,
-- an admin, or the system). Raising would break the existing app wherever it
-- sends a whole row back; resetting keeps it working and makes tampering
-- pointless.
--
--  C1  vendor_profiles: a host could insert an "approved" vendor row, and a
--      pending/rejected vendor could pre-set prev_verification_status and
--      pause/unpause into "approved".
--  H1  conversations: anyone could open a "PLUJ Support" (kind='admin') thread.
--  H2  profiles: counterparties (anyone after one-sided contact) could read
--      email, phone and date of birth. Names now come from party_names();
--      the broad policy is narrowed in part 2, after the app uses it.
--  H3  booking_requests: a host could insert a booking already "confirmed".
--  H4  reviews: authors could re-point reviews; subjects could hide them.
--  M1  booking_requests: a host could change the date while cancelling (to
--      escape the late-cancellation rules), edit a confirmed booking without
--      the vendor, or revive a cancelled/declined one.
--  M2  created_at was editable, which would decide the free intro months.
--  M3  notifications: anyone could send fake system notifications.
--  M4  conversations: a closed thread could be reopened by the other party.
--      messages: the recipient could rewrite the text of a message they got.
--  M5  profiles: email and verified flags were self-editable.
--  M7  delete_my_account wiped confirmed and paid bookings.
--  L1  check_rate_limit: lockouts limited to an hour, at least 5 tries.
--  L4  answer_release_request had no owner check (now not callable).
--  L5  admin_delete_account trusted user-editable metadata (separate file).
--  L6  photo URLs: only PLUJ's own storage, in the vendor's own folder.
--  L7  calendars: only for vendors who are public (or the vendor).
--  L8  pg_net: owned by Supabase; see the note below.
--  L10 blocked accounts cannot open conversations.
--  L11 storage: only vendors upload photos, max 300 files each; the unused
--      documents bucket takes no uploads; nobody can list other people's files.

-- ── helpers ──────────────────────────────────────────────────────────────────
create or replace function public.is_vendor()
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'vendor');
$$;
revoke all on function public.is_vendor() from public, anon;
grant execute on function public.is_vendor() to authenticated;

-- ── C1: vendor_profiles ─────────────────────────────────────────────────────
create or replace function public.guard_vendor_profile_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  if new.id is distinct from auth.uid() or not public.is_vendor() then
    raise exception 'Only a vendor account has a business profile' using errcode = '42501';
  end if;
  new.verification_status := 'pending';
  new.verified_at := null;
  new.rejection_reason := null;
  new.prev_verification_status := null;
  new.stripe_account_id := null;
  new.stripe_details_submitted := false;
  new.stripe_transfers_enabled := false;
  new.stripe_payouts_enabled := false;
  new.stripe_charges_enabled := false;
  new.stripe_payouts_locked := false;
  new.stripe_updated_at := null;
  new.pluj_balance_due_cents := 0;
  new.stripe_fee_month := null;
  new.stripe_fee_year := null;
  new.created_at := now();
  return new;
end $$;
create or replace trigger trg_guard_vendor_profile_insert
  before insert on public.vendor_profiles
  for each row execute function public.guard_vendor_profile_insert();

create or replace function public.guard_vendor_profile_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  if (new.verification_status, new.verified_at, new.rejection_reason)
     is distinct from (old.verification_status, old.verified_at, old.rejection_reason) then
    raise exception 'verification status is set by PLUJ, not the vendor';
  end if;
  if (new.stripe_account_id, new.stripe_details_submitted, new.stripe_transfers_enabled, new.stripe_payouts_enabled,
      new.stripe_charges_enabled, new.stripe_payouts_locked, new.pluj_balance_due_cents, new.stripe_fee_month, new.stripe_fee_year)
     is distinct from (old.stripe_account_id, old.stripe_details_submitted, old.stripe_transfers_enabled, old.stripe_payouts_enabled,
      old.stripe_charges_enabled, old.stripe_payouts_locked, old.pluj_balance_due_cents, old.stripe_fee_month, old.stripe_fee_year) then
    raise exception 'payment settings are managed by PLUJ and Stripe';
  end if;
  -- 15 Nov 2026: the status to restore after a pause, and the sign-up date
  -- (which decides the free intro months), are PLUJ's records.
  new.prev_verification_status := old.prev_verification_status;
  new.created_at := old.created_at;
  return new;
end $$;

create or replace function public.deactivate_my_account()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles where id = uid and status = 'blocked') then
    raise exception 'Blocked accounts cannot be changed here' using errcode = '42501';
  end if;
  -- Already paused: nothing to do. (Running it twice used to be harmless only
  -- because of the coalesce below, which is what let a stale or user-written
  -- value be "restored" on unpause.)
  if exists (select 1 from public.profiles where id = uid and status = 'deactivated') then
    return;
  end if;

  perform set_config('plug.self_service', 'on', true);   -- transaction-local

  update public.profiles set status = 'deactivated' where id = uid;

  -- Remember the CURRENT status (never one left over or supplied by the user).
  update public.vendor_profiles
     set prev_verification_status = verification_status,
         verification_status = 'suspended'
   where id = uid;

  update public.vendor_services set active = false where vendor_id = uid;
end $$;

-- ── H1, M4, L10: conversations ───────────────────────────────────────────────
alter table public.conversations
  add constraint conversations_kind_check check (kind in ('user_vendor','admin')) not valid;
alter table public.conversations validate constraint conversations_kind_check;

create or replace function public.start_conversation(other_id uuid, p_kind text default 'user_vendor',
  p_service_id uuid default null, p_service_name text default null, p_subject text default null,
  p_event_date date default null, p_booking_id uuid default null)
returns uuid language plpgsql security definer
set search_path = public, pg_temp as $$
declare cid uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if other_id is null or other_id = me then raise exception 'Choose who to message' using errcode = '22023'; end if;
  if coalesce(p_kind, '') not in ('user_vendor','admin') then
    raise exception 'Unknown conversation type' using errcode = '22023';
  end if;
  if p_kind = 'admin' and not public.is_admin() then
    raise exception 'Only PLUJ staff can open a staff conversation' using errcode = '42501';
  end if;
  if not public.is_active() then
    raise exception 'This account cannot send messages' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = other_id) then
    raise exception 'That account does not exist' using errcode = '22023';
  end if;

  select id into cid from public.conversations
   where status = 'open'
     and ((a_id = me and b_id = other_id) or (a_id = other_id and b_id = me))
     and coalesce(service_id::text,'') = coalesce(p_service_id::text,'')
     and kind = p_kind
   limit 1;
  if cid is not null then return cid; end if;

  insert into public.conversations (kind, a_id, b_id, service_id, service_name,
                                    subject, event_date, booking_id)
  values (p_kind, me, other_id, p_service_id, p_service_name,
          p_subject, p_event_date, p_booking_id)
  returning id into cid;
  return cid;
end $$;

alter policy conv_party_insert on public.conversations
  with check ((((select auth.uid()) = a_id) and kind <> 'admin' and (select public.is_active()))
              or (select public.is_admin()));

create or replace function public.guard_conversation_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  if (new.a_id, new.b_id, new.kind, new.booking_id, new.service_id, new.event_date)
     is distinct from (old.a_id, old.b_id, old.kind, old.booking_id, old.service_id, old.event_date)
  then raise exception 'conversation participants and context are immutable'; end if;
  -- Ending a conversation is one-way and is recorded against the person who
  -- ended it. Nobody but PLUJ can reopen it.
  if (new.status, new.closed_by, new.closed_at) is distinct from (old.status, old.closed_by, old.closed_at) then
    if not (old.status = 'open' and new.status = 'closed' and new.closed_by = auth.uid()) then
      raise exception 'A conversation can only be ended, by one of its two people';
    end if;
    new.closed_at := now();
  end if;
  return new;
end $$;

-- Messages: the person a message was sent to may mark it read, nothing else.
-- (Their update policy let them rewrite the other person's words.)
create or replace function public.guard_message_write()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  if TG_OP = 'INSERT' then
    new.created_at := now();
    new.read := false;
    new.read_at := null;
    return new;
  end if;
  new.id := old.id; new.thread_id := old.thread_id; new.request_id := old.request_id;
  new.sender_id := old.sender_id; new.recipient_id := old.recipient_id;
  new.body := old.body; new.created_at := old.created_at;
  new.conversation_id := old.conversation_id;
  return new;
end $$;
create or replace trigger trg_guard_message_write
  before insert or update on public.messages
  for each row execute function public.guard_message_write();

-- ── H2 part 1: names of the people you deal with, without their contact data
create or replace function public.party_names(p_ids uuid[])
returns table(id uuid, display_name text, full_name text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select p.id, p.display_name, p.full_name
    from public.profiles p
   where auth.uid() is not null
     and p.id = any (p_ids[1:200])
     and (p.id = auth.uid() or public.is_admin() or public.is_counterparty(p.id));
$$;
revoke all on function public.party_names(uuid[]) from public, anon;
grant execute on function public.party_names(uuid[]) to authenticated;

-- ── H3: a booking request is always created as a pending request ─────────────
-- Named trg_aa_… so it runs before the price and add-on triggers, which then
-- compute their values on the clean row.
create or replace function public.guard_booking_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  new.status := 'pending';
  new.responded_at := null;
  new.cancelled_by := null;
  new.cancelled_at := null;
  new.late_cancel := false;
  new.refund_due := false;
  new.fee_due := false;
  new.payment_status := 'not_required';
  new.paid_at := null;
  new.deposit_amount := null;
  new.total_price := null;
  new.platform_fee := null;
  new.vendor_payout := null;
  new.stripe_payment_intent_id := null;
  new.payment_terms_accepted := false;
  new.vendor_note := null;
  new.created_at := now();
  new.updated_at := now();
  return new;
end $$;
create or replace trigger trg_aa_guard_booking_insert
  before insert on public.booking_requests
  for each row execute function public.guard_booking_insert();

-- ── M1: what a host may change, and when ─────────────────────────────────────
create or replace function public.guard_booking_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  is_vendor   boolean := auth.uid() = old.vendor_id;
  is_customer boolean := auth.uid() = old.user_id;
  live        text[]  := array['pending','confirmed','accepted','approved'];
  agreed      text[]  := array['confirmed','accepted','approved'];
begin
  if public.is_privileged_context() then return new; end if;
  if new.user_id is distinct from old.user_id
  or new.vendor_id is distinct from old.vendor_id then
    raise exception 'booking parties cannot be reassigned';
  end if;
  -- A cancelled, declined, expired or completed booking stays that way, for
  -- both sides: a new booking is a new request.
  if not (old.status = any (live)) and new.status is distinct from old.status then
    raise exception 'This booking is closed. Send a new request instead.';
  end if;
  if is_customer and not is_vendor then
    if new.status is distinct from old.status
       and new.status not in ('cancelled','pending') then
      raise exception 'only the vendor can accept or decline a booking';
    end if;
    -- Cancelling changes nothing else: the cancellation rules are worked out
    -- from the booking as it was.
    if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
      new.event_date := old.event_date;   new.end_date := old.end_date;
      new.start_time := old.start_time;   new.end_time := old.end_time;
      new.street_address := old.street_address; new.address_line2 := old.address_line2;
      new.city := old.city; new.state := old.state; new.zip_code := old.zip_code;
      new.venue := old.venue; new.venue_type := old.venue_type; new.guests := old.guests;
      new.service_id := old.service_id; new.service_name := old.service_name;
      new.package_name := old.package_name; new.package_price := old.package_price;
      new.addons := old.addons; new.addons_total := old.addons_total;
    end if;
    -- A confirmed booking only changes with the vendor's agreement: any change
    -- to what was agreed re-opens it as a request for the vendor to approve.
    if old.status = any (agreed) and new.status = any (agreed)
       and (new.event_date, new.end_date, new.start_time, new.end_time, new.street_address,
            new.address_line2, new.city, new.state, new.zip_code, new.venue, new.venue_type,
            new.guests, new.service_id, new.package_name, new.addons)
           is distinct from
           (old.event_date, old.end_date, old.start_time, old.end_time, old.street_address,
            old.address_line2, old.city, old.state, old.zip_code, old.venue, old.venue_type,
            old.guests, old.service_id, old.package_name, old.addons) then
      new.status := 'pending';
    end if;
  elsif is_vendor and not is_customer then
    if (new.event_date, new.start_time, new.end_time, new.package_price,
        new.service_id, new.guests, new.street_address)
       is distinct from
       (old.event_date, old.start_time, old.end_time, old.package_price,
        old.service_id, old.guests, old.street_address) then
      raise exception 'a vendor cannot edit the customer''s booking details';
    end if;
  end if;
  new.created_at := old.created_at;
  return new;
end $$;

-- ── H4: reviews ──────────────────────────────────────────────────────────────
create or replace function public.guard_review_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare nm text;
begin
  if public.is_privileged_context() then return new; end if;
  new.created_at := now();
  new.revealed_at := null;
  new.reply := null;
  new.reply_at := null;
  -- The name shown is the author's own first name, never free text.
  if new.show_name then
    select split_part(btrim(coalesce(nullif(display_name,''), full_name, '')), ' ', 1)
      into nm from public.profiles where id = auth.uid();
    new.author_name := nullif(nm, '');
    new.show_name := new.author_name is not null;
  else
    new.author_name := null;
  end if;
  return new;
end $$;
create or replace trigger trg_guard_review_insert
  before insert on public.reviews
  for each row execute function public.guard_review_insert();

create or replace function public.guard_review_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  -- Nobody re-points, re-dates, reveals or hides a review.
  new.booking_id  := old.booking_id;
  new.author_id   := old.author_id;
  new.subject_id  := old.subject_id;
  new.direction   := old.direction;
  new.created_at  := old.created_at;
  new.revealed_at := old.revealed_at;
  new.show_name   := old.show_name;
  new.author_name := old.author_name;
  if auth.uid() = old.subject_id and auth.uid() <> old.author_id then
    -- The person reviewed may only write a reply.
    if (new.rating, new.body, new.r_responsiveness, new.r_quality,
        new.r_punctuality, new.r_recommend, new.r_rebook)
       is distinct from
       (old.rating, old.body, old.r_responsiveness, old.r_quality,
        old.r_punctuality, old.r_recommend, old.r_rebook)
    then raise exception 'the subject of a review may only write a reply'; end if;
    new.reply_at := now();
  else
    -- The author edits their own words and stars, never the reply.
    new.reply := old.reply;
    new.reply_at := old.reply_at;
  end if;
  return new;
end $$;

-- ── M2, M5: profiles ─────────────────────────────────────────────────────────
create or replace function public.guard_profile_self_insert()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  if new.role is distinct from 'user' then
    raise exception 'account role is managed by PLUJ';
  end if;
  new.email := (select email from auth.users where id = auth.uid());
  new.email_verified := false;
  new.phone_verified := false;
  new.created_at := now();
  return new;
end $$;

create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
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

  if new.stripe_customer_id is distinct from old.stripe_customer_id then
    raise exception 'payment settings are managed by PLUJ';
  end if;

  -- 15 Nov 2026: the address PLUJ emails, the verified flags and the sign-up
  -- date are kept in step with sign-in (auth.users) by PLUJ, not by the user.
  new.email := old.email;
  new.email_verified := old.email_verified;
  new.phone_verified := old.phone_verified;
  new.created_at := old.created_at;

  return new;
end $$;

-- ── M3: the browser may only write its own "request sent" notice ─────────────
alter policy notifications_scoped_insert on public.notifications
  with check (((select auth.uid()) = user_id)
              and type = 'request_sent'
              and char_length(title) <= 120
              and char_length(coalesce(body, '')) <= 600);

create or replace function public.notify_event_recap_credits()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  c uuid;
  author text;
begin
  -- Only an approved, public pro can credit others (and so notify them).
  if not public.vendor_is_public(new.vendor_id) then return new; end if;
  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'A PLUJ pro') into author
    from public.vendor_profiles where id = new.vendor_id;
  author := left(author, 80);
  for c in select unnest(new.credited) except select unnest(case when TG_OP = 'UPDATE' then old.credited else '{}'::uuid[] end) loop
    if public.vendor_is_public(c) then
      insert into public.notifications (user_id, type, title, body)
      values (c, 'recap_credit', '📸 ' || author || ' credited you',
              author || ' posted "' || left(coalesce(new.title, ''), 120) || '" and credited you as one of the pros who worked it. It now links to your profile.');
    end if;
  end loop;
  return new;
exception when others then
  raise warning '[notify_event_recap_credits] %', sqlerrm;
  return new;
end $$;

-- ── M7: an account with live bookings or money in flight cannot be deleted ───
-- The existing function keeps doing the deleting; it is renamed and only
-- reachable through these checks.
alter function public.delete_my_account() rename to delete_my_account_core;
revoke all on function public.delete_my_account_core() from public, anon, authenticated;

create function public.delete_my_account()
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if exists (select 1 from public.booking_requests b
              where (b.user_id = uid or b.vendor_id = uid)
                and b.status in ('confirmed','accepted','approved')
                and (b.event_date is null or b.event_date >= current_date - 3)) then
    raise exception 'You have a confirmed booking that has not finished yet. Cancel it first (or wait until 3 days after the event), then delete your account.'
      using errcode = '42501';
  end if;
  if exists (select 1 from public.booking_payment_plans p
              where (p.host_id = uid or p.vendor_id = uid)
                and (p.status not in ('released','cancelled')
                     or coalesce(p.refund_state, '') in ('pending','failed'))) then
    raise exception 'A payment on one of your bookings is still being held or refunded. Write to info@pluj.us and we will close your account once it is settled.'
      using errcode = '42501';
  end if;
  perform public.delete_my_account_core();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ── L1: a rate-limit lockout lasts at most an hour, after at least 5 tries ───
create or replace function public.check_rate_limit(p_key text, p_max integer default 5, p_window_seconds integer default 900)
returns jsonb language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  r       public.rate_limits%rowtype;
  now_ts  timestamptz := now();
  win     interval;
  cap     integer := greatest(coalesce(p_max, 5), 5);
begin
  if p_key is null or btrim(p_key) = '' or char_length(p_key) > 200 then
    return jsonb_build_object('allowed', false, 'reason', 'missing key');
  end if;

  /* Anyone can call this, so it must not be a way to lock someone else out:
     a window is at most an hour and a limit is at least 5 tries. */
  win := make_interval(secs => least(greatest(coalesce(p_window_seconds, 900), 10), 3600));

  select * into r from public.rate_limits where identifier = p_key for update;

  if not found then
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
$$;

-- ── L4 ───────────────────────────────────────────────────────────────────
revoke execute on function public.answer_release_request(uuid, boolean) from public, anon, authenticated;

-- L5 (admin_delete_account reading admin status from admin_users, not from
-- sign-up metadata) is in sql/2026-11-15-admin-delete-check.sql: its body
-- contains DELETE statements, so it is applied in the Supabase SQL editor.

-- ── L6: photos must be PLUJ uploads in the vendor's own folder ───────────────
create or replace function public.guard_photo_urls()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  owner_id uuid;
  prefix   text;
  u        text;
  max_n    integer;
begin
  if public.is_privileged_context() then return new; end if;
  if TG_OP = 'UPDATE' and new.photos is not distinct from old.photos then return new; end if;
  if new.photos is null or jsonb_typeof(new.photos) <> 'array' then return new; end if;
  if TG_TABLE_NAME = 'vendor_profiles' then owner_id := new.id; max_n := 12;
  elsif TG_TABLE_NAME = 'event_recaps' then owner_id := new.vendor_id; max_n := 12;
  else owner_id := new.vendor_id; max_n := 10; end if;
  if jsonb_array_length(new.photos) > max_n then
    raise exception 'At most % photos', max_n using errcode = '22023';
  end if;
  prefix := 'https://btmqghudfakpbbplrqhf.supabase.co/storage/v1/object/public/vendor-photos/' || owner_id::text || '/';
  for u in select jsonb_array_elements_text(new.photos) loop
    if left(u, char_length(prefix)) <> prefix or u ~ '[[:space:]"<>\\]' or position('..' in u) > 0 then
      raise exception 'Photos must be uploaded to PLUJ' using errcode = '22023';
    end if;
  end loop;
  return new;
end $$;
create or replace trigger trg_guard_photo_urls
  before insert or update on public.vendor_services
  for each row execute function public.guard_photo_urls();
create or replace trigger trg_guard_photo_urls
  before insert or update on public.vendor_profiles
  for each row execute function public.guard_photo_urls();
create or replace trigger trg_guard_photo_urls
  before insert or update on public.event_recaps
  for each row execute function public.guard_photo_urls();

-- ── L7: calendars of vendors who are public (and the vendor's own) ───────────
alter policy vendor_availability_public_select on public.vendor_availability
  using (public.vendor_is_public(vendor_id) or (select auth.uid()) = vendor_id);

-- ── L8: pg_net ────────────────────────────────────────────────────────────────
-- Tried: revoke all on all functions in schema net from anon, authenticated;
-- It has no effect: Supabase (supabase_admin) owns pg_net and grants it to
-- PUBLIC. The net schema is not exposed through the website's API, and no
-- function a browser can call passes its input to net.*, so this stays as is.

-- ── L11: storage ─────────────────────────────────────────────────────────────
-- A policy on storage.objects cannot query storage.objects itself (Postgres
-- reports infinite recursion), so the per-vendor file count is a function.
create or replace function public.my_photo_count()
returns integer language sql stable security definer
set search_path = public, pg_temp as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'vendor-photos'
     and (storage.foldername(o.name))[1] = auth.uid()::text;
$$;
revoke all on function public.my_photo_count() from public, anon;
grant execute on function public.my_photo_count() to authenticated;

alter policy "vendor can upload own photos" on storage.objects
  with check (bucket_id = 'vendor-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.is_vendor())
              and (select public.my_photo_count()) < 300);
alter policy "vendors_upload_photos" on storage.objects
  with check (bucket_id = 'vendor-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.is_vendor())
              and (select public.my_photo_count()) < 300);
-- The documents bucket is not used by the app: no uploads until it is.
alter policy "vendors_upload_documents" on storage.objects with check (false);
-- Photos are still served to everyone through their public address; the list
-- of files is only visible to the vendor who owns the folder.
alter policy "public_view_photos" on storage.objects
  using (bucket_id = 'vendor-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter policy "vendor photos are public" on storage.objects
  using (bucket_id = 'vendor-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ── leftovers ────────────────────────────────────────────────────────────────
-- verify_codes has been unused since 23 Sep 2026: nobody can read or write it.
revoke all on public.verify_codes from anon, authenticated;

-- Trigger functions are not API endpoints.
revoke execute on function public.guard_booking_insert() from public, anon, authenticated;
revoke execute on function public.guard_message_write() from public, anon, authenticated;
revoke execute on function public.guard_photo_urls() from public, anon, authenticated;
revoke execute on function public.guard_review_insert() from public, anon, authenticated;
revoke execute on function public.guard_vendor_profile_insert() from public, anon, authenticated;

-- ── Insert times ─────────────────────────────────────────────────────────────
-- The per-account action caps count rows by created_at. A browser that wrote
-- an old created_at on its own inserts would never be counted. On every
-- capped table the insert time is now the database's clock (bookings,
-- reviews and messages already get it from their own guards above).
create or replace function public.stamp_created_now()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if public.is_privileged_context() then return new; end if;
  new.created_at := now();
  return new;
end $$;
revoke execute on function public.stamp_created_now() from public, anon, authenticated;

create or replace trigger trg_aa_stamp_created before insert on public.conversations   for each row execute function public.stamp_created_now();
create or replace trigger trg_aa_stamp_created before insert on public.event_recaps    for each row execute function public.stamp_created_now();
create or replace trigger trg_aa_stamp_created before insert on public.favorites       for each row execute function public.stamp_created_now();
create or replace trigger trg_aa_stamp_created before insert on public.inquiries       for each row execute function public.stamp_created_now();
create or replace trigger trg_aa_stamp_created before insert on public.vendor_photos   for each row execute function public.stamp_created_now();
create or replace trigger trg_aa_stamp_created before insert on public.vendor_services for each row execute function public.stamp_created_now();

-- ── H2 part 2, applied after the site switched to party_names() ─────────────
-- The people you deal with no longer read your whole profile row (email,
-- phone, date of birth). Your own row and admins are unchanged.
alter policy profiles_counterparty_select on public.profiles using (false);
