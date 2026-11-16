-- PLUJ upload scanning, 15 Nov 2026 (security item 13).
--
-- The website checks and redraws every photo before upload, but someone can
-- skip the website and talk to Supabase Storage directly. Every 10 minutes
-- the scan-uploads edge function (supabase/functions/scan-uploads) reads the
-- first bytes of each new file in vendor-photos and deletes any that is not a
-- real JPEG, PNG or WebP picture. The admins get a notification naming the
-- account.
--
-- The cron job and the edge function share a secret that is generated here,
-- inside the database, and kept in Vault. Nobody types or sees it.

create table if not exists public.upload_scans (
  object_id  uuid primary key,
  name       text not null,
  verdict    text not null check (verdict in ('ok','removed','error')),
  reason     text,
  scanned_at timestamptz not null default now()
);
alter table public.upload_scans enable row level security;
revoke all on public.upload_scans from anon, authenticated;

select vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'UPLOAD_SCAN_SECRET',
                           'Shared by the scan-uploads cron job and edge function (15 Nov 2026)')
 where not exists (select 1 from vault.secrets where name = 'UPLOAD_SCAN_SECRET');

create or replace function public.upload_scan_secret_ok(p_secret text)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select coalesce(p_secret is not null and p_secret = (
    select decrypted_secret from vault.decrypted_secrets where name = 'UPLOAD_SCAN_SECRET'), false);
$$;
revoke all on function public.upload_scan_secret_ok(text) from public, anon, authenticated;

create or replace function public.uploads_to_scan(p_secret text, p_limit integer default 50)
returns table(id uuid, name text)
language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.upload_scan_secret_ok(p_secret) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  return query
    select o.id, o.name from storage.objects o
     where o.bucket_id = 'vendor-photos'
       and not exists (select 1 from public.upload_scans s where s.object_id = o.id)
     order by o.created_at
     limit least(greatest(coalesce(p_limit, 50), 1), 200);
end $$;
revoke all on function public.uploads_to_scan(text, integer) from public, anon, authenticated;
grant execute on function public.uploads_to_scan(text, integer) to service_role;

create or replace function public.record_upload_scan(p_secret text, p_id uuid, p_name text,
                                                     p_verdict text, p_reason text)
returns void language plpgsql security definer
set search_path = public, pg_temp as $$
begin
  if not public.upload_scan_secret_ok(p_secret) then
    raise exception 'Forbidden' using errcode = '42501';
  end if;
  insert into public.upload_scans (object_id, name, verdict, reason)
  values (p_id, left(p_name, 500), p_verdict, left(p_reason, 300))
  on conflict (object_id) do update
     set verdict = excluded.verdict, reason = excluded.reason, scanned_at = now();

  if p_verdict = 'removed' then
    insert into public.notifications (user_id, type, title, body)
    select a.user_id, 'security', 'A suspicious upload was removed',
           'A file in the photo folder of account ' || split_part(p_name, '/', 1)
           || ' was not a real picture (' || left(coalesce(p_reason, 'unknown'), 120)
           || ') and was deleted automatically. Check that account in Admin.'
      from public.admin_users a;
  end if;
end $$;
revoke all on function public.record_upload_scan(text, uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_upload_scan(text, uuid, text, text, text) to service_role;

select cron.schedule('scan-uploads', '*/10 * * * *', $cron$
  select net.http_post(
    url     := 'https://btmqghudfakpbbplrqhf.supabase.co/functions/v1/scan-uploads',
    headers := jsonb_build_object('Content-Type', 'application/json',
                 'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'UPLOAD_SCAN_SECRET')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
$cron$);
