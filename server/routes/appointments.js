'use strict';
// Citizen-facing appointment + notification endpoints (all require a signed-in user).
const express = require('express');
const { pool } = require('../config/db');
const V = require('../utils/validate');
const { requireRole } = require('../middleware/auth');
const booking = require('../services/booking');

const appointments = express.Router();
const notifications = express.Router();

appointments.get('/stats', requireRole('citizen'), async (req, res) => {
  const [[s]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(status IN ('Pending','Confirmed','Checked In','In Progress') AND TIMESTAMP(appointment_date, appointment_time) >= (NOW() - INTERVAL 12 HOUR)), 0) AS upcoming,
            COALESCE(SUM(status = 'Completed'), 0) AS completed, COALESCE(SUM(status = 'Cancelled'), 0) AS cancelled,
            COALESCE(SUM(status = 'No Show'), 0) AS no_show
       FROM appointments WHERE citizen_id = ?`, [req.user.id]);
  const { rows } = await booking.listAppointments({ citizenId: req.user.id, upcomingOnly: true, limit: 1, order: 'asc' });
  res.json({ total: s.total, upcoming: Number(s.upcoming), completed: Number(s.completed), cancelled: Number(s.cancelled), noShow: Number(s.no_show), next: rows[0] || null });
});

appointments.get('/', requireRole('citizen'), async (req, res) => {
  const view = req.query.view;
  const { total, rows } = await booking.listAppointments({
    citizenId: req.user.id, upcomingOnly: view === 'upcoming', pastOnly: view === 'history',
    statuses: req.query.status ? String(req.query.status).split(',') : null,
    q: req.query.q, limit: V.int(req.query.limit, 'limit', { min: 1, max: 100 }) || 50, offset: V.int(req.query.offset, 'offset', { min: 0 }) || 0,
    order: view === 'upcoming' ? 'asc' : 'desc',
  });
  res.json({ total, rows });
});

appointments.post('/', requireRole('citizen'), async (req, res) => {
  const b = req.body || {};
  const key = V.str(b.idempotencyKey, 'idempotencyKey', { max: 64 });
  const out = await booking.book(req, {
    officeId: V.int(b.officeId, 'Office', { required: true, min: 1 }), serviceId: V.int(b.serviceId, 'Service', { required: true, min: 1 }),
    slotId: V.int(b.slotId, 'Time slot', { required: true, min: 1 }), notes: V.str(b.notes, 'Notes', { max: 500 }), idempotencyKey: key,
  });
  res.status(out.replay ? 200 : 201).json(out);
});

appointments.get('/:id', async (req, res) => {
  const a = await booking.getAppointment(V.int(req.params.id, 'id', { required: true, min: 1 }));
  if (!a) return res.status(404).json({ message: 'Appointment not found' });
  booking.assertCanAccess(req.user, a);
  res.json({ appointment: a, queue: await booking.queueProgress(a) });
});

appointments.post('/:id/cancel', requireRole('citizen'), async (req, res) => {
  const a = await booking.cancel(req, V.int(req.params.id, 'id', { required: true, min: 1 }), req.body && req.body.reason);
  res.json({ appointment: a });
});

// ---------------- notifications ----------------
notifications.get('/', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT id, appointment_id, type, title, message, is_read, created_at FROM notifications WHERE user_id = ? AND channel = 'in_app' ORDER BY created_at DESC, id DESC LIMIT 100`, [req.user.id]);
  const [[c]] = await pool.query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND channel = 'in_app' AND is_read = 0`, [req.user.id]);
  res.json({ unread: c.n, rows: rows.map((r) => ({ ...r, is_read: !!r.is_read })) });
});
notifications.get('/unread-count', async (req, res) => {
  const [[c]] = await pool.query(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND channel = 'in_app' AND is_read = 0`, [req.user.id]);
  res.json({ unread: c.n });
});
notifications.post('/read-all', async (req, res) => {
  await pool.query(`UPDATE notifications SET is_read = 1, read_at = NOW() WHERE user_id = ? AND channel = 'in_app' AND is_read = 0`, [req.user.id]);
  res.json({ ok: true });
});
notifications.post('/:id/read', async (req, res) => {
  await pool.query(`UPDATE notifications SET is_read = 1, read_at = NOW() WHERE id = ? AND user_id = ?`, [req.params.id, req.user.id]);
  res.json({ ok: true });
});

module.exports = { appointments, notifications };
