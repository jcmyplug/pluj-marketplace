/* PLUJ payments: Stripe.
   >>> SECTION 12 (bottom of this file) REPLACES HOW MONEY MOVES. <<<
   Since the evening of 7 Oct 2026 every payment goes straight to the vendor's
   own Stripe account and PLUJ only collects its service fees; PLUJ no longer
   holds money, and sections 7 and 11 describe the earlier design.
   Applied to the live database on 7 Oct 2026 (migration "payments_core").
   Nothing here charges anyone until platform_settings.payments_enabled is
   'true' AND a Stripe key is configured for the edge functions.

   HOW MONEY MOVES
     The host pays PLUJ (one Stripe account, "separate charges and transfers").
     PLUJ holds every payment. It goes to the vendor's Stripe account (Stripe
     Connect Express), less Stripe's card fee and, once the vendor has been on
     PLUJ for 3 months, PLUJ's 1%, when the first of these happens:
       - the host taps "Release payment to vendor" (approve_payment_release)
       - the vendor asks for early release, e.g. the 30% deposit to buy
         supplies, and the host approves it (request_early_release /
         answer_release_request); that releases what has been paid so far
       - 3 days after the event, automatically, in case the host forgets
     A problem reported by the host stops all of it until an admin decides.

   THE SCHEDULE (platform_settings.payment_split, default 30,50,20)
     retainer   30%  host pays when the vendor confirms (Stripe Checkout;
                     the card is saved for the next two)
     event_day  50%  charged 8:00 AM Houston time on the event date
     final      20%  charged 12:00 PM Houston time the day after the event
     auto-release    12:00 PM Houston time, 3 days after the event

   WHO DOES WHAT
     booking trigger (this file)    creates the schedule when a vendor
                                    confirms; works out refunds on cancel
     edge function payments          host Checkout, vendor Stripe onboarding,
                                    admin release / refund
     edge function payments-scheduler  every 10 minutes: charges due
                                    payments, runs refunds, sends released
                                    money to vendors
     edge function stripe-webhook    Stripe's confirmations
     approve_payment_release()       host releases everything to the vendor
     request_early_release()         vendor asks the host for early release
     answer_release_request()        host approves or declines that request
     report_booking_problem()        host's "Report a problem": holds payout */

-- ── 1. Settings ─────────────────────────────────────────────────────────────
insert into public.platform_settings (key, value, is_public) values
  ('payment_split',                    '30,50,20', true),
  ('card_fees_paid_by',                'vendor',   true),   -- 'vendor' (taken from payout) or 'host' (added to the charge)
  ('platform_fee_intro_months',        '3',        true),   -- no PLUJ fee for a vendor's first 3 months
  ('platform_fee_after_intro_percent', '3',        true)    -- then PLUJ keeps 3% of each payment from the vendor (see migration payments_fees below)
on conflict (key) do nothing;
update public.platform_settings set is_public = true where key = 'payments_enabled';

-- ── 2. Stripe ids on accounts ───────────────────────────────────────────────
alter table public.vendor_profiles
  add column if not exists stripe_account_id        text unique,
  add column if not exists stripe_details_submitted boolean not null default false,
  add column if not exists stripe_transfers_enabled boolean not null default false,
  add column if not exists stripe_payouts_enabled   boolean not null default false,
  add column if not exists stripe_updated_at        timestamptz;
alter table public.profiles
  add column if not exists stripe_customer_id text unique;

/* Vendors can't touch their own payout settings or approval. */
create or replace function public.guard_vendor_profile_update()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if public.is_privileged_context() then return new; end if;
  if (new.verification_status, new.verified_at, new.rejection_reason)
     is distinct from (old.verification_status, old.verified_at, old.rejection_reason) then
    raise exception 'verification status is set by PLUJ, not the vendor';
  end if;
  if (new.stripe_account_id, new.stripe_details_submitted, new.stripe_transfers_enabled, new.stripe_payouts_enabled)
     is distinct from (old.stripe_account_id, old.stripe_details_submitted, old.stripe_transfers_enabled, old.stripe_payouts_enabled) then
    raise exception 'payout settings are managed by PLUJ and Stripe';
  end if;
  return new;
end $function$;

/* Same as 2026-10-07-vendor-signup-review.sql, plus stripe_customer_id. */
create or replace function public.guard_profile_self_update()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
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

  return new;
end $function$;

