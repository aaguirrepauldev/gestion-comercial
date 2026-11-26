import { EMAIL_FROM, IS_PRODUCTION, RESEND_API_KEY } from './config.js';
import { HttpError } from './util.js';

// Emails que no se mandaron por falta de RESEND_API_KEY (solo fuera de producción; los usan los tests).
export const outbox = [];

// Manda un email con Resend (https://resend.com/docs/api-reference/emails/send-email).
// Sin RESEND_API_KEY lo escribe en el log en lugar de mandarlo.
export async function sendEmail({ to, subject, html, text }) {
  if (!RESEND_API_KEY) {
    console.log(`[email no enviado: falta RESEND_API_KEY] Para: ${to} · ${subject}\n${text}`);
    if (!IS_PRODUCTION) outbox.push({ to, subject, text });
    return;
  }
  let res;
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error('No se pudo conectar con Resend:', err.message);
    throw new HttpError(502, 'No pudimos enviar el email. Probá de nuevo en un rato.');
  }
  if (!res.ok) {
    console.error(`Resend respondió ${res.status}:`, await res.text().catch(() => ''));
    throw new HttpError(502, 'No pudimos enviar el email. Revisá que la dirección sea correcta o probá de nuevo en un rato.');
  }
}
