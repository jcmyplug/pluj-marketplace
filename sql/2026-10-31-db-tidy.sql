/* PLUJ — database tidy-up, 31 Oct 2026. Checklist items 11 and 39.
   Applied as migration "db_tidy_indexes_function_access".

   Nothing here changes what anyone can see or do on the site, except the one
   view in step 5, which stops showing signed-in users the legal names of
   vendors who are not published. Every step is checked by
   sql/tests/selftest.sql (select * from public.selftest_run() where not pass).
*/

/* 1. Foreign keys without an index (Supabase lint 0001). Postgres does not
      index the referencing side of a foreign key on its own, so deleting a
      profile or a booking had to scan these tables in full. Tiny today. */
create index if not exists booking_payment_plans_host_id_idx       on public.booking_payment_plans (host_id);
create index if not exists booking_payment_plans_vendor_id_idx     on public.booking_payment_plans (vendor_id);
create index if not exists booking_problems_reporter_id_idx        on public.booking_problems (reporter_id);
create index if not exists favorites_vendor_id_idx                 on public.favorites (vendor_id);
create index if not exists notifications_request_id_idx            on public.notifications (request_id);
create index if not exists payment_release_requests_booking_id_idx on public.payment_release_requests (booking_id);
create index if not exists payment_release_requests_vendor_id_idx  on public.payment_release_requests (vendor_id);
create index if not exists vendor_photos_vendor_id_idx             on public.vendor_photos (vendor_id);
create index if not exists verify_codes_user_id_idx                on public.verify_codes (user_id);

/* 2. Seven indexes existed twice (lint 0009), each created by a different
      setup script. Every write paid for both copies. The copy Postgres
      actually used (more scans in pg_stat_user_indexes) is the one kept. */
drop index if exists public.idx_booking_requests_status;   -- kept booking_requests_status_idx
drop index if exists public.favorites_user_idx;            -- kept idx_favorites_user_id
drop index if exists public.msg_conv_idx;                  -- kept messages_conv_idx
drop index if exists public.reviews_author_id_idx;         -- kept reviews_author_idx
drop index if exists public.vendor_avail_idx;              -- kept idx_vendor_availability_vendor
drop index if exists public.vendor_profiles_category_idx;  -- kept idx_vendor_profiles_category
drop index if exists public.vendor_profiles_status_idx;    -- kept idx_vendor_profiles_status

/* 3. Trigger functions are not something the website should be able to call
      through /rest/v1/rpc/. They fail when called that way, but they should
      not be reachable at all. Triggers keep firing: Postgres checks EXECUTE
      when a trigger is created, not each time it fires. */
revoke execute on function
  public.block_signup_while_private(), public.check_instant_book_listing(), public.enforce_booking_price(),
  public.enqueue_booking_emails(), public.guard_booking_confirmation(), public.guard_profile_self_insert(),
  public.guard_vendor_terms_flag(), public.normalise_service_subcategories(),
  public.notify_vendor_on_approval_decision(), public.notify_vendor_went_live(), public.require_vendor_legal_info()
  from public, anon, authenticated;

/* Two helpers nothing calls any more (no page, API route, policy, view or
      function refers to them). Kept, but no longer reachable from outside. */
revoke execute on function public.is_approved_vendor(uuid), public.peek_rate_limit(text, integer)
  from public, anon, authenticated;

/* 4. Pin search_path on the seven functions that did not have it (lint 0011).
      All seven are SECURITY INVOKER, so this was never exploitable; pinning
      them clears the warning and stops a future edit from making it real. */
alter function public.normalise_service_subcategories() set search_path = public, pg_temp;
alter function public.capacity_ceiling(text) set search_path = public, pg_temp;
alter function public.email_html_escape(text) set search_path = public, pg_temp;
alter function public.booking_email_view_status(text, boolean) set search_path = public, pg_temp;
alter function public.booking_email_subject(public.booking_requests, text, text, text, text) set search_path = public, pg_temp;
alter function public.booking_email_html(public.booking_requests, text, text, text, text) set search_path = public, pg_temp;
alter function public.booking_notice_email_html(public.booking_requests, text, text, text, text, text, text, text, text, text) set search_path = public, pg_temp;

/* 5. vendor_directory resolves vendor names for a host's bookings and
      messages. It returned every vendor's legal name to anyone signed in,
      including vendors whose profile is not published (missing legal
      information, or not yet approved). It now returns a row only when:
        - the vendor is public (the same rule as vendor_public), or
        - it is the caller's own profile, or
        - the caller has a booking, conversation or inquiry with them, or
        - the caller is an admin.
      security_barrier stops a crafted filter from being evaluated on the
      hidden rows before the rule above has removed them. */
create or replace view public.vendor_directory with (security_barrier = true) as
  select v.id, v.business_name, v.biz_legal
    from public.vendor_profiles v
   where (v.verification_status = 'approved' and cardinality(public.vendor_missing_items(v)) = 0)
      or v.id = (select auth.uid())
      or public.is_counterparty(v.id)
      or (select public.is_admin());