-- ── 3. Tables ───────────────────────────────────────────────────────────────
create table if not exists public.booking_payment_plans (
  booking_id        text primary key references public.booking_requests(id) on delete cascade,
  host_id           uuid not null references public.profiles(id) on delete cascade,
  vendor_id         uuid not null references public.profiles(id) on delete cascade,
  total_cents       integer not null check (total_cents >= 1000),
  currency          text not null default 'usd',
  card_fees_paid_by text not null default 'vendor' check (card_fees_paid_by in ('vendor','host')),
  release_at        timestamptz not null,           -- automatic release: noon Houston time, 3 days after the event
  host_approved_at  timestamptz,                    -- host tapped "Release payment to vendor": everything paid goes out
  status            text not null default 'active'
                    check (status in ('active','on_hold','cancelled','released')),
  refund_percent    numeric,                        -- set on cancellation: share of collected money returned
  refund_less_fees  boolean not null default false, -- "refunded in full, less payment processing fees"
  refund_state      text not null default 'none' check (refund_state in ('none','pending','done','failed')),
  cancelled_by      text,
  hold_reason       text,
  released_at       timestamptz,
  last_error        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists public.booking_payments (
  id                          uuid primary key default gen_random_uuid(),
  booking_id                  text not null references public.booking_payment_plans(booking_id) on delete cascade,
  kind                        text not null check (kind in ('retainer','event_day','final')),
  percent                     numeric not null,
  amount_cents                integer not null check (amount_cents >= 0),
  host_fee_cents              integer not null default 0,  -- card fee added to the host's charge when card_fees_paid_by = 'host'
  due_at                      timestamptz not null,
  status                      text not null default 'scheduled'
                              check (status in ('scheduled','processing','paid','failed','cancelled')),
  attempts                    integer not null default 0,
  next_attempt_at             timestamptz,
  last_error                  text,
  stripe_checkout_session_id  text,
  stripe_payment_intent_id    text unique,
  stripe_charge_id            text,
  stripe_fee_cents            integer,
  refunded_cents              integer not null default 0,
  platform_fee_cents          integer,
  transferred_cents           integer not null default 0,
  stripe_transfer_id          text,
  paid_at                     timestamptz,
  transferred_at              timestamptz,
  release_approved_at         timestamptz,   -- host approved an early release that covered this payment
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  unique (booking_id, kind)
);
create index if not exists booking_payments_due_idx on public.booking_payments (status, due_at);

create table if not exists public.booking_problems (
  id              uuid primary key default gen_random_uuid(),
  booking_id      text not null references public.booking_requests(id) on delete cascade,
  reporter_id     uuid not null references public.profiles(id) on delete cascade,
  kind            text not null check (kind in ('no_show','not_as_described','scam','other')),
  details         text not null,
  status          text not null default 'open'
                  check (status in ('open','released','refunded','partly_refunded','dismissed')),
  resolution_note text,
  resolved_by     uuid,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists booking_problems_open_idx on public.booking_problems (booking_id) where status = 'open';

/* A vendor asking the host to release money before the automatic date. */
create table if not exists public.payment_release_requests (
  id          uuid primary key default gen_random_uuid(),
  booking_id  text not null references public.booking_payment_plans(booking_id) on delete cascade,
  vendor_id   uuid not null references public.profiles(id) on delete cascade,
  note        text,
  status      text not null default 'pending' check (status in ('pending','approved','declined')),
  decided_at  timestamptz,
  created_at  timestamptz not null default now()
);

/* Every Stripe webhook event, so each is handled once. */
create table if not exists public.stripe_events (
  id          text primary key,
  type        text not null,
  received_at timestamptz not null default now(),
  payload     jsonb
);

alter table public.booking_payment_plans enable row level security;
alter table public.booking_payments      enable row level security;
alter table public.booking_problems      enable row level security;
alter table public.payment_release_requests enable row level security;
alter table public.stripe_events         enable row level security;

/* Read-only for the two parties and admins. Every write goes through the
   edge functions (service role) or the functions below. */
create policy booking_payment_plans_parties_read on public.booking_payment_plans
  for select using (auth.uid() = host_id or auth.uid() = vendor_id or public.is_admin());
create policy booking_payments_parties_read on public.booking_payments
  for select using (exists (select 1 from public.booking_payment_plans p
                             where p.booking_id = booking_payments.booking_id
                               and (auth.uid() = p.host_id or auth.uid() = p.vendor_id))
                    or public.is_admin());
create policy payment_release_requests_parties_read on public.payment_release_requests
  for select using (exists (select 1 from public.booking_payment_plans p
                             where p.booking_id = payment_release_requests.booking_id
                               and (auth.uid() = p.host_id or auth.uid() = p.vendor_id))
                    or public.is_admin());
create policy booking_problems_parties_read on public.booking_problems
  for select using (auth.uid() = reporter_id
                    or exists (select 1 from public.booking_requests b
                                where b.id = booking_problems.booking_id and b.vendor_id = auth.uid())
                    or public.is_admin());

-- ── 4. Helpers ──────────────────────────────────────────────────────────────
create or replace function public.payments_enabled()
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce((select value = 'true' from public.platform_settings where key = 'payments_enabled'), false);
$$;

/* Noon, Houston time, the day after the event ends: the final payment. */
create or replace function public.booking_final_charge_at(p_event_date date, p_end_date date)
returns timestamptz language sql immutable set search_path to 'public', 'pg_temp' as $$
  select case when p_event_date is null then null else
    ((coalesce(p_end_date, p_event_date) + 1)::text || ' 12:00')::timestamp at time zone 'America/Chicago' end;
$$;

/* Noon, Houston time, 3 days after the event ends: everything held is sent
   to the vendor automatically if the host hasn't released it already and no
   problem is open. */
create or replace function public.booking_release_at(p_event_date date, p_end_date date)
returns timestamptz language sql immutable set search_path to 'public', 'pg_temp' as $$
  select case when p_event_date is null then null else
    ((coalesce(p_end_date, p_event_date) + 3)::text || ' 12:00')::timestamp at time zone 'America/Chicago' end;
$$;

/* 8:00 AM Houston time on the event date. */
create or replace function public.booking_event_day_charge_at(p_event_date date)
returns timestamptz language sql immutable set search_path to 'public', 'pg_temp' as $$
  select case when p_event_date is null then null else
    (p_event_date::text || ' 08:00')::timestamp at time zone 'America/Chicago' end;
$$;

/* What the host pays on top when card fees are passed to them: enough that
   after Stripe's 2.9% + 30 cents the amount itself is left. */
create or replace function public.host_card_fee_cents(p_amount_cents integer)
returns integer language sql immutable set search_path to 'public', 'pg_temp' as $$
  select case when p_amount_cents <= 0 then 0
              else ceil((p_amount_cents + 30) / (1 - 0.029))::integer - p_amount_cents end;
$$;

-- ── 5. Booking triggers ─────────────────────────────────────────────────────
/* BEFORE UPDATE: with payments on, a vendor can only confirm a booking that
   has a date and a total price, and nobody but PLUJ can change the price once
   a payment schedule exists. */
create or replace function public.payments_guard_booking()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  confirming boolean := new.status = any (array['confirmed','accepted','approved'])
                        and not (old.status = any (array['confirmed','accepted','approved']));
begin
  if confirming and public.payments_enabled()
     and not exists (select 1 from public.booking_payment_plans where booking_id = new.id) then
    if new.event_date is null then
      raise exception 'This request has no event date, so it cannot be confirmed with payment. Ask the host to add the date.';
    end if;
    if coalesce(new.total_price, 0) < 10 then
      raise exception 'Enter the total price for this booking (at least $10) before confirming it.';
    end if;
    /* Set here rather than by an UPDATE in the AFTER trigger, which would
       re-fire the booking email and notification triggers. */
    new.payment_status := 'retainer_due';
  end if;

  if new.total_price is distinct from old.total_price
     and exists (select 1 from public.booking_payment_plans where booking_id = new.id)
     and not public.is_privileged_context() then
    raise exception 'The price of a booking with a payment schedule can''t be changed. Contact PLUJ.';
  end if;
  return new;
end $function$;

create trigger trg_payments_guard_booking
  before update on public.booking_requests
  for each row execute function public.payments_guard_booking();

/* AFTER UPDATE: create the schedule on confirmation; work out the refund on
   cancellation (the scheduler carries it out with Stripe). */
create or replace function public.payments_on_booking_change()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan        public.booking_payment_plans%rowtype;
  split       numeric[];
  total_c     integer;
  r_c integer; e_c integer; f_c integer;
  fees_by     text;
  rel_at      timestamptz;
  fin_at      timestamptz;
  ev_at       timestamptz;
  hrs         numeric;
  pct         numeric;
  less_fees   boolean := false;
  any_paid    boolean;
  vname       text;
  is_conf_new boolean := new.status = any (array['confirmed','accepted','approved']);
  is_conf_old boolean := old.status = any (array['confirmed','accepted','approved']);
begin
  select * into plan from public.booking_payment_plans where booking_id = new.id;

  -- Confirmed (first time, or again after the host changed details)
  if is_conf_new and not is_conf_old then
    rel_at := public.booking_release_at(new.event_date, new.end_date);
    fin_at := public.booking_final_charge_at(new.event_date, new.end_date);
    ev_at  := greatest(public.booking_event_day_charge_at(new.event_date), now());

    if plan.booking_id is null then
      if not public.payments_enabled() then return new; end if;

      select array_agg(x::numeric) into split
        from unnest(string_to_array(coalesce((select value from public.platform_settings where key = 'payment_split'), '30,50,20'), ',')) x;
      fees_by := coalesce((select value from public.platform_settings where key = 'card_fees_paid_by'), 'vendor');
      total_c := round(new.total_price * 100)::integer;
      r_c := round(total_c * split[1] / 100.0)::integer;
      e_c := round(total_c * split[2] / 100.0)::integer;
      f_c := total_c - r_c - e_c;

      insert into public.booking_payment_plans (booking_id, host_id, vendor_id, total_cents, card_fees_paid_by, release_at)
      values (new.id, new.user_id, new.vendor_id, total_c, fees_by, rel_at);

      insert into public.booking_payments (booking_id, kind, percent, amount_cents, host_fee_cents, due_at) values
        (new.id, 'retainer',  split[1], r_c, case when fees_by = 'host' then public.host_card_fee_cents(r_c) else 0 end, now()),
        (new.id, 'event_day', split[2], e_c, case when fees_by = 'host' then public.host_card_fee_cents(e_c) else 0 end, ev_at),
        (new.id, 'final',     split[3], f_c, case when fees_by = 'host' then public.host_card_fee_cents(f_c) else 0 end, fin_at);

      select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'Your vendor')
        into vname from public.vendor_profiles where id = new.vendor_id;
      insert into public.notifications (user_id, type, title, body, request_id)
      values (new.user_id, 'payment_due', '💳 Pay your retainer to secure ' || coalesce(vname, 'your vendor'),
              coalesce(vname, 'Your vendor') || ' confirmed. Pay the ' || split[1] || '% retainer ($'
                || to_char(r_c / 100.0, 'FM999,999,990.00') || ') to secure your date. PLUJ holds every payment until you release it, or 3 days after your event.',
              new.id);
    else
      -- Re-confirmed after a change: move the unpaid payments to the new dates.
      update public.booking_payment_plans
         set release_at = rel_at, status = case when status in ('cancelled','on_hold','released') then status else 'active' end, updated_at = now()
       where booking_id = new.id;
      update public.booking_payments set due_at = ev_at, updated_at = now()
       where booking_id = new.id and kind = 'event_day' and status in ('scheduled','failed');
      update public.booking_payments set due_at = fin_at, updated_at = now()
       where booking_id = new.id and kind = 'final' and status in ('scheduled','failed');
    end if;
    return new;
  end if;

  -- Cancelled or declined after a schedule existed
  if plan.booking_id is not null and plan.status <> 'cancelled'
     and new.status = any (array['cancelled','canceled','declined','rejected'])
     and not (old.status = any (array['cancelled','canceled','declined','rejected'])) then

    update public.booking_payments set status = 'cancelled', updated_at = now()
     where booking_id = new.id and status in ('scheduled','failed');

    if new.status = 'cancelled' and coalesce(new.cancelled_by, '') = 'customer' then
      -- Cancellations and refunds page: more than 4 days before, refunded in
      -- full less processing fees; 3-4 days 50%; 2 days 25%; under 48 hours none.
      hrs := extract(epoch from (public.booking_starts_at(new.event_date, new.start_time) - now())) / 3600.0;
      if hrs is null or hrs >= 96 then pct := 100; less_fees := true;
      elsif hrs >= 72 then pct := 50;
      elsif hrs >= 48 then pct := 25;
      else pct := 0;
      end if;
    else
      -- The vendor cancelled or declined, or PLUJ cancelled: everything back.
      pct := 100;
    end if;

    select exists (select 1 from public.booking_payments where booking_id = new.id and status = 'paid') into any_paid;

    update public.booking_payment_plans
       set status = 'cancelled', cancelled_by = coalesce(new.cancelled_by, new.status),
           refund_percent = pct, refund_less_fees = less_fees,
           refund_state = case when any_paid and pct > 0 then 'pending' else 'none' end,
           updated_at = now()
     where booking_id = new.id;
  end if;

  return new;
end $function$;

create trigger trg_payments_on_booking_change
  after update on public.booking_requests
  for each row execute function public.payments_on_booking_change();

-- ── 6. Host: report a problem ───────────────────────────────────────────────
create or replace function public.report_booking_problem(p_booking_id text, p_kind text, p_details text)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan  public.booking_payment_plans%rowtype;
  b     public.booking_requests%rowtype;
  pid   uuid;
  vname text;
  hname text;
  a     record;
begin
  select * into b from public.booking_requests where id = p_booking_id;
  if b.id is null or b.user_id is distinct from auth.uid() then
    raise exception 'Only the host of this booking can report a problem with it.';
  end if;
  select * into plan from public.booking_payment_plans where booking_id = p_booking_id;
  if plan.booking_id is null then
    raise exception 'There are no payments on this booking, so there is nothing for PLUJ to hold. Message the vendor, or contact PLUJ.';
  end if;
  if plan.status = 'released' then
    raise exception 'The vendor has already been paid for this booking. Contact PLUJ and we will look into it.';
  end if;
  if p_kind not in ('no_show','not_as_described','scam','other') then
    raise exception 'Choose what went wrong.';
  end if;
  if length(btrim(coalesce(p_details, ''))) < 10 then
    raise exception 'Tell us what happened (at least 10 characters).';
  end if;

  insert into public.booking_problems (booking_id, reporter_id, kind, details)
  values (p_booking_id, auth.uid(), p_kind, left(btrim(p_details), 2000))
  returning id into pid;

  update public.booking_payment_plans
     set status = case when status = 'cancelled' then status else 'on_hold' end,
         hold_reason = 'The host reported a problem', updated_at = now()
   where booking_id = p_booking_id;

  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'the vendor') into vname
    from public.vendor_profiles where id = b.vendor_id;
  select coalesce(nullif(display_name,''), nullif(full_name,''), 'The host') into hname
    from public.profiles where id = b.user_id;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (b.vendor_id, 'payment_hold', '⚠️ A problem was reported on a booking',
          hname || ' reported a problem with ' || coalesce(nullif(b.service_name,''), 'your booking')
            || '. PLUJ is holding the payment while we look into it. We may message you for details.',
          b.id);

  for a in
    select au.user_id, coalesce(nullif(btrim(p.email), ''), u.email) as email
      from public.admin_users au
      left join public.profiles p on p.id = au.user_id
      left join auth.users u on u.id = au.user_id
  loop
    insert into public.notifications (user_id, type, title, body, request_id)
    values (a.user_id, 'payment_problem', '🚩 Problem reported — payment on hold',
            hname || ' reported a problem with ' || vname || ' (booking ' || b.id || '). Review it in Admin → Payments.',
            b.id);
    if a.email like '%@%' then
      perform public.queue_email(a.email,
        'Problem reported — payment on hold: ' || vname,
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
        || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#FEF2F2;color:#B91C1C">Payment on hold</div>'
        || '<h2 style="margin:12px 0 6px;font-size:20px;color:#111">' || public.email_html_escape(hname) || ' reported a problem</h2>'
        || '<p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.6">Booking ' || public.email_html_escape(b.id)
        || ' with ' || public.email_html_escape(vname) || '. The vendor will not be paid until you release or refund it.</p>'
        || '<p style="margin:0 0 18px;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#111;font-size:14px;line-height:1.6;white-space:pre-wrap">'
        || public.email_html_escape(left(btrim(p_details), 2000)) || '</p>'
        || '<p style="margin:0"><a href="https://www.pluj.us/" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#FF5C28;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Open Admin → Payments</a></p>'
        || '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p></div>',
        'payment_problem', pid::text);
    end if;
  end loop;

  return pid;
