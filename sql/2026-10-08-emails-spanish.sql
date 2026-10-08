/* 8 Oct 2026 — emails in the reader's language (migration "emails_spanish")

   profiles.lang is set by the site's EN/ES switch. Every email goes through
   queue_email(), so that is where it is translated: if the recipient reads
   PLUJ in Spanish, known English phrases in the subject and body are swapped
   for Spanish ones from email_phrases (longest first, plain and HTML-escaped
   forms). The templates themselves stay English, one source of truth; a
   phrase missing from the table simply stays in English. To add one, insert
   a row into email_phrases. */

alter table public.profiles add column if not exists lang text not null default 'en';
alter table public.profiles add constraint profiles_lang_known check (lang in ('en', 'es'));

create table if not exists public.email_phrases (
  en text primary key,
  es text not null
);
alter table public.email_phrases enable row level security;   -- no policies: server only

create or replace function public.email_localize(p_text text, p_lang text)
returns text language plpgsql stable set search_path to 'public', 'pg_temp' as $function$
declare
  out_t text := p_text;
  r record;
begin
  if p_text is null or coalesce(p_lang, 'en') <> 'es' then return p_text; end if;
  for r in select en, es from public.email_phrases order by length(en) desc loop
    out_t := replace(out_t, r.en, r.es);
    if public.email_html_escape(r.en) <> r.en then
      out_t := replace(out_t, public.email_html_escape(r.en), public.email_html_escape(r.es));
    end if;
  end loop;
  return out_t;
end $function$;

create or replace function public.queue_email(p_to text, p_subject text, p_html text, p_kind text DEFAULT NULL::text, p_ref text DEFAULT NULL::text)
returns bigint language plpgsql security definer set search_path to 'public', 'pg_temp' as $function$
declare
  new_id bigint;
  v_lang text;
begin
  if coalesce(btrim(p_to),'') = '' or p_to not like '%@%' then
    raise exception 'queue_email: a recipient address is required';
  end if;
  -- The recipient's language, if they have an account.
  select lang into v_lang from public.profiles where lower(email) = lower(btrim(p_to)) limit 1;
  insert into public.email_outbox (to_email, subject, html, kind, ref_id)
  values (btrim(p_to),
          coalesce(public.email_localize(p_subject, v_lang), '(no subject)'),
          coalesce(public.email_localize(p_html, v_lang), ''),
          p_kind, p_ref)
  returning id into new_id;
  return new_id;
end $function$;

