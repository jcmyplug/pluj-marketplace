/* ════════════════════════════════════════════════════════════════════════════
   PLUJ — Spanish emails, complete (31 Oct 2026)

   email_localize() swapped fixed phrases only. Every email was rendered for a
   Spanish-speaking host and pro (in a transaction that was rolled back) and
   the reminders, "still no answer" warnings and "request closed / expired"
   emails still had whole English sentences: the ones with a name, a duration
   or a date inside, plus "tomorrow" / "in 5 days", dates like "Nov 20, 2026"
   and event names in subject lines.

   email_patterns holds regular expressions applied after the phrases, in
   order. Months are handled in the function. English emails are untouched:
   all of this runs only when the recipient's language is Spanish.
   ════════════════════════════════════════════════════════════════════════════ */

create table if not exists public.email_patterns (
  ord         integer primary key,
  pattern     text not null,
  replacement text not null
);
alter table public.email_patterns enable row level security;
revoke all on public.email_patterns from anon, authenticated;

insert into public.email_phrases (en, es) values
  ('#111">Wedding Events</td>',          '#111">Eventos de boda</td>'),
  ('#111">Quinceañera / Sweet 16</td>',  '#111">Quinceañera / Sweet 16</td>'),
  ('#111">Other</td>',                   '#111">Otro</td>')
on conflict (en) do update set es = excluded.es;