end $function$;

revoke all on function public.report_booking_problem(text, text, text) from public, anon;
grant execute on function public.report_booking_problem(text, text, text) to authenticated;


-- ── 7. Releasing money to the vendor ────────────────────────────────────────
/* Host: send everything paid so far, and anything paid later, to the vendor. */
create or replace function public.approve_payment_release(p_booking_id text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan  public.booking_payment_plans%rowtype;
  hname text;
begin
  select * into plan from public.booking_payment_plans where booking_id = p_booking_id;
  if plan.booking_id is null or plan.host_id is distinct from auth.uid() then
    raise exception 'Only the host of this booking can release its payment.';
  end if;
  if exists (select 1 from public.booking_problems where booking_id = p_booking_id and status = 'open') then
    raise exception 'You reported a problem with this booking, so PLUJ is reviewing it. We will contact you before anything is released.';
  end if;
  if plan.status = 'cancelled' then
    raise exception 'This booking was cancelled. Any money owed to the vendor is sent automatically.';
  end if;
  if plan.host_approved_at is not null then return; end if;

  update public.booking_payment_plans set host_approved_at = now(), updated_at = now() where booking_id = p_booking_id;
  update public.payment_release_requests set status = 'approved', decided_at = now()
   where booking_id = p_booking_id and status = 'pending';

  select coalesce(nullif(display_name,''), nullif(full_name,''), 'The host') into hname
    from public.profiles where id = plan.host_id;
  insert into public.notifications (user_id, type, title, body, request_id)
  values (plan.vendor_id, 'payment_released', '💸 Payment released',
          hname || ' released the payment for this booking. It is on its way to your Stripe account; '
            || 'payments still to be charged go to you as soon as they are paid.',
          p_booking_id);
end $function$;

/* Vendor: ask the host to release what has been paid so far (for example
   the 30% deposit, to buy supplies before the event). */
create or replace function public.request_early_release(p_booking_id text, p_note text)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan  public.booking_payment_plans%rowtype;
  rid   uuid;
  held  integer;
  vname text;
begin
  select * into plan from public.booking_payment_plans where booking_id = p_booking_id;
  if plan.booking_id is null or plan.vendor_id is distinct from auth.uid() then
    raise exception 'Only the vendor on this booking can ask for early release.';
  end if;
  if plan.status <> 'active' or plan.host_approved_at is not null then
    raise exception 'This payment is already released or on hold, so there is nothing to ask for.';
  end if;
  select coalesce(sum(amount_cents - refunded_cents), 0) into held
    from public.booking_payments
   where booking_id = p_booking_id and status = 'paid' and release_approved_at is null and transferred_cents = 0;
  if held <= 0 then
    raise exception 'Nothing has been paid yet that could be released.';
  end if;
  if exists (select 1 from public.payment_release_requests where booking_id = p_booking_id and status = 'pending') then
    raise exception 'You already asked. The host has been notified.';
  end if;

  insert into public.payment_release_requests (booking_id, vendor_id, note)
  values (p_booking_id, auth.uid(), nullif(left(btrim(coalesce(p_note, '')), 500), ''))
  returning id into rid;

  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'Your vendor') into vname
    from public.vendor_profiles where id = plan.vendor_id;
  insert into public.notifications (user_id, type, title, body, request_id)
  values (plan.host_id, 'release_request', '💬 ' || vname || ' asked for early payment',
          vname || ' asked you to release the $' || to_char(held / 100.0, 'FM999,999,990.00')
            || ' paid so far, before the event' || coalesce(': "' || nullif(left(btrim(coalesce(p_note,'')), 140), '') || '"', '.')
            || ' Open My Requests to approve or decline. If you do nothing, PLUJ keeps holding it.',
          p_booking_id);
  return rid;
