import crypto from 'node:crypto';
import { db, tx } from './db.js';
import { APP_URL, EMAIL_VERIFY_HOURS } from './config.js';
import { sendEmail } from './email.js';
import { HttpError } from './util.js';

// Confirmación del email del admin de los negocios que se registran desde la web.

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

export function cleanEmail(email) {
  const e = String(email ?? '').trim().toLowerCase();
  if (e.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@.]{2,}$/.test(e)) throw new HttpError(400, 'Ingresá un email válido');
  return e;
}

// Borra las cuentas que nunca confirmaron el email y cuyo link ya venció, así no ocupan el usuario ni el email
// (y los registros basura no se acumulan). Solo toca negocios sin otros usuarios ni pagos.
export function purgeUnverified(now = Date.now()) {
  const stale = db
    .prepare(
      `SELECT u.id, u.negocio_id FROM users u
       WHERE u.email_verificado = 0
         AND NOT EXISTS (SELECT 1 FROM email_verificaciones v WHERE v.user_id = u.id AND v.expira > ?)
         AND NOT EXISTS (SELECT 1 FROM users o WHERE o.negocio_id = u.negocio_id AND o.id <> u.id)
         AND NOT EXISTS (SELECT 1 FROM pagos p WHERE p.negocio_id = u.negocio_id)`
    )
    .all(now);
  if (stale.length > 0) tx(() => stale.forEach(deleteAccount));
  return stale.length;
}

// Borra una cuenta recién registrada (sin confirmar): sus links, el usuario y su negocio.
function deleteAccount({ id, negocio_id }) {
  db.prepare('DELETE FROM email_verificaciones WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  db.prepare('DELETE FROM negocios WHERE id = ?').run(negocio_id);
}
export const discardAccount = (user) => tx(() => deleteAccount(user));

// Genera un link nuevo (invalida los anteriores) y lo manda por email.
export async function sendVerification(user, requestOrigin) {
  const token = crypto.randomBytes(32).toString('base64url');
  tx(() => {
    db.prepare('DELETE FROM email_verificaciones WHERE user_id = ?').run(user.id);
    db.prepare('INSERT INTO email_verificaciones (token_hash, user_id, expira, created_at) VALUES (?, ?, ?, now_local())').run(
      hash(token),
      user.id,
      Date.now() + EMAIL_VERIFY_HOURS * 3600_000
    );
  });
  const link = `${APP_URL || requestOrigin}/verificar-email/?token=${token}`;
  await sendEmail({
    to: user.email,
    subject: 'Confirmá tu email para activar tu cuenta',
    text: `Hola ${user.name}:\n\nPara activar tu cuenta de Gestión Comercial (usuario "${user.username}") entrá a este link:\n${link}\n\nVence en ${EMAIL_VERIFY_HOURS} horas. Si no creaste esta cuenta, ignorá este email.`,
    html: `<p>Hola ${escapeHtml(user.name)}:</p>
<p>Para activar tu cuenta de Gestión Comercial (usuario <b>${escapeHtml(user.username)}</b>) confirmá tu email:</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#2563eb;color:#fff;border-radius:6px;text-decoration:none">Confirmar email</a></p>
<p style="color:#666;font-size:13px">O copiá este link en el navegador: ${link}<br>Vence en ${EMAIL_VERIFY_HOURS} horas. Si no creaste esta cuenta, ignorá este email.</p>`,
  });
}

// Valida el token del link y activa al usuario. Devuelve la fila del usuario.
export function confirmToken(token) {
  const row = db
    .prepare('SELECT user_id, expira FROM email_verificaciones WHERE token_hash = ?')
    .get(hash(String(token ?? '')));
  if (!row || row.expira <= Date.now()) {
    throw new HttpError(400, 'El link no es válido o ya venció. Pedí uno nuevo con tu email.');
  }
  tx(() => {
    db.prepare('UPDATE users SET email_verificado = 1 WHERE id = ?').run(row.user_id);
    db.prepare('DELETE FROM email_verificaciones WHERE user_id = ?').run(row.user_id);
  });
  return db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
