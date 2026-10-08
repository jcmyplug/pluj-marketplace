/* 8 Oct 2026 — credited event recaps (migration "event_recaps")

   A vendor posts a past event (photos, the occasion, a short story) and
   credits the other PLUJ pros who worked it. Each recap shows on the
   vendor's profile and on its own page, with every credited pro linked, so a
   good event sends hosts to everyone who made it happen. Credited pros are
   told. Only approved vendors' recaps are public; an admin can hide one. */

create table if not exists public.event_recaps (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references public.vendor_profiles(id) on delete cascade,
  title       text not null check (char_length(btrim(title)) between 3 and 120),
  occasion    text,
  event_date  date,
  city        text,
  story       text check (story is null or char_length(story) <= 2000),
  photos      jsonb not null default '[]'::jsonb check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) between 1 and 12),
  credited    uuid[] not null default '{}'::uuid[] check (cardinality(credited) <= 20),
  status      text not null default 'published' check (status in ('published', 'hidden')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists event_recaps_vendor on public.event_recaps (vendor_id, created_at desc);
create index if not exists event_recaps_credited on public.event_recaps using gin (credited);

alter table public.event_recaps enable row level security;

create policy event_recaps_public_read on public.event_recaps for select using (
  (status = 'published' and exists (select 1 from public.vendor_public v where v.id = event_recaps.vendor_id))
  or vendor_id = auth.uid() or is_admin());
create policy event_recaps_own_insert on public.event_recaps for insert with check (vendor_id = auth.uid() and is_active());
create policy event_recaps_own_update on public.event_recaps for update using (vendor_id = auth.uid()) with check (vendor_id = auth.uid());
create policy event_recaps_own_delete on public.event_recaps for delete using (vendor_id = auth.uid());
create policy event_recaps_admin_all on public.event_recaps for all using (is_admin()) with check (is_admin());

create or replace function public.guard_event_recap()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
begin
  new.updated_at := now();
  -- A vendor can't hide or un-hide through status; only an admin can.
  if not public.is_privileged_context() then
    if TG_OP = 'INSERT' then new.status := 'published';
    else new.status := old.status; end if;
  end if;
  -- Credits: approved vendors only, never yourself, no repeats.
  new.credited := coalesce((select array_agg(distinct c) from unnest(new.credited) c
                             join public.vendor_profiles v on v.id = c and v.verification_status = 'approved'
                            where c <> new.vendor_id), '{}'::uuid[]);
  -- Photos must be https links (uploaded to PLUJ storage by the dashboard).
  if exists (select 1 from jsonb_array_elements_text(new.photos) p where p !~* '^https://') then
    raise exception 'Photos must be uploaded images.';
  end if;
  return new;
end $function$;

create trigger trg_guard_event_recap
  before insert or update on public.event_recaps
  for each row execute function public.guard_event_recap();

create or replace function public.notify_event_recap_credits()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  c uuid;
  author text;
begin
  select coalesce(nullif(business_name,''), nullif(biz_legal,''), 'A PLUJ pro') into author
    from public.vendor_profiles where id = new.vendor_id;
  for c in select unnest(new.credited) except select unnest(case when TG_OP = 'UPDATE' then old.credited else '{}'::uuid[] end) loop
    insert into public.notifications (user_id, type, title, body)
    values (c, 'recap_credit', '📸 ' || author || ' credited you',
            author || ' posted "' || new.title || '" and credited you as one of the pros who worked it. It now links to your profile.');
  end loop;
  return new;
exception when others then
  raise warning '[notify_event_recap_credits] %', sqlerrm;
  return new;
end $function$;

create trigger trg_notify_event_recap_credits
  after insert or update of credited on public.event_recaps
  for each row execute function public.notify_event_recap_credits();

grant select on public.event_recaps to anon, authenticated;
grant insert, update, delete on public.event_recaps to authenticated;

/* Follow-up (migration "policies_no_admin_fn_for_anon"): anon can't execute
   is_admin(), so a public-read policy that calls it fails for signed-out
   visitors. Public reads leave it out; admin access is its own policy for
   authenticated users. Also fixes reviews_public_select from
   2026-10-08-blind-reviews-checks-languages.sql. */
alter policy reviews_public_select on public.reviews using (
  revealed_at is not null or created_at < now() - interval '14 days' or author_id = auth.uid());
alter policy event_recaps_public_read on public.event_recaps to anon, authenticated using (
  (status = 'published' and exists (select 1 from public.vendor_public v where v.id = event_recaps.vendor_id))
  or vendor_id = auth.uid());
alter policy event_recaps_own_insert on public.event_recaps to authenticated;
alter policy event_recaps_own_update on public.event_recaps to authenticated;
alter policy event_recaps_own_delete on public.event_recaps to authenticated;
alter policy event_recaps_admin_all  on public.event_recaps to authenticated;

/* Trigger functions are not API endpoints (migration "revoke_new_trigger_fns"). */
revoke execute on function public.enforce_booking_addons(), public.guard_event_recap(), public.guard_vendor_checks(),
  public.notify_event_recap_credits(), public.replacement_followup() from public, anon, authenticated;