end $function$;

/* Host: approve or decline the vendor's early-release request. Approving
   releases what has been paid so far; later payments stay held. */
create or replace function public.answer_release_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  rq    public.payment_release_requests%rowtype;
  plan  public.booking_payment_plans%rowtype;
  hname text;
begin
  select * into rq from public.payment_release_requests where id = p_request_id;
  select * into plan from public.booking_payment_plans where booking_id = rq.booking_id;
  if rq.id is null or plan.host_id is distinct from auth.uid() then
    raise exception 'Only the host of this booking can answer this request.';
  end if;
  if rq.status <> 'pending' then return; end if;
  if p_approve and exists (select 1 from public.booking_problems where booking_id = rq.booking_id and status = 'open') then
    raise exception 'You reported a problem with this booking, so PLUJ is reviewing it before anything is released.';
  end if;

  update public.payment_release_requests
     set status = case when p_approve then 'approved' else 'declined' end, decided_at = now()
   where id = p_request_id;
  if p_approve then
    update public.booking_payments set release_approved_at = now(), updated_at = now()
     where booking_id = rq.booking_id and status = 'paid' and release_approved_at is null;
  end if;

  select coalesce(nullif(display_name,''), nullif(full_name,''), 'The host') into hname
    from public.profiles where id = plan.host_id;
  insert into public.notifications (user_id, type, title, body, request_id)
  values (plan.vendor_id, 'release_answer',
          case when p_approve then '💸 Early payment approved' else 'Early payment declined' end,
          case when p_approve
               then hname || ' approved your request. What has been paid so far is on its way to your Stripe account.'
               else hname || ' declined your request. PLUJ keeps holding the payment until the host releases it, or 3 days after the event.' end,
          rq.booking_id);
