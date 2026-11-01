# PLUJ — environment variables and secrets

Checklist item 27. Written 31 October 2026 from the code itself (every
`process.env.*` and `Deno.env.get(*)` in the repository, plus the database's
Vault and settings table). If you add a variable, add it here in the same
commit.

There are five places a setting can live. The first question for any new one
is **"is it a secret?"** — anything in group A ends up inside the JavaScript
every visitor downloads, so it can never be a secret there.

---

## A. Vercel, baked into the website at build time (public)

Set in Vercel → Project → Settings → Environment Variables. Read by
`vite.config.mjs`, which copies them into the bundle. Changing one needs a
redeploy. **Everyone can read these**, by design.

| Name | What it is | If it is missing |
|---|---|---|
| `REACT_APP_SUPABASE_URL` | The Supabase project URL | Falls back to the URL written in the code (`btmqghudfakpbbplrqhf`), so the site still works |
| `REACT_APP_SUPABASE_ANON_KEY` | Supabase's public "anon" key. Safe to publish: row-level security decides what it can see | Falls back to the key written in the code |
| `REACT_APP_GOOGLE_MAPS_KEY` | Optional Google Places key for address autocomplete. Must be restricted to pluj.us in Google Cloud, because it is visible | Address lookup uses the free geocoder (Photon / OpenStreetMap). Works; slightly less precise |
| `REACT_APP_TURNSTILE_SITE_KEY` | Optional override for the Cloudflare Turnstile **site** key (public half of the CAPTCHA). The real one is written in the code since 31 Oct (widget "PLUJ" in Cloudflare) | The key in the code is used. Set it to `1x00000000000000000000AA` (Cloudflare's always-pass test key) for local development |

## B. Vercel, server side only (secret)

Same Vercel screen; read only by the functions in `api/` (log-error,
send-verification, send-booking-notification, verify-address, sitemap). Never
reach the browser.

| Name | What it is | If it is missing |
|---|---|---|
| `RESEND_API_KEY` | Resend key used by the `api/` email routes (verification codes, booking notifications, error alerts). **Secret** | Those emails are not sent; errors are still recorded |
| `SUPABASE_URL`, `SUPABASE_ANON_KEY` | Same values as group A, for the server functions | They fall back to the `REACT_APP_` versions |
| `RESEND_FROM` | Optional sender, e.g. `PLUJ Marketplace <noreply@pluj.us>` | Uses that default |
| `ALERT_EMAIL` | Optional: where error alerts from `api/log-error` go | `info@pluj.us` |

This list could not be compared against Vercel's own list today (this session
has no access to the Vercel team). Anything in Vercel that is not on this page
is unused and can be removed.

## C. Supabase Edge Function secrets (secret)

Supabase → Edge Functions → Secrets. Read by `payments`, `payments-scheduler`
and `stripe-webhook`.

| Name | What it is | Notes |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Provided by Supabase automatically | Never copy the service-role key anywhere else |
| `STRIPE_SECRET_KEY` | Stripe secret key | Needed only when payments are switched on (`STRIPE-SWITCH-ON-RUNBOOK.md`) |
| `STRIPE_WEBHOOK_SECRET` | Signs Stripe's webhook calls | Same — set at switch-on |

## D. Supabase Vault, inside the database (secret)

Supabase → Project Settings → Vault. Read by database functions, never by the
website. Only names are listed here; values are never written down.

| Name | Used by | Notes |
|---|---|---|
| `RESEND_API_KEY` | `drain_email_outbox()` (every minute): booking emails, reminders, alerts, waitlist emails | Separate copy from group B. Rotate both together |
| `PAYMENTS_CRON_SECRET` | The `payments-scheduler` cron job → edge function | Generated automatically on 7 Oct; nothing to set |
| `STRIPE_WEBHOOK_SECRET` | Payment functions | Not present yet; added at Stripe switch-on |

## E. Settings in the database (`platform_settings`, not secret)

Editable by an admin (some from the admin panel). Readable by the website where
a page needs them.

| Key | Today | Meaning |
|---|---|---|
| `payments_enabled` | `false` | The master switch for online payment |
| `terms_version` | `2026-10-31` | Recorded on each new account as the terms version accepted |
| `alert_email` | (unset → `info@pluj.us`) | Where database alerts go (failed emails, nightly self-test) |
| `contact_email`, `contact_location`, `support_hours` | info@pluj.us, Houston, TX, "Replies within 1 business day" | Shown on the site |
| `mailing_address` | (empty) | Postal address required in waitlist emails; sending refuses until set |
| `waitlist_daily_cap` | 80 | Waitlist emails per day (Resend free plan is 100/day) |
| `support_admin_id` | an admin's id | Who support conversations are addressed to |
| `host_service_fee_*`, `platform_fee_*`, `payment_split*`, `payout_*`, `dispute_fee_cents`, `tax_form_fee_cents`, `card_fees_paid_by`, `refund_reserve_bookings` | — | Payment pricing. Only matter once payments are on |

## Settings that are not variables

- **Supabase Auth → Attack Protection → CAPTCHA**: provider Turnstile, with the
  **secret** key of the Cloudflare widget "PLUJ" (Cloudflare → Turnstile → PLUJ →
  Settings shows it again). The site sends a token on sign-up, log-in and
  "Forgot password?" since 31 Oct; with this switch on, Supabase refuses any of
  those without a valid token. To roll back: switch it off here.
- **Supabase Auth → Password security → leaked-password check**: needs the Pro
  plan (item 13; parked with the other paid items).
- **Resend → Domains**: pluj.us with SPF, DKIM and DMARC.
