# PLUJ — Supabase sign-up and password emails, in English and Spanish

Written 31 October 2026. Every PLUJ email (bookings, reminders, waitlist) is in
the person's language. Two are not PLUJ's: the **confirm your email** and
**reset your password** emails come from Supabase Auth, and are in English
only until these templates are pasted in.

Since 31 Oct the site saves the language a person signs up in
(`user_metadata.lang`, "es" or "en"), so the template can choose:
`{{ if eq .Data.lang "es" }} … {{ else }} … {{ end }}`. People who signed up
before then have no `lang` and get English, as now.

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
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#111">
{{ if eq .Data.lang "es" }}
  <h2 style="margin:0 0 10px;font-size:22px">Confirma tu correo</h2>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">Toca el botón para confirmar tu correo y terminar de crear tu cuenta de PLUJ. En la página que se abre, presiona <b>Confirmar mi correo</b>.</p>
  <p style="margin:0 0 18px"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup" style="display:inline-block;background:#1E40FF;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:999px">Confirmar mi correo</a></p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#555">El enlace funciona una sola vez y vence en 10 minutos. Si no creaste una cuenta en PLUJ, ignora este correo.</p>
{{ else }}
  <h2 style="margin:0 0 10px;font-size:22px">Confirm your email address</h2>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">Tap the button to confirm your email and finish creating your PLUJ account. On the page that opens, press <b>Confirm my email</b>.</p>
  <p style="margin:0 0 18px"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=signup" style="display:inline-block;background:#1E40FF;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:999px">Confirm my email address</a></p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#555">The link works once and expires after 10 minutes. If you didn't create a PLUJ account, ignore this email.</p>
{{ end }}
  <p style="margin:22px 0 0;color:#999;font-size:12px">PLUJ · pluj.us</p>
</div>
```

## Reset password

**Subject**

```
Reset your PLUJ password · Restablece tu contraseña de PLUJ
```

**Body**

```html
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:540px;margin:0 auto;padding:24px;color:#111">
{{ if eq .Data.lang "es" }}
  <h2 style="margin:0 0 10px;font-size:22px">Restablece tu contraseña</h2>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">Alguien (ojalá tú) pidió cambiar la contraseña de tu cuenta de PLUJ. Toca el botón y elige una nueva.</p>
  <p style="margin:0 0 18px"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;background:#1E40FF;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:999px">Elegir una contraseña nueva</a></p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#555">El enlace funciona una sola vez y vence en 10 minutos. Si no lo pediste, ignora este correo: tu contraseña no cambia.</p>
{{ else }}
  <h2 style="margin:0 0 10px;font-size:22px">Reset your password</h2>
  <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#333">Someone (hopefully you) asked to change the password on your PLUJ account. Tap the button to choose a new one.</p>
  <p style="margin:0 0 18px"><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery" style="display:inline-block;background:#1E40FF;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 24px;border-radius:999px">Choose a new password</a></p>
  <p style="margin:0;font-size:13px;line-height:1.6;color:#555">The link works once and expires after 10 minutes. If you didn't ask for this, ignore this email: your password stays the same.</p>
{{ end }}
  <p style="margin:22px 0 0;color:#999;font-size:12px">PLUJ · pluj.us</p>
</div>
```