end $function$;

revoke all on function public.approve_payment_release(text)          from public, anon;
revoke all on function public.request_early_release(text, text)      from public, anon;
revoke all on function public.answer_release_request(uuid, boolean)  from public, anon;
grant execute on function public.approve_payment_release(text)         to authenticated;
grant execute on function public.request_early_release(text, text)     to authenticated;
grant execute on function public.answer_release_request(uuid, boolean) to authenticated;

-- ── 8. Secrets the edge functions read (service role only) ──────────────────
/* The scheduler is called by pg_cron with this shared secret. */
select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
                           'PAYMENTS_CRON_SECRET', 'Shared secret: pg_cron -> payments-scheduler edge function')
where not exists (select 1 from vault.secrets where name = 'PAYMENTS_CRON_SECRET');

create or replace function public.payments_cron_secret_ok(p_secret text)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select coalesce(p_secret, '') <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'PAYMENTS_CRON_SECRET' and decrypted_secret = p_secret);
$$;

/* Stripe's webhook signing secret: saved when an admin presses "Connect
   Stripe webhook" in Admin → Payments, so nobody has to copy it by hand. */
create or replace function public.stripe_webhook_secret()
returns text language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'STRIPE_WEBHOOK_SECRET' limit 1;
$$;

create or replace function public.save_stripe_webhook_secret(p_secret text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare sid uuid;
begin
  select id into sid from vault.secrets where name = 'STRIPE_WEBHOOK_SECRET';
  if sid is null then
    perform vault.create_secret(p_secret, 'STRIPE_WEBHOOK_SECRET', 'Stripe webhook signing secret (stripe-webhook edge function)');
  else
    perform vault.update_secret(sid, p_secret);
  end if;
end $function$;

revoke all on function public.payments_cron_secret_ok(text)        from public, anon, authenticated;
revoke all on function public.stripe_webhook_secret()               from public, anon, authenticated;
revoke all on function public.save_stripe_webhook_secret(text)      from public, anon, authenticated;
grant execute on function public.payments_cron_secret_ok(text)      to service_role;
grant execute on function public.stripe_webhook_secret()            to service_role;
grant execute on function public.save_stripe_webhook_secret(text)   to service_role;
revoke all on function public.payments_guard_booking()              from public, anon, authenticated;
revoke all on function public.payments_on_booking_change()          from public, anon, authenticated;

-- ── 9. Fees (migration "payments_fees", applied the same day) ───────────────
/* Nothing for now. After an account has been on PLUJ for 3 months, PLUJ
   keeps 3% of each payment from the vendor's payout and adds a 1% service
   fee to the host's payment, each counted from that person's own sign-up.
   Card fees are paid by the vendor by default (card_fees_paid_by). */
update public.platform_settings set value = '3' where key = 'platform_fee_after_intro_percent';
insert into public.platform_settings (key, value, is_public) values
  ('host_service_fee_intro_months',        '3', true),
  ('host_service_fee_after_intro_percent', '1', true)
on conflict (key) do nothing;
alter table public.booking_payments
  add column if not exists host_service_fee_cents integer not null default 0;

-- ── 10. Scheduler (migration "payments_scheduler_cron") ─────────────────────
/* Every 10 minutes, call the payments-scheduler edge function, but only if
   some payment plan still has work in it. */
select cron.schedule('payments-scheduler', '*/10 * * * *', $cron$
  select net.http_post(
    url     := 'https://btmqghudfakpbbplrqhf.supabase.co/functions/v1/payments-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'PAYMENTS_CRON_SECRET')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.booking_payment_plans
                 where status <> 'released' and not (status = 'cancelled' and refund_state in ('none','done')
                       and not exists (select 1 from public.booking_payments bp
                                        where bp.booking_id = booking_payment_plans.booking_id
                                          and bp.status = 'paid' and bp.transferred_at is null)));
$cron$);

-- ── 11. Cost recovery (migration "payments_cost_recovery") ─────────────────
/* PLUJ never pays Stripe out of pocket (7 Oct 2026). Every Stripe cost is
   recovered from the vendor's payouts:
     - card fee of each charge (already), including when a charge is fully refunded
     - payout costs: payout_cost_percent (0.5%) + payout_cost_fixed_cents (25¢) per transfer
     - Stripe's $2 per vendor per month with payouts (payout_account_fee_cents, first payout each month)
     - Stripe's 1099 tax forms (tax_form_fee_cents, first payout each calendar year)
     - chargebacks: the $15 fee (dispute_fee_cents) and any disputed amount already paid out
   Anything that can't be taken from the payment it belongs to becomes
   vendor_profiles.pluj_balance_due_cents and comes out of the next payout. */
insert into public.platform_settings (key, value, is_public) values
  ('payout_cost_percent',       '0.5', true),
  ('payout_cost_fixed_cents',   '25',  true),
  ('payout_account_fee_cents',  '200', true),
  ('tax_form_fee_cents',        '750', true),
  ('dispute_fee_cents',         '1500', true)
on conflict (key) do nothing;

alter table public.vendor_profiles
  add column if not exists pluj_balance_due_cents integer not null default 0,
  add column if not exists stripe_fee_month text,     -- 'YYYY-MM' the monthly account fee was last recovered
  add column if not exists stripe_fee_year  integer;  -- year the tax-form fee was last recovered

alter table public.booking_payments
  add column if not exists payout_costs_cents integer not null default 0,
  add column if not exists disputed_cents     integer not null default 0;

create or replace function public.guard_vendor_profile_update()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if public.is_privileged_context() then return new; end if;
  if (new.verification_status, new.verified_at, new.rejection_reason)
     is distinct from (old.verification_status, old.verified_at, old.rejection_reason) then
    raise exception 'verification status is set by PLUJ, not the vendor';
  end if;
  if (new.stripe_account_id, new.stripe_details_submitted, new.stripe_transfers_enabled, new.stripe_payouts_enabled,
      new.pluj_balance_due_cents, new.stripe_fee_month, new.stripe_fee_year)
     is distinct from (old.stripe_account_id, old.stripe_details_submitted, old.stripe_transfers_enabled, old.stripe_payouts_enabled,
      old.pluj_balance_due_cents, old.stripe_fee_month, old.stripe_fee_year) then
    raise exception 'payout settings are managed by PLUJ and Stripe';
  end if;
  return new;
end $function$;

-- ── 12. Direct charges (migration "payments_direct_charges") ───────────────
/* Payments go straight to the vendor's own Stripe account (7 Oct 2026,
   evening; migration "payments_direct_charges"). This replaces "PLUJ holds
   every payment" and the cost recovery in section 11.

   Each payment is a direct charge on the vendor's Stripe account. Vendor
   accounts are created with Stripe liable for their losses and the vendor
   paying Stripe's fees, so refunds, chargebacks and negative balances are
   between the host, the vendor and Stripe. PLUJ's service fees (3% from the
   vendor and 1% from the host, after each one's first 3 months) come to PLUJ
   as Stripe application fees, which Stripe doesn't take back on refunds.

   Hosts are protected by when they are charged, not by PLUJ holding money:
     retainer   30%  when the vendor confirms
     event_day  50%  8:00 AM Houston time on the event date
     final      20%  when the host approves it after the event, or
                     automatically at noon 3 days after the event
   A problem report (or a chargeback) pauses every payment still to come
   until an admin resumes or cancels it.

   Left unused from earlier sections (dropping is avoided here): the transfer
   and vendor-debt columns, payment_release_requests, and the cost-recovery
   settings. */

-- New Stripe ids
alter table public.vendor_profiles
  add column if not exists stripe_charges_enabled boolean not null default false;
alter table public.booking_payment_plans
  add column if not exists stripe_account_id  text,   -- the vendor account the host's card is saved on
  add column if not exists stripe_customer_id text;   -- the host, as a customer on that account
alter table public.booking_payments
  add column if not exists stripe_account_id text;    -- the vendor account this payment was charged on

create or replace function public.guard_vendor_profile_update()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  if public.is_privileged_context() then return new; end if;
  if (new.verification_status, new.verified_at, new.rejection_reason)
     is distinct from (old.verification_status, old.verified_at, old.rejection_reason) then
    raise exception 'verification status is set by PLUJ, not the vendor';
  end if;
  if (new.stripe_account_id, new.stripe_details_submitted, new.stripe_transfers_enabled, new.stripe_payouts_enabled,
      new.stripe_charges_enabled, new.pluj_balance_due_cents, new.stripe_fee_month, new.stripe_fee_year)
     is distinct from (old.stripe_account_id, old.stripe_details_submitted, old.stripe_transfers_enabled, old.stripe_payouts_enabled,
      old.stripe_charges_enabled, old.pluj_balance_due_cents, old.stripe_fee_month, old.stripe_fee_year) then
    raise exception 'payment settings are managed by PLUJ and Stripe';
  end if;
  return new;
end $function$;

/* BEFORE UPDATE: with payments on, a vendor can only confirm a booking that
   has a date and a total price, once their Stripe account can take
   payments; nobody but PLUJ can change the price once a schedule exists. */
create or replace function public.payments_guard_booking()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  confirming boolean := new.status = any (array['confirmed','accepted','approved'])
                        and not (old.status = any (array['confirmed','accepted','approved']));
begin
  if confirming and public.payments_enabled()
     and not exists (select 1 from public.booking_payment_plans where booking_id = new.id) then
    if new.event_date is null then
      raise exception 'This request has no event date, so it cannot be confirmed with payment. Ask the host to add the date.';
    end if;
    if coalesce(new.total_price, 0) < 10 then
      raise exception 'Enter the total price for this booking (at least $10) before confirming it.';
    end if;
    if not public.is_privileged_context()
       and not coalesce((select stripe_charges_enabled from public.vendor_profiles where id = new.vendor_id), false) then
      raise exception 'Set up payments with Stripe (in your dashboard) before confirming bookings. Hosts pay you straight into your Stripe account.';
    end if;
    /* Set here rather than by an UPDATE in the AFTER trigger, which would
       re-fire the booking email and notification triggers. */
    new.payment_status := 'retainer_due';
  end if;

  if new.total_price is distinct from old.total_price
     and exists (select 1 from public.booking_payment_plans where booking_id = new.id)
     and not public.is_privileged_context() then
    raise exception 'The price of a booking with a payment schedule can''t be changed. Contact PLUJ.';
  end if;
  return new;
end $function$;

/* AFTER UPDATE: create the schedule on confirmation; work out the refund on
   cancellation (the scheduler carries it out, from the vendor's account). */
create or replace function public.payments_on_booking_change()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan        public.booking_payment_plans%rowtype;
  split       numeric[];
  total_c     integer;
  r_c integer; e_c integer; f_c integer;
  fees_by     text;
  fin_at      timestamptz;
  ev_at       timestamptz;
  hrs         numeric;
  pct         numeric;
  less_fees   boolean := false;
  any_paid    boolean;
  vname       text;
  is_conf_new boolean := new.status = any (array['confirmed','accepted','approved']);
  is_conf_old boolean := old.status = any (array['confirmed','accepted','approved']);
begin
  select * into plan from public.booking_payment_plans where booking_id = new.id;

  -- Confirmed (first time, or again after the host changed details)
  if is_conf_new and not is_conf_old then
    -- The final payment: automatically 3 days after the event, sooner if the host approves it.
    fin_at := public.booking_release_at(new.event_date, new.end_date);
    ev_at  := greatest(public.booking_event_day_charge_at(new.event_date), now());

    if plan.booking_id is null then
      if not public.payments_enabled() then return new; end if;

      select array_agg(x::numeric) into split
        from unnest(string_to_array(coalesce((select value from public.platform_settings where key = 'payment_split'), '30,50,20'), ',')) x;
      fees_by := coalesce((select value from public.platform_settings where key = 'card_fees_paid_by'), 'vendor');
      total_c := round(new.total_price * 100)::integer;
      r_c := round(total_c * split[1] / 100.0)::integer;
      e_c := round(total_c * split[2] / 100.0)::integer;
      f_c := total_c - r_c - e_c;

      insert into public.booking_payment_plans (booking_id, host_id, vendor_id, total_cents, card_fees_paid_by, release_at)
      values (new.id, new.user_id, new.vendor_id, total_c, fees_by, fin_at);

      insert into public.booking_payments (booking_id, kind, percent, amount_cents, host_fee_cents, due_at) values
        (new.id, 'retainer',  split[1], r_c, case when fees_by = 'host' then public.host_card_fee_cents(r_c) else 0 end, now()),
        (new.id, 'event_day', split[2], e_c, case when fees_by = 'host' then public.host_card_fee_cents(e_c) else 0 end, ev_at),
        (new.id, 'final',     split[3], f_c, case when fees_by = 'host' then public.host_card_fee_cents(f_c) else 0 end, fin_at);

      select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'Your vendor')
        into vname from public.vendor_profiles where id = new.vendor_id;
      insert into public.notifications (user_id, type, title, body, request_id)
      values (new.user_id, 'payment_due', '💳 Pay your retainer to secure ' || coalesce(vname, 'your vendor'),
              coalesce(vname, 'Your vendor') || ' confirmed. Pay the ' || split[1] || '% retainer ($'
                || to_char(r_c / 100.0, 'FM999,999,990.00') || ') to secure your date. You pay '
                || split[2] || '% on the event morning and the last ' || split[3]
                || '% only after the event, when you approve it (or 3 days after). Report a problem and the rest is paused.',
              new.id);
    else
      -- Re-confirmed after a change: move the unpaid payments to the new dates.
      update public.booking_payment_plans
         set release_at = fin_at, status = case when status in ('cancelled','on_hold','released') then status else 'active' end, updated_at = now()
       where booking_id = new.id;
      update public.booking_payments set due_at = ev_at, updated_at = now()
       where booking_id = new.id and kind = 'event_day' and status in ('scheduled','failed');
      update public.booking_payments set due_at = case when plan.host_approved_at is not null then now() else fin_at end, updated_at = now()
       where booking_id = new.id and kind = 'final' and status in ('scheduled','failed');
    end if;
    return new;
  end if;

  -- Cancelled or declined after a schedule existed
  if plan.booking_id is not null and plan.status <> 'cancelled'
     and new.status = any (array['cancelled','canceled','declined','rejected'])
     and not (old.status = any (array['cancelled','canceled','declined','rejected'])) then

    update public.booking_payments set status = 'cancelled', updated_at = now()
     where booking_id = new.id and status in ('scheduled','failed');

    if new.status = 'cancelled' and coalesce(new.cancelled_by, '') = 'customer' then
      -- Cancellations and refunds page: more than 4 days before, refunded in
      -- full less processing and service fees; 3-4 days 50%; 2 days 25%; under 48 hours none.
      hrs := extract(epoch from (public.booking_starts_at(new.event_date, new.start_time) - now())) / 3600.0;
      if hrs is null or hrs >= 96 then pct := 100; less_fees := true;
      elsif hrs >= 72 then pct := 50;
      elsif hrs >= 48 then pct := 25;
      else pct := 0;
      end if;
    else
      -- The vendor cancelled or declined, or PLUJ cancelled: everything back
      -- to the host, from the vendor's Stripe account.
      pct := 100;
    end if;

    select exists (select 1 from public.booking_payments where booking_id = new.id and status = 'paid') into any_paid;

    update public.booking_payment_plans
       set status = 'cancelled', cancelled_by = coalesce(new.cancelled_by, new.status),
           refund_percent = pct, refund_less_fees = less_fees,
           refund_state = case when any_paid and pct > 0 then 'pending' else 'none' end,
           updated_at = now()
     where booking_id = new.id;
  end if;

  return new;
