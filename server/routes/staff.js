'use strict';
// Staff dashboard + queue management. Staff are limited to their own office; administrators may pass ?officeId=.
const express = require('express');
const { pool } = require('../config/db');
const V = require('../utils/validate');
const { badRequest, forbidden, notFound } = require('../utils/errors');
const booking = require('../services/booking');

const router = express.Router();

function officeFor(req, { required = false } = {}) {
  if (req.user.role === 'staff') {
    if (!req.user.office_id) throw forbidden('Your account is not assigned to an office. Ask an administrator to assign one.');
    return req.user.office_id;
  }
  const id = V.int(req.query.officeId || (req.body && req.body.officeId), 'officeId', { min: 1 });
  if (required && !id) throw badRequest('Please choose an office');
  return id;
}

async function today() { return (await pool.query('SELECT CURDATE() AS d'))[0][0].d; }

router.get('/overview', async (req, res) => {
  const officeId = officeFor(req, { required: true });
  const date = V.date(req.query.date, 'date') || await today();
  const [[office]] = await pool.query('SELECT id, name, address, city FROM government_offices WHERE id = ?', [officeId]);
  if (!office) throw notFound('Office not found');
  const [[c]] = await pool.query(
    `SELECT COUNT(*) AS total, COALESCE(SUM(status IN ('Pending','Confirmed')), 0) AS expected, COALESCE(SUM(status = 'Checked In'), 0) AS waiting,
            COALESCE(SUM(status = 'In Progress'), 0) AS serving, COALESCE(SUM(status = 'Completed'), 0) AS completed,
            COALESCE(SUM(status = 'Cancelled'), 0) AS cancelled, COALESCE(SUM(status = 'No Show'), 0) AS no_show
       FROM appointments WHERE office_id = ? AND appointment_date = ?`, [officeId, date]);
  const [[cur]] = await pool.query(`SELECT MAX(queue_number) AS n FROM queue_records WHERE office_id = ? AND queue_date = ? AND status IN ('Serving','Completed')`, [officeId, date]);
  const [[last]] = await pool.query(`SELECT MAX(queue_number) AS n FROM queue_records WHERE office_id = ? AND queue_date = ?`, [officeId, date]);
  res.json({
    office, date,
    counts: { total: c.total, expected: Number(c.expected), waiting: Number(c.waiting), serving: Number(c.serving), completed: Number(c.completed), cancelled: Number(c.cancelled), noShow: Number(c.no_show) },
    currentNumber: cur.n || 0, currentLabel: cur.n ? booking.queueLabel(cur.n) : null, lastIssued: last.n || 0,
  });
});

router.get('/queue', async (req, res) => {
  const officeId = officeFor(req, { required: true });
  const date = V.date(req.query.date, 'date') || await today();
  const [rows] = await pool.query(
    `SELECT q.id, q.queue_number, q.status AS queue_status, q.counter, q.checked_in_at, q.started_at, q.completed_at,
            a.id AS appointment_id, a.reference, a.status, TIME_FORMAT(a.appointment_time, '%H:%i') AS appointment_time,
            u.full_name AS citizen_name, s.name AS service_name
       FROM queue_records q JOIN appointments a ON a.id = q.appointment_id JOIN users u ON u.id = a.citizen_id JOIN government_services s ON s.id = a.service_id
      WHERE q.office_id = ? AND q.queue_date = ? ORDER BY q.queue_number`, [officeId, date]);
  res.json(rows.map((r) => ({ ...r, queue_label: booking.queueLabel(r.queue_number) })));
});

router.get('/appointments', async (req, res) => {
  const officeId = officeFor(req);
  const date = V.date(req.query.date, 'date');
  const { total, rows } = await booking.listAppointments({
    officeId, date, q: req.query.q, statuses: req.query.status ? String(req.query.status).split(',') : null,
    limit: V.int(req.query.limit, 'limit', { min: 1, max: 200 }) || 100, offset: V.int(req.query.offset, 'offset', { min: 0 }) || 0, order: 'asc',
  });
  res.json({ total, rows });
});

// Staff find a booking by its reference number when the citizen arrives.
router.get('/lookup', async (req, res) => {
  const ref = V.str(req.query.reference, 'Reference', { required: true, max: 30 }).toUpperCase();
  const { rows } = await booking.listAppointments({ q: ref, limit: 5 });
  const a = rows.find((r) => r.reference === ref);
  if (!a) throw notFound('No appointment found with that reference number.');
  if (req.user.role === 'staff' && a.office_id !== req.user.office_id) {
    return res.status(403).json({ message: `This appointment is booked at ${a.office_name}, not at your office.`, code: 'OTHER_OFFICE' });
  }
  const today0 = String(await today()).slice(0, 10);
  res.json({
    appointment: a, queue: await booking.queueProgress(a),
    verification: { isToday: String(a.appointment_date).slice(0, 10) === today0, correctOffice: true, status: a.status },
  });
});

router.post('/appointments/:id/:action', async (req, res) => {
  const action = req.params.action;
  if (!['confirm', 'checkin', 'start', 'complete', 'noshow'].includes(action)) throw notFound('Unknown action');
  const counter = V.str(req.body && req.body.counter, 'Counter', { max: 30 }) || 'Counter 1';
  const a = await booking.transition(req, V.int(req.params.id, 'id', { required: true, min: 1 }), action, { counter });
  res.json({ appointment: a, queue: await booking.queueProgress(a) });
});

router.post('/queue/call-next', async (req, res) => {
  const officeId = officeFor(req, { required: true });
  const counter = V.str(req.body && req.body.counter, 'Counter', { max: 30 }) || 'Counter 1';
  const a = await booking.callNext(req, officeId, counter);
  res.json({ appointment: a });
});

module.exports = router;
