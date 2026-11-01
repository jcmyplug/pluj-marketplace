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
  Settings shows it again). ON since 31 Oct 2026, 8:49 pm: the site sends a
  token on sign-up, log-in and "Forgot password?", and Supabase refuses any of
  those without a valid one. To roll back: switch it off here.
- **Supabase Auth → Sign In / Providers → Email → Prevent use of leaked
  passwords**: ON since 31 Oct 2026 (Supabase Pro). Sign-up and password
  changes refuse passwords found in known data breaches (HaveIBeenPwned); the
  site shows a plain message. Also set there: minimum 12 characters, with
  lowercase, uppercase, a number and a symbol.
- **Supabase plan**: Pro since 31 Oct 2026. Daily database backups, 7 kept
  (docs/BACKUPS-AND-RESTORE.md). The usage meters in `service_limits` use the
  Pro limits (database 8 GB, files 100 GB). The spend cap is left as it was.
- **Resend → Domains**: pluj.us with SPF, DKIM and DMARC.
- **`public/robots.txt`**: search engines (Google, Bing, Apple) may index the
  public pages; AI crawlers (GPTBot, ClaudeBot, Google-Extended, PerplexityBot,
  Bytespider and others), AI agents acting for a person (ChatGPT-User,
  Claude-User, Perplexity-User) and bulk SEO scrapers are asked to stay out.
  Link previews (facebookexternalhit, Twitterbot) are not blocked. Only polite
  crawlers obey this file; the firewall below is what enforces it.
- **Vercel → pluj-marketplace → Firewall** (checked 1 Nov 2026):
  - Custom rules: *Rate limit the mail endpoints* (429), *Deny requests with no
    User-Agent*, and *PLUJ uptime probe passes* (Bypass, only when the request
    carries header `x-pluj-probe` with the value kept in Supabase Vault as
    `UPTIME_PROBE_TOKEN`; `uptime_probe()` sends it). Hobby allows 3 custom
    rules; all 3 are used.
  - Bot Management: **Bot Protection = Challenge** (non-browser traffic is
    challenged; browsers and verified bots such as Googlebot pass) and **AI
    Bots on, AI Crawlers = Deny, AI Assistants = Deny**. On since 1 Nov, 12:25 pm.
    Tested from outside: a script and a fake GPTBot were challenged, the probe
    with its header got through, the probe's user agent without the header was
    challenged.
  - To roll back: set Bot Protection to Log or Off on the same page. If the
    probe value is ever changed in Vault, change the rule too.
- **Supabase → Authentication → Sessions**: inactivity timeout **168 hours**
  (7 days) since 1 Nov; single session per user off; time-box 0.
- **Supabase → Authentication → Emails → Templates**: *Confirm sign up* and
  *Reset password* are bilingual since 1 Nov (`AUTH-EMAIL-TEMPLATES.md`). They
  read `user_metadata.lang`, which sign-up sets and the trigger
  `trg_sync_lang_to_auth` keeps equal to `profiles.lang`.
- **Database tables that are settings** (admin-editable, not secret):
  `action_caps` (per-account limits, see FUNCTIONAL-REQUIREMENTS 3c),
  `email_phrases` and `email_patterns` (Spanish for emails).