end $function$;

/* Host: "Report a problem" pauses every payment still to come. */
create or replace function public.report_booking_problem(p_booking_id text, p_kind text, p_details text)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan  public.booking_payment_plans%rowtype;
  b     public.booking_requests%rowtype;
  pid   uuid;
  vname text;
  hname text;
  a     record;
begin
  select * into b from public.booking_requests where id = p_booking_id;
  if b.id is null or b.user_id is distinct from auth.uid() then
    raise exception 'Only the host of this booking can report a problem with it.';
  end if;
  select * into plan from public.booking_payment_plans where booking_id = p_booking_id;
  if plan.booking_id is null then
    raise exception 'There are no payments on this booking. Message the vendor, or contact PLUJ.';
  end if;
  if plan.status = 'released' then
    raise exception 'Every payment on this booking has already been made to the vendor. Message the vendor first; if that doesn''t settle it, your card issuer can help, and you can contact PLUJ.';
  end if;
  if p_kind not in ('no_show','not_as_described','scam','other') then
    raise exception 'Choose what went wrong.';
  end if;
  if length(btrim(coalesce(p_details, ''))) < 10 then
    raise exception 'Tell us what happened (at least 10 characters).';
  end if;

  insert into public.booking_problems (booking_id, reporter_id, kind, details)
  values (p_booking_id, auth.uid(), p_kind, left(btrim(p_details), 2000))
  returning id into pid;

  update public.booking_payment_plans
     set status = case when status = 'cancelled' then status else 'on_hold' end,
         hold_reason = 'The host reported a problem', updated_at = now()
   where booking_id = p_booking_id;

  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'the vendor') into vname
    from public.vendor_profiles where id = b.vendor_id;
  select coalesce(nullif(display_name,''), nullif(full_name,''), 'The host') into hname
    from public.profiles where id = b.user_id;

  insert into public.notifications (user_id, type, title, body, request_id)
  values (b.vendor_id, 'payment_hold', '⚠️ A problem was reported on a booking',
          hname || ' reported a problem with ' || coalesce(nullif(b.service_name,''), 'your booking')
            || '. Payments still to be charged are paused while PLUJ looks into it. We may message you for details.',
          b.id);

  for a in
    select au.user_id, coalesce(nullif(btrim(p.email), ''), u.email) as email
      from public.admin_users au
      left join public.profiles p on p.id = au.user_id
      left join auth.users u on u.id = au.user_id
  loop
    insert into public.notifications (user_id, type, title, body, request_id)
    values (a.user_id, 'payment_problem', '🚩 Problem reported — payments paused',
            hname || ' reported a problem with ' || vname || ' (booking ' || b.id || '). Review it in Admin → Payments.',
            b.id);
    if a.email like '%@%' then
      perform public.queue_email(a.email,
        'Problem reported — payments paused: ' || vname,
        '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;max-width:540px;margin:0 auto;padding:24px">'
        || '<div style="display:inline-block;padding:5px 12px;border-radius:99px;font-size:12px;font-weight:700;background:#FEF2F2;color:#B91C1C">Payments paused</div>'
        || '<h2 style="margin:12px 0 6px;font-size:20px;color:#111">' || public.email_html_escape(hname) || ' reported a problem</h2>'
        || '<p style="margin:0 0 12px;color:#555;font-size:14px;line-height:1.6">Booking ' || public.email_html_escape(b.id)
        || ' with ' || public.email_html_escape(vname) || '. No more payments are charged until you resume or cancel it.</p>'
        || '<p style="margin:0 0 18px;padding:12px 14px;background:#F9FAFB;border-radius:10px;color:#111;font-size:14px;line-height:1.6;white-space:pre-wrap">'
        || public.email_html_escape(left(btrim(p_details), 2000)) || '</p>'
        || '<p style="margin:0"><a href="https://www.pluj.us/" style="display:inline-block;padding:12px 22px;border-radius:999px;background:#FF5C28;color:#fff;font-weight:700;font-size:14px;text-decoration:none">Open Admin → Payments</a></p>'
        || '<p style="margin:22px 0 0;color:#999;font-size:12px">Sent by PLUJ · pluj.us</p></div>',
        'payment_problem', pid::text);
    end if;
  end loop;

  return pid;
