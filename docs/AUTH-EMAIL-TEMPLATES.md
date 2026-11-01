# PLUJ — Supabase sign-up and password emails, in English and Spanish

Written 31 October 2026. **Pasted into Supabase on 1 November 2026** (the
versions below, with `printf "%v"` so an account with no language saved still
gets its email). Every PLUJ email (bookings, reminders, waitlist) is in
the person's language. Two are not PLUJ's: the **confirm your email** and
**reset your password** emails come from Supabase Auth, and are in English
only until these templates are pasted in.

Since 31 Oct the site saves the language a person signs up in
(`user_metadata.lang`, "es" or "en"), and since 1 Nov the database keeps it
equal to `profiles.lang` (trigger `trg_sync_lang_to_auth`), which the site
updates whenever a signed-in person switches language. The template chooses
with `{{ if eq (printf "%v" .Data.lang) "es" }} … {{ else }} … {{ end }}`.
`printf` turns a missing value into text, so the comparison never fails.
Supabase's Preview shows both languages and the `{{ }}` lines as text; the
real email runs them.

The links point at `pluj.us/auth/confirm` with a token hash, the flow the site
already uses (a mail scanner opening the link does not spend it; the person
presses **Confirm my email** / **Confirmar mi correo** on the page).

## How to paste them (5 minutes)

1. Supabase → project **btmqghudfakpbbplrqhf** → Authentication → Emails →
   **Templates**.
2. Before changing anything, copy what is there now into a text file, so it
   can be put back.
3. **Confirm sign up**: paste the subject and the body below. Save.
4. **Reset password**: paste the subject and the body below. Save.
5. Sign up once with a test address with the site in Español, and once in
   English, and check both emails arrive and the button works.

If the current template's link is different from the one below (for example
it uses `{{ .ConfirmationURL }}`), keep the current link and only add the
Spanish half; or send a copy of the current template and it will be adapted.

---

## Confirm sign up

**Subject**

```
Confirm your email address · Confirma tu correo
```

**Body**

```html
{{ if eq (printf "%v" .Data.lang) "es" }}
<h2>Confirma tu correo</h2>
<p>Toca el botón de abajo para confirmar tu correo y terminar de crear tu cuenta de PLUJ.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirmar mi correo</a></p>
<p>Si no creaste una cuenta en PLUJ, puedes ignorar este correo.</p>
{{ else }}
<h2>Confirm your email address</h2>
<p>Tap the button below to confirm your email address and finish setting up your PLUJ account.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email address</a></p>
<p>If you did not create a PLUJ account, you can ignore this email.</p>
{{ end }}
```

The English half is the template that was there before, word for word.

## Reset password

**Subject**

```
Reset your PLUJ password · Restablece tu contraseña de PLUJ
```

**Body**

```html
{{ if eq (printf "%v" .Data.lang) "es" }}
<h2>Restablece tu contraseña</h2>
<p>Alguien (ojalá tú) pidió cambiar la contraseña de tu cuenta de PLUJ. Toca el botón de abajo para elegir una nueva.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Elegir una contraseña nueva</a></p>
<p>Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>
{{ else }}
<h2>Reset your password</h2>
<p>Someone (hopefully you) asked to change the password on your PLUJ account. Tap the button below to choose a new one.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
<p>If you didn't ask for this, ignore this email: your password stays the same.</p>
{{ end }}
```

## The previous English-only template (to go back)

```html
<h2>Confirm your email address</h2>
<p>Tap the button below to confirm your email address and finish setting up your PLUJ account.</p>
<p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup">Confirm my email address</a></p>
<p>If you did not create a PLUJ account, you can ignore this email.</p>
```
Subject: `Confirm your email address`.
