'use strict';
const express = require('express');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const env = require('../config/env');
const V = require('../utils/validate');
const { badRequest, notFound } = require('../utils/errors');

const router = express.Router();

const parseReq = (r) => (Array.isArray(r) ? r : (() => { try { return JSON.parse(r || '[]'); } catch (_) { return []; } })());

// Real numbers from the database - nothing here is hard-coded.
router.get('/overview', async (req, res) => {
  const [[s]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'citizen' AND u.is_active = 1) AS citizens,
            (SELECT COUNT(*) FROM government_services WHERE is_active = 1) AS services,
            (SELECT COUNT(*) FROM government_offices WHERE is_active = 1) AS offices,
            (SELECT COUNT(*) FROM appointments) AS appointments,
            (SELECT COUNT(*) FROM appointments WHERE status = 'Completed') AS completed`);
  res.json({ citizens: s.citizens, services: s.services, offices: s.offices, appointmentsBooked: s.appointments, appointmentsCompleted: s.completed });
});

router.get('/services', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.code, s.name, s.category, s.description, s.requirements, s.processing_info, s.icon, s.duration_minutes, s.requires_approval,
            (SELECT COUNT(*) FROM office_services os JOIN government_offices o ON o.id = os.office_id WHERE os.service_id = s.id AND os.is_active = 1 AND o.is_active = 1) AS office_count
       FROM government_services s WHERE s.is_active = 1 ORDER BY s.category, s.name`);
  res.json(rows.map((r) => ({ ...r, requirements: parseReq(r.requirements) })));
});

router.get('/offices', async (req, res) => {
  const serviceId = req.query.serviceId ? Number(req.query.serviceId) : null;
  const [rows] = await pool.query(
    `SELECT o.id, o.code, o.name, o.address, o.city, o.phone, o.email, o.opening_hours,
            (SELECT COUNT(*) FROM office_services os JOIN government_services s ON s.id = os.service_id WHERE os.office_id = o.id AND os.is_active = 1 AND s.is_active = 1) AS service_count
       FROM government_offices o
      WHERE o.is_active = 1
        AND (? IS NULL OR EXISTS (SELECT 1 FROM office_services os JOIN government_services s ON s.id = os.service_id
                                   WHERE os.office_id = o.id AND os.service_id = ? AND os.is_active = 1 AND s.is_active = 1))
      ORDER BY o.name`, [serviceId, serviceId]);
  res.json(rows);
});

router.get('/offices/:id/services', async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.code, s.name, s.category, s.description, s.requirements, s.processing_info, s.icon, s.duration_minutes, s.requires_approval
       FROM office_services os JOIN government_services s ON s.id = os.service_id JOIN government_offices o ON o.id = os.office_id
      WHERE os.office_id = ? AND os.is_active = 1 AND s.is_active = 1 AND o.is_active = 1 ORDER BY s.category, s.name`, [req.params.id]);
  res.json(rows.map((r) => ({ ...r, requirements: parseReq(r.requirements) })));
});

// Days of a month that still have free capacity, read straight from the database.
router.get('/availability', async (req, res) => {
  const officeId = V.int(req.query.officeId, 'officeId', { required: true, min: 1 });
  const month = String(req.query.month || '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw badRequest('month must be YYYY-MM');
  const [days] = await pool.query(
    `SELECT DATE_FORMAT(t.slot_date, '%Y-%m-%d') AS date, SUM(t.capacity) AS total, SUM(t.capacity - t.booked_count) AS free
       FROM time_slots t JOIN appointment_schedules s ON s.id = t.schedule_id
      WHERE t.office_id = ? AND t.slot_date BETWEEN ? AND LAST_DAY(?) AND t.is_active = 1 AND s.is_closed = 0
        AND TIMESTAMP(t.slot_date, t.start_time) > (NOW() + INTERVAL ? MINUTE)
      GROUP BY t.slot_date ORDER BY t.slot_date`, [officeId, `${month}-01`, `${month}-01`, env.bookingLeadMinutes]);
  const [closed] = await pool.query(
    `SELECT DATE_FORMAT(schedule_date, '%Y-%m-%d') AS date, closed_reason AS reason FROM appointment_schedules
      WHERE office_id = ? AND is_closed = 1 AND schedule_date BETWEEN ? AND LAST_DAY(?)`, [officeId, `${month}-01`, `${month}-01`]);
  res.json({ days: days.map((d) => ({ date: d.date, total: Number(d.total), free: Number(d.free) })), closed });
});

router.get('/slots', async (req, res) => {
  const officeId = V.int(req.query.officeId, 'officeId', { required: true, min: 1 });
  const date = V.date(req.query.date, 'date', { required: true });
  const [rows] = await pool.query(
    `SELECT t.id, TIME_FORMAT(t.start_time, '%H:%i') AS start, TIME_FORMAT(t.end_time, '%H:%i') AS end, t.capacity, t.booked_count,
            (t.capacity - t.booked_count) AS remaining,
            (t.is_active = 1 AND s.is_closed = 0 AND TIMESTAMP(t.slot_date, t.start_time) > (NOW() + INTERVAL ? MINUTE)) AS bookable
       FROM time_slots t JOIN appointment_schedules s ON s.id = t.schedule_id
      WHERE t.office_id = ? AND t.slot_date = ? ORDER BY t.start_time`, [env.bookingLeadMinutes, officeId, date]);
  res.json(rows.map((r) => ({ id: r.id, start: r.start, end: r.end, capacity: r.capacity, remaining: Number(r.remaining), bookable: !!Number(r.bookable) })));
});

const contactLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 10, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many messages. Please try again later.' } });
router.post('/contact', contactLimiter, async (req, res) => {
  const b = req.body || {};
  const name = V.str(b.name, 'Name', { required: true, min: 2, max: 120 });
  const email = V.email(b.email, 'Email', { required: true });
  const subject = V.str(b.subject, 'Subject', { required: true, min: 3, max: 150 });
  const message = V.str(b.message, 'Message', { required: true, min: 10, max: 2000 });
  await pool.query('INSERT INTO contact_messages (name, email, subject, message) VALUES (?,?,?,?)', [name, email, subject, message]);
  res.status(201).json({ message: 'Thank you - your message has been received. We will reply by email.' });
});

router.use((req, res, next) => next(notFound()));
module.exports = router;
