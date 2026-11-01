# PLUJ — functional requirements

Checklist item 1. Written 23 September 2026; brought up to date 31 October 2026
with everything October added (instant booking, one price, extras, payments
built but off, the waitlist, Spanish, the legal-information gate, badges,
blind reviews, event recaps, Wedding Events, the terms scroll gate).

Until September the code was the spec. That is survivable while one person
touches it and a problem the first day anyone else does — including a future
you, six months from now, trying to remember whether a rule was a decision or
an accident.

This describes **what PLUJ does and the rules that must hold**, not how it is
built. Where a rule exists because something went wrong, that is said, because
a rule without its reason gets "simplified" away by the next person.

---

## 1. What PLUJ is

A marketplace for event services in Houston, at www.pluj.us, in English and
Spanish. A host describes an event and books vendors (pros); vendors confirm
or decline, or the booking confirms instantly when the vendor allows it. PLUJ
introduces them, keeps the record, and checks vendors before they are shown.

**Money.** Online payment is **built and switched off** until Stripe approves
the account (`platform_settings.payments_enabled = false`). While it is off,
hosts pay vendors directly, as at launch. When it is on: the host pays the
whole price once the vendor confirms; it sits in the vendor's Stripe balance
and is released in parts (usually 30% a week before, 50% the day after, 20%
when the host releases it or 3 days later; new vendors get everything after
the event). See `STRIPE-SWITCH-ON-RUNBOOK.md`. Nothing in this document turns
it on.

## 2. Who uses it

| Role | Can |
|---|---|
| **Visitor** (not signed in) | Browse and search listings, filter by occasion, date, guests, area and "Habla español", read revealed reviews, see public vendor details and badges, use Build my event up to the point of sending |
| **Host** | All of the above, plus save favourites, send booking requests and inquiries, book instantly where allowed, message vendors they have a booking or inquiry with, review vendors after the event, cancel, report a problem, deactivate or delete their account |
| **Vendor** | Everything a host can do, plus: a business profile, legal information, listings with options, extras, hours and availability, accept or decline requests, switch on instant booking per listing, post event recaps crediting other pros, reply to reviews |
| **Admin** | Approve or reject vendor applications, mark badge checks, block accounts, message any user, read error reports and the ops dashboard, send the waitlist emails, switch the site public or private |

A person is one account. A vendor account is a host account with a vendor
profile attached.

## 3. The rules that must hold

These are the invariants. Breaking any of them is a bug regardless of what the
UI does. Rules marked **[DB]** are enforced by the database (constraint, RLS
policy or trigger), so they hold even for someone calling the API directly
with the public key from the bundle. Rules marked **[test]** are checked every
night by `sql/tests/selftest.sql`.

### Signing up

1. **Nobody creates an account without scrolling through the Terms.** The
   accept button stays locked until the terms box has been scrolled to the
   end; "Create account" refuses until it is accepted. *(31 Oct.)*
2. **Every new account confirms they are 18 or over** (date of birth) and that
   they are responsible for what they post. **[DB]** A host also confirms they
   will check vendors themselves; a vendor describes their business in at least
   40 characters (`VENDOR_DESC_MIN`). **[DB]**
3. **A half-finished sign-up is kept in the browser and offered back**, without
   the password, date of birth or EIN, and always reopens on step 1.
3a. **Sign-up, log-in and "Forgot password?" carry a Cloudflare Turnstile token**
   (widget "PLUJ"). Once the secret key is in Supabase Auth, Supabase refuses
   any of the three without a valid token, however it is called. *(31 Oct.)*
3b. **A sign-in that can no longer be renewed ends cleanly**: the page drops it,
   keeps working as a visitor, and says "log in again". Tabs share renewals, so
   one tab renewing never logs another out, and coming back after an hour
   renews the saved sign-in instead of looking logged out. *(31 Oct, found in
   the live logs.)*

### Vendors being shown

4. **A vendor is public only when approved by PLUJ AND their legal information
   is complete**: legal business name, business type, a 9-digit EIN, owners or
   managing members, full business address, business phone. Until then hosts
   cannot see the profile, its listings, its photos, or its legal name — not on
   the site and not through the API. **[DB][test]** A vendor whose information
   becomes incomplete disappears again. *(31 Oct.)*
5. **A licence or permit number is optional.** Some services do not need one.
6. **Badges are earned, never self-awarded.** A vendor can enter a licence or
   permit number, a DSHS food permit, a TABC alcohol permit and an insurance
   certificate. Only an admin can mark one checked; changing the details clears
   the check. **[DB][test]** The insurance badge disappears on the
   certificate's expiry date. **Verified** (blue check mark) = a licence or
   permit check AND an insurance check. What a badge does and does not promise
   is in the Terms ("What our review does and does not mean").
7. **A vendor's EIN, licence number, owners, phone and (unless a venue) street
   address are never readable by anyone but the vendor and PLUJ.** Public data
   goes through the `vendor_public` view, an explicit allow-list. **[DB][test]**
8. **A venue's address is public**, because the venue is where the event
   happens and that is what is being sold. Nobody else's is. **[DB][test]**

### Listings and price

9. **One price.** The price a host sees is what they pay. When payments are on,
   PLUJ's host fee (0% for a host's first 3 months, then 1%) is already inside
   it; nothing is added at checkout.
10. **The price on a booking is the price on the listing** — the chosen option
    plus every extra ticked — resolved by the database from the listing itself.
    A host cannot send a price; a vendor editing their listing later cannot
    reprice a live booking. **[DB]**
