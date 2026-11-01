/* PLUJ — security rules evaluate the signed-in user once per query, not once
   per row. 31 Oct 2026. Checklist item 23. Applied as migration
   "rls_initplan_select_wrappers".

   WHAT CHANGES
   45 row-level security rules called auth.uid() (and is_admin()/is_active())
   bare. Postgres cannot assume a bare function call gives the same answer for
   every row, so it re-ran it for each row it looked at: harmless with four
   listings, a real cost with forty thousand messages. Written as
   (select auth.uid()) the call becomes an "initplan": run once, remembered for
   the rest of the query. Supabase lint 0003 and their RLS performance guide.

   WHAT DOES NOT CHANGE
   Who can see or change what. auth.uid(), is_admin() and is_active() take no
   row as input, so asking once per query gives the same answer as asking per
   row. The rewrite is mechanical: the rule text is read back from pg_policies
   and every bare call is wrapped; nothing else in the rule is touched. The
   self-test (sql/tests/selftest.sql) checks visibility for a visitor, a
   stranger, a vendor, a host and an admin before and after, and checks that no
   bare call is left ("security rules that re-check the user on every row").

   Only rules in the public schema. Storage rules belong to Supabase's storage
   role and are left as they are.
*/
do $$
declare
  p record; nq text; nw text; stmt text;
begin
  for p in
    select tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (coalesce(qual, '')       ~ '(?<!SELECT )auth\.uid\(\)'
         or coalesce(with_check, '') ~ '(?<!SELECT )auth\.uid\(\)')
  loop
    nq := p.qual; nw := p.with_check;
    if nq is not null then
      nq := regexp_replace(nq, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
      nq := regexp_replace(nq, '(?<![a-z_.])is_admin\(\)', '(select public.is_admin())', 'g');
      nq := regexp_replace(nq, '(?<![a-z_.])is_active\(\)', '(select public.is_active())', 'g');
    end if;
    if nw is not null then
      nw := regexp_replace(nw, '(?<!SELECT )auth\.uid\(\)', '(select auth.uid())', 'g');
      nw := regexp_replace(nw, '(?<![a-z_.])is_admin\(\)', '(select public.is_admin())', 'g');
      nw := regexp_replace(nw, '(?<![a-z_.])is_active\(\)', '(select public.is_active())', 'g');
    end if;
    stmt := format('alter policy %I on public.%I', p.policyname, p.tablename)
         || case when nq is not null then ' using (' || nq || ')' else '' end
         || case when nw is not null then ' with check (' || nw || ')' else '' end;
    execute stmt;
  end loop;
end $$;
