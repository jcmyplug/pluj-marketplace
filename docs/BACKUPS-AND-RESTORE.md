# PLUJ — backups and how to restore

Checklist item 22. Written 31 October 2026, the day PLUJ moved to Supabase Pro.

## What is backed up

| What | Backed up? | How |
|---|---|---|
| **The database**: accounts, profiles, vendors, listings, bookings, messages, reviews, settings, the email queue | **Yes, daily** | Supabase Pro takes a full backup every day around 13:18 UTC (8:18 am Houston in summer time, 7:18 am in winter) and keeps the last **7**. Dashboard → Database → Backups → Scheduled backups. Seven were listed on 31 Oct (25–31 Oct). |
| **Sign-in accounts** (Supabase Auth) | Yes | They live in the same database, so the daily backup includes them. |
| **Uploaded files**: vendor photos, vendor documents (Supabase Storage) | **No** | Database backups keep only the list of files, not the files. A file someone deletes is gone. Supabase stores files redundantly, so this is about deletion by a person, not about losing a disk. |
| **The code** | Yes | GitHub (jcmyplug/pluj-marketplace) and the copy in Desktop\Pluj\website-code. |
| **Database changes** | Yes | Every change is a file in `sql/` and a recorded migration. |
| **Payments** | Stripe | When payments are on, Stripe is the record of every charge and payout. |

## How much could be lost

Up to **one day**: anything written since the last daily backup (new bookings,
messages, sign-ups) would have to be re-entered after a restore.

Point-in-time recovery (restore to any minute) is a Supabase add-on at about
$100 a month. It is **not** on (parked with the other items that cost money).
Worth reconsidering once payments are switched on.

## When to restore

Only for damage to a lot of data: many rows deleted or overwritten, a bad
migration. **A restore replaces the whole live database with the backup.**
Everything since then is lost, including accounts created since.

For one wrong row or one deleted booking, do **not** restore. Fix it by hand
in the table editor, or ask for help. (The backups here are "physical", so they
cannot be downloaded to pick out single rows; Supabase's "restore to a new
project" can do that, but it creates a second, billed project.)

## How to restore, step by step

1. **Stop new writes.** Admin panel → switch the site to private (coming-soon
   page). Nothing new is written while you work.
2. **Save what came after the backup.** In the SQL editor, export the recent
   rows you will want back, for example:
   `select * from booking_requests where created_at > '<backup time>';`
   (also `profiles`, `messages`, `reviews`). Download as CSV.
3. **Restore.** Dashboard → Database → Backups → Scheduled backups → **Restore**
   on the chosen day. The project is unavailable while it runs (minutes for a
   database this size).
4. **Check it.** In the SQL editor:
   `select * from public.selftest_run() where not pass;` — empty means every
   security rule is as it should be. Then compare the latest migration
   (`select max(version) from supabase_migrations.schema_migrations;`) with the
   newest file in `sql/`; re-apply any change made after the backup.
5. **Put back what you saved** in step 2, then switch the site public again.
6. **Tell the people affected**, including anyone who signed up after the
   backup (their account is gone; they sign up again with the same email).

## Not rehearsed yet

A restore has not been practised. Practising safely means "restore to a new
project", which creates a second billed project for as long as it exists
(about $10 a month while it runs, then deleted). Parked with the money items;
worth doing once, before payments go on.