11. **A listing has up to 3 subcategories** (rentals: up to 20), its own
    working days and hours (or the business's), how many hours the price
    covers, the price of an extra hour, options with their own hours and
    requirements, and extras. **[DB]**

### Booking

12. **One event happens in one place on one date.** A second location or day is
    a second event; the guided flow enforces it. *(Hosts were assembling a venue
    in Houston on the 12th and a DJ in Katy on the 13th.)*
13. **A vendor is only offered if they can actually take the booking** — right
    area, free on the date, working that weekday and every hour block, and able
    to handle the guest count. Not shown at all otherwise, not greyed out.
14. **Instant booking**: a vendor can switch it on for a listing with a fixed
    price. A host booking an open date at least 72 hours away is confirmed
    straight away at the listed price. Anything that does not fit (blocked
    date, wrong weekday, full day, too little notice, no price, too many
    guests, vendor not public) falls back to an ordinary request. **[DB]**
15. **A request cannot be accepted after the event has started**, nor once
    cancelled, declined or closed for no response. **[DB]**
16. **A vendor cannot accept a booking that breaks their own stated limits** —
    minimum notice, capacity. **[DB]**
17. **Only the vendor can accept or decline; only the host can change the event
    details.** Neither can reassign the booking. **[DB]**
18. **An unanswered request does not stay open forever.** At 80% of the host's
    chosen window both sides are warned; at 100% it closes. Anything still
    pending 24 hours before the event is cancelled automatically.
19. **If a vendor cancels a confirmed booking, PLUJ sends the host approved
    replacements within one business day.** Every admin is notified with the
    deadline. *(The PLUJ promise, in the Terms.)*
20. **Build my event** covers Wedding Events (bridal showers, engagement
    parties, rehearsal dinners — everything around a wedding except the wedding
    itself), alongside the other occasions. Each step opens at its top; the
    page never scrolls itself to the bottom. *(31 Oct.)*

### Reviews

21. **Only the two sides of a confirmed booking whose date has passed can review
    each other.** One review per pair per direction. **[DB]**
22. **Blind until both have written, or 14 days pass**, so nobody reviews in
    retaliation. Notifications do not carry the stars or text before then.
    **[DB]**
23. **The subject may reply and may not edit the review. The reviewer chooses
    whether their name is shown** (default "Verified customer").

### Messaging and recaps

24. **A conversation exists between two parties with a reason** — a booking, an
    inquiry or admin support — and only they can read it. A conversation tied to
    an event closes three days after it. **[DB]**
25. **Two people can see each other's profile or business name only once they
    have a booking, inquiry or conversation together**, or the vendor is public.
    **[DB][test]**
26. **Event recaps**: a vendor posts a past event and credits the other PLUJ pros
    who worked it; credited pros are told. Only public vendors' recaps are
    shown; an admin can hide one. **[DB]**

### Accounts and the site

27. **Deactivation is reversible; deletion is not.** Deletion removes the
    account across every table and the auth identity. A blocked account cannot
    delete itself to escape the block; an admin cannot delete their own account.
28. **Nobody can promote themselves to admin.** **[DB]**
29. **The site can be switched private** (a "Good parties are coming" page with
    a waitlist). While private, visitors can only join the waitlist; the
    database refuses everything else. Waitlist emails go out only when an admin
    presses Send, at most `waitlist_daily_cap` a day, each with an unsubscribe
    link and a postal address. Public since 31 Oct 2026.
30. **Spanish everywhere.** Every page, email and message has a Spanish
    version; a visitor's language choice is remembered.

### Money

31. **While payments are off, no fee or payment reference can be recorded on a
    booking at all** — enforced by the database, so an accidental charge is
    impossible rather than unlikely. **[DB][test]**

## 4. The main flows

**Browse → request.** Visitor searches by area, date, service, occasion and
guest count → opens a listing → picks an option and extras → adds it to their
request list → signs in → completes event details → sends (or books
instantly). Each vendor receives a separate request.

**Build my event.** Occasion, area, date, time and guests first → then one
step per category (venue, music, food, decor, logistics, rentals, A/V…), each
offering only vendors who fit everything chosen so far. Picking a venue fixes
the event address. Review, then send every request at once.

**Vendor.** Sign up (terms scrolled, description) → add business details →
add legal information → PLUJ approves → profile goes live → add listings →
receive requests → accept or decline → the date is blocked on their calendar.
Optional: licence, permits and insurance for badges.

**After the event.** Either side reviews the other (blind until both have, or
14 days). The vendor can post a recap crediting the other pros.

## 5. What PLUJ deliberately does not do

Naming these stops them being re-proposed as oversights:

- **Take payment — yet.** Built, off until Stripe approves.
- **Guarantee vendors.** Applications are reviewed and badges are checked on a
  date; neither is a guarantee. The Terms say exactly what each badge means.
- **Arbitrate disputes** beyond freezing unreleased money when a problem is
  reported (once payments are on).
- **Operate outside Houston.** Other markets exist in the database and are off.
- **Offer a mobile app.** Web only, built to work at phone width.

## 6. Where this is enforced and how it is checked

Most of section 3 lives in the **database** — check constraints, RLS policies
and triggers. A rule enforced only in JavaScript is a suggestion.

- `sql/tests/selftest.sql` — 70 checks of who can see and change what, run
  every night at 05:41 Houston time; failures email the alert address. Run by
  hand after touching the database:
  `select * from public.selftest_run() where not pass;`
- `src/__tests__/` — the booking rules in the browser (vitest), on every push.
- `e2e/` — the site in a real browser with a fake backend (Playwright), on
  every push: sign-up and the terms gate, badges, Build my event, scrolling,
  Spanish, phone width.

---

## Keeping this true

Update this file when a rule changes — not when the code changes. If you find
the code doing something this document does not describe, one of the two is
wrong, and it is worth knowing which before you "fix" it.
