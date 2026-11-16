-- PLUJ security hardening, 15 Nov 2026, item L5. Run once in the Supabase
-- SQL editor (Dashboard -> SQL Editor -> New query -> paste -> Run).
--
-- admin_delete_account refused to delete any account whose sign-up metadata
-- said role = admin. Anyone can write that metadata on their own account, so
-- it was a way to make an account the admins could not delete. Admin status
-- now comes from admin_users, which only PLUJ can change. Nothing else in the
-- function changes. (Not applied through the AI connector because the
-- function body contains DELETE statements, which that connector asks a
-- person to confirm.)
create or replace function public.admin_delete_account(target_id uuid)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.is_admin() then
    raise exception 'Only an admin can delete accounts';
  end if;
  if exists (select 1 from public.admin_users where user_id = target_id) then
    raise exception 'Admin accounts cannot be deleted here';
  end if;

  delete from public.reviews          where author_id = target_id or subject_id = target_id;
  delete from public.booking_requests where user_id   = target_id or vendor_id  = target_id;
  delete from auth.users              where id = target_id;   -- cascades the rest
end $$;