insert into public.email_phrases (en, es) values
-- badges
('NEW REQUEST', 'NUEVA SOLICITUD'), ('CHANGE REQUEST', 'SOLICITUD DE CAMBIO'),
('REQUEST CLOSED', 'SOLICITUD CERRADA'), ('REQUEST LOST', 'SOLICITUD PERDIDA'),
('NO RESPONSE YET', 'AÚN SIN RESPUESTA'), ('ACTION NEEDED', 'ACCIÓN NECESARIA'),
('REQUEST EXPIRED', 'SOLICITUD VENCIDA'), ('MISSED REQUEST', 'SOLICITUD NO ATENDIDA'),
('>
              CONFIRMED
            <', '>
              CONFIRMADA
            <'),
('>
              DECLINED
            <', '>
              RECHAZADA
            <'),
('>
              CANCELLED
            <', '>
              CANCELADA
            <'),
('>
              REMINDER
            <', '>
              RECORDATORIO
            <'),
-- subjects
('New booking request — ', 'Nueva solicitud de reserva — '),
('Request sent to ', 'Solicitud enviada a '),
('Booking confirmed by ', 'Reserva confirmada por '),
('You declined booking ', 'Rechazaste la reserva '),
(' can''t take this booking — ', ' no puede tomar esta reserva — '),
('Booking cancelled — ', 'Reserva cancelada — '),
('Booking change requested — ', 'Cambio de reserva solicitado — '),
('Reminder: ', 'Recordatorio: '),
-- headlines
(' wants to book you', ' quiere reservarte'),
('Your request was sent to ', 'Tu solicitud se envió a '),
('You confirmed this booking', 'Confirmaste esta reserva'),
(' confirmed your booking 🎉', ' confirmó tu reserva 🎉'),
('You declined this booking', 'Rechazaste esta reserva'),
(' can''t take this booking', ' no puede tomar esta reserva'),
('A booking was cancelled', 'Se canceló una reserva'),
('Your booking was cancelled', 'Tu reserva fue cancelada'),
(' requested changes', ' pidió cambios'),
('Your change request was sent', 'Tu solicitud de cambio fue enviada'),
-- messages
('Review the details below and approve or decline it in your PLUJ dashboard. The customer is waiting to hear back.',
 'Revisa los detalles de abajo y apruébala o recházala en tu panel de PLUJ. El cliente espera tu respuesta.'),
('We''ve sent your request to ', 'Enviamos tu solicitud a '),
('. You''ll get another email the moment they respond.', '. Te enviaremos otro correo en cuanto responda.'),
('This date is now reserved on your calendar. The full event details are below.',
 'Esta fecha ya está reservada en tu calendario. Abajo están todos los detalles del evento.'),
('You''re all set — the vendor has approved your event. Keep this confirmation number for your records.',
 'Todo listo: el proveedor aprobó tu evento. Guarda este número de confirmación.'),
('This is your record of the decision.', 'Este es tu registro de la decisión.'),
('You can send a request to another vendor, or message this one about other dates.',
 'Puedes enviar una solicitud a otro proveedor o escribirle a este sobre otras fechas.'),
('This booking has been cancelled. Cancellations must be made at least 48 hours before the event.',
 'Esta reserva fue cancelada. Las cancelaciones deben hacerse al menos 48 horas antes del evento.'),
('The customer changed the details below. Please review and approve or decline the change.',
 'El cliente cambió los detalles de abajo. Revisa el cambio y apruébalo o recházalo.'),
('We''ve sent your requested changes to the vendor. They''ll need to approve them before they take effect.',
 'Enviamos tus cambios al proveedor. Debe aprobarlos para que tengan efecto.'),
('Need to change or cancel? Either party can request it up to 48 hours before the event, and the other side must approve.',
 '¿Necesitas cambiar o cancelar? Cualquiera de las dos partes puede pedirlo hasta 48 horas antes del evento, y la otra parte debe aprobarlo.'),
('Sent by PLUJ · pluj.us', 'Enviado por PLUJ · pluj.us'),
-- detail table labels (anchored to the label cell so names are never touched)
('16px">Confirmation #</td>', '16px">Confirmación #</td>'),
('16px">Service</td>', '16px">Servicio</td>'),
('16px">Option</td>', '16px">Opción</td>'),
('16px">Event</td>', '16px">Evento</td>'),
('16px">Date</td>', '16px">Fecha</td>'),
('16px">Time</td>', '16px">Hora</td>'),
('16px">Guests</td>', '16px">Invitados</td>'),
('16px">Location</td>', '16px">Lugar</td>'),
('16px">Access notes</td>', '16px">Indicaciones de acceso</td>'),
('16px">Customer</td>', '16px">Cliente</td>'),
('16px">Vendor</td>', '16px">Proveedor</td>'),
('16px">Note</td>', '16px">Nota</td>'),
-- reminders, expiry and escalation emails
('Your event is ', 'Tu evento es '),
(' is confirmed for ', ' está confirmado para '),
('. Everything below is what they have on file — tell them now if anything has changed.',
 '. Abajo está lo que tienen registrado; avísales ahora si algo cambió.'),
('You have a booking ', 'Tienes una reserva '),
(' has you booked for ', ' te reservó para '),
('. Check the details below and message them in PLUJ if anything needs confirming before the day.',
 '. Revisa los detalles de abajo y escríbeles en PLUJ si hay algo que confirmar antes del día.'),
('Still no response from ', 'Aún no hay respuesta de '),
('Still no response on your request — ', 'Aún no hay respuesta a tu solicitud — '),
('We have reminded them again. Nothing is booked until a vendor accepts, so you may want to consider other options in the meantime.',
 'Se lo recordamos otra vez. Nada queda reservado hasta que un proveedor acepta, así que quizá quieras ver otras opciones mientras tanto.'),
(', PLUJ closes this request automatically and tells you, so you are not left waiting on it.',
 ', PLUJ cierra esta solicitud automáticamente y te avisa, para que no te quedes esperando.'),
('Request closed — ', 'Solicitud cerrada — '),
(' never responded', ' nunca respondió'),
('We have closed the request rather than leave you waiting, and they can no longer accept it. ',
 'Cerramos la solicitud para no dejarte esperando, y ya no la puede aceptar. '),
('Nothing was charged. Please book someone else for this event.', 'No se cobró nada. Reserva a alguien más para este evento.'),
('Your event details are saved — you can send the same request to another PLUJ vendor in a couple of clicks.',
 'Los datos de tu evento están guardados: puedes enviar la misma solicitud a otro proveedor de PLUJ en un par de clics.'),
('Your booking request is closed — ', 'Tu solicitud de reserva está cerrada — '),
('Your request expired — ', 'Tu solicitud venció — '),
('Your booking request expired — ', 'Tu solicitud de reserva venció — '),
('Your event is now less than 24 hours away and we never heard back, so we have cancelled this request instead of leaving you waiting on it. Nothing was charged.',
 'Tu evento es en menos de 24 horas y nunca recibimos respuesta, así que cancelamos esta solicitud para no dejarte esperando. No se cobró nada.'),
('You can send these same details to another vendor on PLUJ in a couple of clicks — your event is saved.',
 'Puedes enviar estos mismos datos a otro proveedor de PLUJ en un par de clics: tu evento está guardado.'),
('You have not responded to this request. Please reply — accept or decline it in your PLUJ dashboard. A quick no is worth far more to a customer than silence.',
 'No has respondido a esta solicitud. Responde: acéptala o recházala en tu panel de PLUJ. Para un cliente, un no rápido vale mucho más que el silencio.'),
('You lost this booking by not responding', 'Perdiste esta reserva por no responder'),
('You missed a booking request from ', 'No atendiste una solicitud de reserva de '),
('Responding quickly — even to decline — is what keeps you near the top of PLUJ search results.',
 'Responder rápido, aunque sea para rechazar, es lo que te mantiene arriba en los resultados de PLUJ.'),
('Answering quickly — even to decline — is what keeps you near the top of PLUJ search results.',
 'Responder rápido, aunque sea para rechazar, es lo que te mantiene arriba en los resultados de PLUJ.'),
('Still unanswered: ', 'Aún sin respuesta: '),
('This request is unanswered and the event is ', 'Esta solicitud no tiene respuesta y el evento es '),
('your event', 'tu evento')
on conflict (en) do update set es = excluded.es;

-- Occasion names in the detail table (anchored to the value cell).
insert into public.email_phrases (en, es) values
('#111">Birthday Party</td>', '#111">Fiesta de cumpleaños</td>'),
('#111">Wedding</td>', '#111">Boda</td>'),
('#111">Corporate Event</td>', '#111">Evento corporativo</td>'),
('#111">Concert / Festival</td>', '#111">Concierto / Festival</td>'),
('#111">Baby Shower</td>', '#111">Baby shower</td>'),
('#111">Seminar / Conference</td>', '#111">Seminario / Conferencia</td>'),
('#111">Kids Party</td>', '#111">Fiesta infantil</td>'),
('#111">Graduation</td>', '#111">Graduación</td>'),
('#111">Social Gathering</td>', '#111">Reunión social</td>'),
('#111">Event</td>', '#111">Evento</td>')
on conflict (en) do update set es = excluded.es;
