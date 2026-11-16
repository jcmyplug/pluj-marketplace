/* PLUJ — scan-uploads. Security item 13, 15 Nov 2026.
   Repo location: supabase/functions/scan-uploads/index.ts
   Deployed with verify_jwt = false: it is called by the scan-uploads cron job
   (sql/2026-11-15-upload-scan.sql), which proves itself with x-cron-secret,
   a secret generated inside the database and kept in Vault. The database
   checks that secret on every call (uploads_to_scan, record_upload_scan), so
   a stranger calling this URL gets 403 and learns nothing.

   WHAT IT CHECKS
   For each file in vendor-photos it has not seen yet, it reads the first 2 KB
   and keeps the file only if
     - the bytes start like a real JPEG, PNG or WebP picture, and
     - there is no web-page or script code in them (<script, <html, <svg,
       <iframe, <?php, javascript:).
   Anything else is deleted from storage and the admins get a notification.

   HONEST LIMITS
   This is a file-type check, not an antivirus. It stops the realistic abuse
   of a photo bucket (hosting a web page, a script or a program under a .jpg
   name). Matching files against known malware signatures needs an outside
   scanning service, which PLUJ does not use today. Photos uploaded through
   the website are also redrawn as new JPEGs in the browser first, which
   removes anything hidden inside them. */

const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "vendor-photos";

const SCRIPTY = [/<script/i, /<html/i, /<svg/i, /<iframe/i, /<\?php/i, /javascript:/i];

function sniff(b: Uint8Array): string | null {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47 &&
      b[4] === 0x0D && b[5] === 0x0A && b[6] === 0x1A && b[7] === 0x0A) return "image/png";
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

const auth = { apikey: SERVICE, Authorization: `Bearer ${SERVICE}` };

async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${SB_URL}/rest/v1/rpc/${fn}`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw Object.assign(new Error(`${fn} failed`), { status: r.status });
  return d;
}

const objectPath = (name: string) => name.split("/").map(encodeURIComponent).join("/");

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const secret = req.headers.get("x-cron-secret") ?? "";
  if (!secret || secret.length > 200 || !SB_URL || !SERVICE) return new Response("Forbidden", { status: 403 });

  let items: { id: string; name: string }[];
  try {
    items = await rpc("uploads_to_scan", { p_secret: secret, p_limit: 50 }) ?? [];
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  let ok = 0, removed = 0, skipped = 0;
  for (const it of items) {
    try {
      const r = await fetch(`${SB_URL}/storage/v1/object/authenticated/${BUCKET}/${objectPath(it.name)}`, {
        headers: { ...auth, Range: "bytes=0-2047" },
      });
      if (r.status === 404 || r.status === 400) {
        await rpc("record_upload_scan", { p_secret: secret, p_id: it.id, p_name: it.name, p_verdict: "error", p_reason: "missing" });
        continue;
      }
      if (!r.ok) { skipped++; continue; }                  /* try again next run */
      const head = new Uint8Array(await r.arrayBuffer()).slice(0, 2048);
      const type = sniff(head);
      const text = new TextDecoder("latin1").decode(head);
      const why = !type ? "not a JPEG, PNG or WebP picture"
                : SCRIPTY.some((re) => re.test(text)) ? "contains web page or script code"
                : null;
      if (why) {
        const d = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}`, {
          method: "DELETE",
          headers: { ...auth, "Content-Type": "application/json" },
          body: JSON.stringify({ prefixes: [it.name] }),
        });
        await rpc("record_upload_scan", { p_secret: secret, p_id: it.id, p_name: it.name,
                                          p_verdict: d.ok ? "removed" : "error", p_reason: why });
        if (d.ok) removed++; else skipped++;
      } else {
        await rpc("record_upload_scan", { p_secret: secret, p_id: it.id, p_name: it.name, p_verdict: "ok", p_reason: type });
        ok++;
      }
    } catch {
      skipped++;                                           /* try again next run */
    }
  }
  return Response.json({ scanned: items.length, ok, removed, skipped });
});