end $function$;

/* Host: approve the final payment after the event; it is charged within
   about 10 minutes instead of 3 days after the event. */
create or replace function public.approve_payment_release(p_booking_id text)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  plan  public.booking_payment_plans%rowtype;
  hname text;
begin
  select * into plan from public.booking_payment_plans where booking_id = p_booking_id;
  if plan.booking_id is null or plan.host_id is distinct from auth.uid() then
    raise exception 'Only the host of this booking can approve its final payment.';
  end if;
  if exists (select 1 from public.booking_problems where booking_id = p_booking_id and status = 'open') then
    raise exception 'You reported a problem with this booking, so PLUJ is reviewing it. Payments stay paused until then.';
  end if;
  if plan.status = 'cancelled' then
    raise exception 'This booking was cancelled.';
  end if;
  if plan.host_approved_at is not null then return; end if;

  update public.booking_payment_plans set host_approved_at = now(), updated_at = now() where booking_id = p_booking_id;
  update public.booking_payments set due_at = now(), updated_at = now()
   where booking_id = p_booking_id and kind = 'final' and status in ('scheduled','failed') and due_at > now();

  select coalesce(nullif(display_name,''), nullif(full_name,''), 'The host') into hname
    from public.profiles where id = plan.host_id;
  insert into public.notifications (user_id, type, title, body, request_id)
  values (plan.vendor_id, 'payment_released', '👍 Final payment approved',
          hname || ' approved the final payment for this booking. It is charged within a few minutes, straight to your Stripe account.',
          p_booking_id);
end $function$;

/* Early release no longer applies: every payment goes straight to the vendor. */
create or replace function public.request_early_release(p_booking_id text, p_note text)
returns uuid language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  raise exception 'Payments go straight to your Stripe account when they are made, so there is nothing to release early.';
end $function$;

create or replace function public.answer_release_request(p_request_id uuid, p_approve boolean)
returns void language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  update public.payment_release_requests set status = 'declined', decided_at = now()
   where id = p_request_id and status = 'pending';
end $function$;

/* Scheduler: only when there is something to charge or refund. */
select cron.schedule('payments-scheduler', '*/10 * * * *', $cron$
  select net.http_post(
    url     := 'https://btmqghudfakpbbplrqhf.supabase.co/functions/v1/payments-scheduler',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'PAYMENTS_CRON_SECRET')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 60000)
  where exists (select 1 from public.booking_payment_plans
                 where status = 'active' or refund_state = 'pending');
$cron$);