insert into public.email_patterns (ord, pattern, replacement) values
  /* Subjects */
  (10, '^You confirmed (.+)''s booking — ',                 'Confirmaste la reserva de \1 — '),
  (11, '^You lost a booking request — ',                    'Perdiste una solicitud de reserva — '),
  (12, '^You have not responded to this request — ',        'No has respondido a esta solicitud — '),
  (13, '^You missed a booking request — ',                  'No atendiste una solicitud de reserva — '),
  /* Sentences with a name, a duration or a date inside */
  (20, ' is still waiting on your answer',                  ' sigue esperando tu respuesta'),
  (21, '\. Accept or decline it in your PLUJ dashboard — a quick no is worth far more to a customer than silence\.',
       '. Acéptala o recházala en tu panel de PLUJ: para un cliente, un no rápido vale mucho más que el silencio.'),
  (22, 'If nobody answers, PLUJ closes this request automatically on (.+?) — the customer asked for an answer within (.+?), and PLUJ closes any unanswered request 24 hours before the event, whichever comes first\. They are told it went unanswered\.',
       'Si nadie responde, PLUJ cierra esta solicitud automáticamente el \1. El cliente pidió una respuesta en un plazo de \2, y PLUJ cierra cualquier solicitud sin respuesta 24 horas antes del evento, lo que ocurra primero. Al cliente se le avisa que quedó sin respuesta.'),
  (23, 'This request sat unanswered until the event was less than 24 hours away, so PLUJ cancelled it for you and told the customer\. Nothing further is needed from you\.',
       'Esta solicitud quedó sin respuesta hasta que faltaban menos de 24 horas para el evento, así que PLUJ la canceló por ti y le avisó al cliente. No necesitas hacer nada más.'),
  (24, 'You asked for an answer within (.+?) and (.+?) has not answered\.',
       'Pediste una respuesta en un plazo de \1 y \2 no ha respondido.'),
  (25, 'This request sat unanswered for (.+?), the answer time the customer asked for, so PLUJ closed it and told (.+?) to find another vendor\. It is no longer yours to accept\. Nothing further is needed from you\.',
       'Esta solicitud quedó sin respuesta durante \1, el plazo que pidió el cliente, así que PLUJ la cerró y le avisó a \2 que busque otro proveedor. Ya no puedes aceptarla. No necesitas hacer nada más.'),
  (26, 'You sent this request (.+?) ago and (.+?) has not answered yet\.',
       'Enviaste esta solicitud hace \1 y \2 aún no ha respondido.'),
  (27, 'If there is still no answer in (.+?), PLUJ ',          'Si en \1 sigue sin haber respuesta, PLUJ '),
  (28, ' has been waiting (.+?) for your answer',             ' lleva \1 esperando tu respuesta'),
  (29, 'This customer asked for an answer within (.+?), counted from the moment they sent the request\. PLUJ closes it automatically after that, and a later event date does not extend it\.',
       'Este cliente pidió una respuesta en un plazo de \1, contado desde que envió la solicitud. Después de ese plazo, PLUJ la cierra automáticamente, aunque la fecha del evento sea más adelante.'),
  (30, '\mOption (\d+)\M',                                    'Opción \1'),
  /* Event names in subject lines, only right after the Spanish prefix, so a
     business called "Wedding Bliss" keeps its name. */
  (40, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Wedding Events\M',       '\1Eventos de boda'),
  (41, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Wedding\M',              '\1Boda'),
  (42, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Corporate Event\M',      '\1Evento corporativo'),
  (43, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Birthday Party\M',       '\1Fiesta de cumpleaños'),
  (44, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Concert / Festival\M',   '\1Concierto / Festival'),
  (45, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Baby Shower\M',          '\1Baby shower'),
  (46, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Seminar / Conference\M', '\1Seminario / Conferencia'),
  (47, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Kids Party\M',           '\1Fiesta infantil'),
  (48, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Graduation\M',           '\1Graduación'),
  (49, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Social Gathering\M',     '\1Reunión social'),
  (50, '^(Nueva solicitud de reserva — |Recordatorio: |Aún sin respuesta: )Other\M',                '\1Otro'),
  /* When: "in 5 days", "tomorrow", "today" */
  (60, '\min (\d+) days\M',   'en \1 días'),
  (61, '\mtomorrow\M',        'mañana'),
  (62, '\mtoday\M',           'hoy'),
  /* Durations from humanize_hours() */
  (70, '\m(\d+) days\M',      '\1 días'),
  (71, '\m1 day\M',           '1 día'),
  (72, '\m(\d+) hours\M',     '\1 horas'),
  (73, '\m1 hour\M',          '1 hora'),
  (74, '\m(\d+) minutes\M',   '\1 minutos'),
  (75, '\ma while\M',         'un tiempo')
on conflict (ord) do update set pattern = excluded.pattern, replacement = excluded.replacement;

create or replace function public.email_localize(p_text text, p_lang text)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $function$
declare
  out_t text := p_text;
  r     record;
  en_m  text[] := array['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  es_m  text[] := array['ene','feb','mar','abr','may','jun','jul','ago','sept','oct','nov','dic'];
  i     int;
begin
  if p_text is null or coalesce(p_lang, 'en') <> 'es' then return p_text; end if;
  for r in select en, es from public.email_phrases order by length(en) desc loop
    out_t := replace(out_t, r.en, r.es);
    if public.email_html_escape(r.en) <> r.en then
      out_t := replace(out_t, public.email_html_escape(r.en), public.email_html_escape(r.es));
    end if;
  end loop;
  for r in select pattern, replacement from public.email_patterns order by ord loop
    out_t := regexp_replace(out_t, r.pattern, r.replacement, 'g');
  end loop;
  /* Dates: "Nov 20, 2026" → "20 nov 2026"; "Nov 01 at 06:00 PM" →
     "01 nov a las 06:00 PM"; "Nov 20" → "20 nov". */
  for i in 1..12 loop
    out_t := regexp_replace(out_t, '\m' || en_m[i] || ' (\d{1,2}), (\d{4})\M', '\1 ' || es_m[i] || ' \2', 'g');
    out_t := regexp_replace(out_t, '\m' || en_m[i] || ' (\d{1,2}) at (\d{1,2}:\d{2} [AP]M)', '\1 ' || es_m[i] || ' a las \2', 'g');
    out_t := regexp_replace(out_t, '\m' || en_m[i] || ' (\d{1,2})\M', '\1 ' || es_m[i], 'g');
  end loop;
  return out_t;
end $function$;

/* "They" in these two is one person (the vendor, the host): singular. */
update public.email_phrases set es = '. Abajo está lo que tiene registrado; avísale ahora si algo cambió.'
 where en = '. Everything below is what they have on file — tell them now if anything has changed.';
update public.email_phrases set es = '. Revisa los detalles de abajo y escríbele en PLUJ si hay algo que confirmar antes del día.'
 where en = '. Check the details below and message them in PLUJ if anything needs confirming before the day.';

/* waitlist_email(): applied as migration waitlist_email_null_role_and_spanish.
   A person who joined without choosing host or pro has role NULL, and
   `p_role = 'pro'` is then NULL, not false: every IF fell through to the last
   branch and their launch invite was the pro *reminder* ("This is the last
   email from the waitlist"). Now coalesce(p_role = 'pro', false), and the same
   for p_lang and p_kind. Spanish wording: "Pediste enterarte primero",
   "PLUJ ya abrió en Houston", "perfil profesional" instead of "perfil de pro",
   "sin cargos extra al pagar". The edit was spliced into the live definition
   (pg_get_functiondef + replace) so nothing else in the function changed. */

/* handle_new_user(): applied as migration signup_saves_language. The profile
   now gets lang from the sign-up metadata ('es' or 'en'; anything else 'en'),
   so a person who signs up in Spanish gets PLUJ's emails in Spanish from the
   first one. Spliced into the live definition: the column list gains `lang`
   and the values gain `case when m->>'lang' = 'es' then 'es' else 'en' end`.
   Checked in a rolled-back transaction: a Spanish sign-up → 'es', none → 'en'. */
