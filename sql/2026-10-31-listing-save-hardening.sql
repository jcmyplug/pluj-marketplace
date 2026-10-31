/* 31 Oct 2026 — listing save hardening (migration "listing_save_hardening")

   "permission denied for function capacity_label" when saving a listing was
   fixed on 7 Oct (2026-10-07-listing-save-fix.sql granted it to signed-in
   users). One path still produced it: a vendor whose sign-in had expired was
   sent to the database as a signed-out visitor (anon), whose request reached
   the vendor_services triggers and failed there with that message.

   - capacity_label only formats two numbers as text, so any role may run it;
   - signed-out visitors can no longer write listings at all (they never could
     through RLS; now the request stops before the triggers), and the app tells
     the vendor their sign-in expired instead of showing a database error. */
grant execute on function public.capacity_label(integer, integer) to anon;
revoke insert, update, delete on public.vendor_services from anon;
