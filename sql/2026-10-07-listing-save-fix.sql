/* Applied 7 Oct 2026 (migration "fix_listing_save_capacity_label_grant").

   Saving a listing failed with "permission denied for function
   capacity_label": the vendor_services trigger sync_capacity_text runs as
   the signed-in vendor and calls capacity_label, but EXECUTE had been
   limited to postgres and service_role. These helpers only format numbers
   and text, so signed-in users may run them. */
grant execute on function public.capacity_label(integer, integer)            to authenticated;
grant execute on function public.humanize_hours(numeric)                      to authenticated;
grant execute on function public.booking_response_deadline_hours(integer)     to authenticated;
grant execute on function public.suggested_response_deadline_hours(date)      to authenticated;
