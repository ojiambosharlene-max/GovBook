'use strict';
/**
 * Notification architecture
 * -------------------------
 * Every event creates an in-app notification (always "sent"). If the citizen opted in to e-mail / SMS, a second row is
 * stored with channel='email' or 'sms' and delivery_status='pending'. A future worker (SendGrid, Twilio, SMTP ...) only has
 * to read the pending rows, deliver them and flip delivery_status - nothing else in the app has to change.
 * To plug a provider in right now, register it in CHANNEL_SENDERS below: it is called right after the row is stored.
 */
const { pool } = require('../config/db');

const CHANNEL_SENDERS = {
  // email: async (user, n) => { await transporter.sendMail({ to: user.email, subject: n.title, text: n.message }); },
  // sms:   async (user, n) => { await twilio.messages.create({ to: user.phone, body: n.message }); },
};

/** `conn` should be the transaction connection so the notification only exists if the booking really committed. */
async function notify(conn, userId, { appointmentId = null, type, title, message }) {
  const db = conn || pool;
  await db.query('INSERT INTO notifications (user_id, appointment_id, type, title, message, channel, delivery_status) VALUES (?,?,?,?,?,?,?)',
    [userId, appointmentId, type, title, message.slice(0, 500), 'in_app', 'sent']);
  const [[u]] = await db.query('SELECT notify_email, notify_sms FROM users WHERE id = ?', [userId]);
  if (!u) return;
  for (const [flag, channel] of [[u.notify_email, 'email'], [u.notify_sms, 'sms']]) {
    if (!flag) continue;
    await db.query('INSERT INTO notifications (user_id, appointment_id, type, title, message, channel, delivery_status) VALUES (?,?,?,?,?,?,?)',
      [userId, appointmentId, type, title, message.slice(0, 500), channel, CHANNEL_SENDERS[channel] ? 'sent' : 'pending']);
  }
}

const fmtDate = (d) => {
  const [y, m, day] = String(d).slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day)).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const fmtTime = (t) => String(t).slice(0, 5);

const describe = (a) => `${a.reference} - ${a.service_name} at ${a.office_name} on ${fmtDate(a.appointment_date)} at ${fmtTime(a.appointment_time)}`;

module.exports = { notify, describe, fmtDate, fmtTime };
