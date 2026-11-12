'use strict';
// Administration. Admins can do everything; staff only what an admin granted them (and only for their own office).
const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const V = require('../utils/validate');
const { badRequest, conflict, notFound, forbidden } = require('../utils/errors');
const { requireRole, requirePermission, STAFF_PERMISSIONS } = require('../middleware/auth');
const booking = require('../services/booking');
const { audit } = require('../services/audit');

const router = express.Router();
const adminOnly = requireRole('admin');
const like = (s) => `%${String(s).replace(/[\\%_]/g, (m) => '\\' + m)}%`;
const paging = (req, def = 25) => ({ limit: V.int(req.query.limit, 'limit', { min: 1, max: 200 }) || def, offset: V.int(req.query.offset, 'offset', { min: 0 }) || 0 });
const phoneOk = (p) => /^\+?[0-9][0-9 ()-]{6,19}$/.test(p);
const timeOk = (t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t);
const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const hhmmss = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;

router.get('/meta', (req, res) => res.json({ permissions: STAFF_PERMISSIONS }));

// ============================================================ dashboard
router.get('/dashboard', adminOnly, async (req, res) => {
  const [[c]] = await pool.query(
    `SELECT (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'citizen') AS citizens,
            (SELECT COUNT(*) FROM users u JOIN roles r ON r.id = u.role_id WHERE r.name = 'staff' AND u.is_active = 1) AS staff,
            (SELECT COUNT(*) FROM government_offices WHERE is_active = 1) AS offices,
            (SELECT COUNT(*) FROM government_services WHERE is_active = 1) AS services,
            COUNT(*) AS total, COALESCE(SUM(status = 'Confirmed'), 0) AS confirmed, COALESCE(SUM(status = 'Pending'), 0) AS pending,
            COALESCE(SUM(status = 'Completed'), 0) AS completed, COALESCE(SUM(status = 'Cancelled'), 0) AS cancelled, COALESCE(SUM(status = 'No Show'), 0) AS no_show,
            COALESCE(SUM(appointment_date = CURDATE()), 0) AS today
       FROM appointments`);
  const [trend] = await pool.query(
    `SELECT DATE_FORMAT(d.day, '%Y-%m-%d') AS date, COUNT(a.id) AS total, COALESCE(SUM(a.status = 'Completed'), 0) AS completed, COALESCE(SUM(a.status = 'Cancelled'), 0) AS cancelled
       FROM (SELECT CURDATE() - INTERVAL n DAY AS day FROM (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13) x) d
       LEFT JOIN appointments a ON a.appointment_date = d.day GROUP BY d.day ORDER BY d.day`);
  const [byStatus] = await pool.query('SELECT status, COUNT(*) AS n FROM appointments GROUP BY status');
  const [todayByOffice] = await pool.query(
    `SELECT o.name, COUNT(a.id) AS total, COALESCE(SUM(a.status = 'Completed'), 0) AS completed
       FROM government_offices o LEFT JOIN appointments a ON a.office_id = o.id AND a.appointment_date = CURDATE() AND a.status <> 'Cancelled'
      WHERE o.is_active = 1 GROUP BY o.id ORDER BY o.name`);
  const { rows: recent } = await booking.listAppointments({ limit: 8, order: 'desc' });
  const [[msgs]] = await pool.query('SELECT COUNT(*) AS n FROM contact_messages WHERE is_handled = 0');
  res.json({
    counts: Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Number(v)])),
    trend: trend.map((t) => ({ ...t, total: Number(t.total), completed: Number(t.completed), cancelled: Number(t.cancelled) })),
    byStatus: byStatus.map((s) => ({ status: s.status, count: s.n })),
    todayByOffice: todayByOffice.map((o) => ({ ...o, total: Number(o.total), completed: Number(o.completed) })),
    recent, unhandledMessages: msgs.n,
  });
});

// ============================================================ citizens
router.get('/citizens', requirePermission('citizens.view'), async (req, res) => {
  const where = [`r.name = 'citizen'`]; const p = [];
  if (req.query.q) { where.push('(u.full_name LIKE ? OR u.email LIKE ? OR u.national_id LIKE ? OR u.phone LIKE ?)'); const l = like(req.query.q); p.push(l, l, l, l); }
  if (req.query.status === 'active') where.push('u.is_active = 1'); else if (req.query.status === 'inactive') where.push('u.is_active = 0');
  const { limit, offset } = paging(req);
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where.join(' AND ')}`, p);
  const [rows] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.national_id, u.is_active, u.created_at, u.last_login_at,
            (SELECT COUNT(*) FROM appointments a WHERE a.citizen_id = u.id) AS appointments
       FROM users u JOIN roles r ON r.id = u.role_id WHERE ${where.join(' AND ')} ORDER BY u.created_at DESC, u.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  res.json({ total, rows });
});

router.patch('/citizens/:id', adminOnly, async (req, res) => {
  const id = V.int(req.params.id, 'id', { required: true, min: 1 });
  const [[u]] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.name = 'citizen'`, [id]);
  if (!u) throw notFound('Citizen not found');
  const b = req.body || {};
  const fullName = V.str(b.fullName, 'Full name', { required: true, min: 3, max: 120 });
  const phone = V.str(b.phone, 'Phone', { required: true, max: 25 });
  if (!phoneOk(phone)) throw badRequest('Phone number is not valid');
  const active = V.bool(b.isActive, true);
  await pool.query('UPDATE users SET full_name = ?, phone = ?, is_active = ?, token_version = token_version + ? WHERE id = ?', [fullName, phone, active, active ? 0 : 1, id]);
  await audit(req, active ? 'CITIZEN_UPDATED' : 'CITIZEN_DEACTIVATED', 'user', id, { fullName, active });
  res.json({ ok: true });
});

// ============================================================ offices
router.get('/offices', requireRole('admin', 'staff'), async (req, res) => {
  const where = req.user.role === 'staff' ? 'WHERE o.id = ?' : '';
  const [rows] = await pool.query(
    `SELECT o.*, (SELECT COUNT(*) FROM office_services os WHERE os.office_id = o.id AND os.is_active = 1) AS service_count,
            (SELECT COUNT(*) FROM users u WHERE u.office_id = o.id AND u.role_id = 2 AND u.is_active = 1) AS staff_count
       FROM government_offices o ${where} ORDER BY o.name`, req.user.role === 'staff' ? [req.user.office_id] : []);
  res.json(rows);
});

function officeBody(b) {
  const phone = V.str(b.phone, 'Phone', { max: 30 });
  return {
    code: V.str(b.code, 'Code', { required: true, min: 2, max: 20 }).toUpperCase(), name: V.str(b.name, 'Name', { required: true, min: 3, max: 150 }),
    address: V.str(b.address, 'Address', { required: true, max: 255 }), city: V.str(b.city, 'City', { required: true, max: 100 }),
    phone, email: V.email(b.email, 'Email'), opening_hours: V.str(b.openingHours, 'Opening hours', { max: 150 }), is_active: V.bool(b.isActive, true),
  };
}
router.post('/offices', adminOnly, async (req, res) => {
  const o = officeBody(req.body || {});
  const [r] = await pool.query('INSERT INTO government_offices SET ?', [o]);
  await audit(req, 'OFFICE_CREATED', 'office', r.insertId, { name: o.name });
  res.status(201).json({ id: r.insertId });
});
router.put('/offices/:id', adminOnly, async (req, res) => {
  const o = officeBody(req.body || {});
  const [r] = await pool.query('UPDATE government_offices SET ? WHERE id = ?', [o, req.params.id]);
  if (!r.affectedRows) throw notFound('Office not found');
  await audit(req, 'OFFICE_UPDATED', 'office', req.params.id, { name: o.name, active: o.is_active });
  res.json({ ok: true });
});
router.get('/offices/:id/services', adminOnly, async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.id, s.name, s.category, s.is_active AS service_active, COALESCE(os.is_active, 0) AS offered
       FROM government_services s LEFT JOIN office_services os ON os.service_id = s.id AND os.office_id = ? ORDER BY s.category, s.name`, [req.params.id]);
  res.json(rows.map((r) => ({ ...r, offered: !!r.offered, service_active: !!r.service_active })));
});
router.put('/offices/:id/services', adminOnly, async (req, res) => {
  const officeId = V.int(req.params.id, 'id', { required: true, min: 1 });
  const ids = (Array.isArray(req.body.serviceIds) ? req.body.serviceIds : []).map(Number).filter(Number.isInteger);
  await withTransaction(async (conn) => {
    const [[o]] = await conn.query('SELECT id FROM government_offices WHERE id = ? FOR UPDATE', [officeId]);
    if (!o) throw notFound('Office not found');
    await conn.query('UPDATE office_services SET is_active = 0 WHERE office_id = ?', [officeId]); // soft-remove: history keeps its links
    for (const sid of ids) {
      await conn.query('INSERT INTO office_services (office_id, service_id, is_active) VALUES (?,?,1) ON DUPLICATE KEY UPDATE is_active = 1', [officeId, sid]);
    }
    await audit(req, 'OFFICE_SERVICES_UPDATED', 'office', officeId, { serviceIds: ids }, conn);
  });
  res.json({ ok: true });
});

// ============================================================ services
router.get('/services', requireRole('admin', 'staff'), async (req, res) => {
  const [rows] = await pool.query(
    `SELECT s.*, (SELECT COUNT(*) FROM office_services os WHERE os.service_id = s.id AND os.is_active = 1) AS office_count,
            (SELECT COUNT(*) FROM appointments a WHERE a.service_id = s.id) AS appointment_count FROM government_services s ORDER BY s.category, s.name`);
  res.json(rows.map((r) => ({ ...r, requirements: Array.isArray(r.requirements) ? r.requirements : [] })));
});
function serviceBody(b) {
  const reqs = (Array.isArray(b.requirements) ? b.requirements : String(b.requirements || '').split('\n')).map((x) => String(x).trim()).filter(Boolean).slice(0, 20);
  return {
    code: V.str(b.code, 'Code', { required: true, min: 2, max: 20 }).toUpperCase(), name: V.str(b.name, 'Name', { required: true, min: 3, max: 150 }),
    category: V.str(b.category, 'Category', { required: true, max: 80 }), description: V.str(b.description, 'Description', { required: true, min: 10, max: 1000 }),
    requirements: JSON.stringify(reqs), processing_info: V.str(b.processingInfo, 'Processing information', { max: 200 }),
    icon: V.str(b.icon, 'Icon', { max: 40 }) || 'FileText', duration_minutes: V.int(b.durationMinutes, 'Duration', { required: true, min: 5, max: 240 }),
    requires_approval: V.bool(b.requiresApproval), is_active: V.bool(b.isActive, true),
  };
}
router.post('/services', adminOnly, async (req, res) => {
  const s = serviceBody(req.body || {});
  const [r] = await pool.query('INSERT INTO government_services SET ?', [s]);
  await audit(req, 'SERVICE_CREATED', 'service', r.insertId, { name: s.name });
  res.status(201).json({ id: r.insertId });
});
router.put('/services/:id', adminOnly, async (req, res) => {
  const s = serviceBody(req.body || {});
  const [r] = await pool.query('UPDATE government_services SET ? WHERE id = ?', [s, req.params.id]);
  if (!r.affectedRows) throw notFound('Service not found');
  await audit(req, s.is_active ? 'SERVICE_UPDATED' : 'SERVICE_DEACTIVATED', 'service', req.params.id, { name: s.name });
  res.json({ ok: true });
});

// ============================================================ schedules & slots
router.get('/schedules', requirePermission('schedules.manage'), async (req, res) => {
  const officeId = req.scopeOfficeId || V.int(req.query.officeId, 'officeId', { min: 1 });
  const from = V.date(req.query.from, 'from'); const to = V.date(req.query.to, 'to');
  const where = []; const p = [];
  if (officeId) { where.push('s.office_id = ?'); p.push(officeId); }
  where.push('s.schedule_date >= COALESCE(?, CURDATE())'); p.push(from);
  where.push('s.schedule_date <= COALESCE(?, CURDATE() + INTERVAL 30 DAY)'); p.push(to);
  const [rows] = await pool.query(
    `SELECT s.id, s.office_id, o.name AS office_name, DATE_FORMAT(s.schedule_date, '%Y-%m-%d') AS schedule_date, DAYNAME(s.schedule_date) AS weekday,
            TIME_FORMAT(s.open_time, '%H:%i') AS open_time, TIME_FORMAT(s.close_time, '%H:%i') AS close_time, s.slot_minutes, s.slot_capacity, s.is_closed, s.closed_reason,
            COUNT(t.id) AS slot_count, COALESCE(SUM(t.capacity), 0) AS capacity_total, COALESCE(SUM(t.booked_count), 0) AS booked_total
       FROM appointment_schedules s JOIN government_offices o ON o.id = s.office_id LEFT JOIN time_slots t ON t.schedule_id = s.id
      WHERE ${where.join(' AND ')} GROUP BY s.id, o.name ORDER BY s.schedule_date, o.name LIMIT 400`, p);
  res.json(rows.map((r) => ({ ...r, is_closed: !!r.is_closed, capacity_total: Number(r.capacity_total), booked_total: Number(r.booked_total) })));
});

router.post('/schedules/generate', requirePermission('schedules.manage'), async (req, res) => {
  const b = req.body || {};
  const officeId = req.scopeOfficeId || V.int(b.officeId, 'Office', { required: true, min: 1 });
  const from = V.date(b.fromDate, 'From date', { required: true }); const to = V.date(b.toDate, 'To date', { required: true });
  if (to < from) throw badRequest('The end date must be on or after the start date');
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  if (days > 120) throw badRequest('Please generate at most 120 days at a time');
  const open = V.str(b.openTime, 'Opening time', { required: true }); const close = V.str(b.closeTime, 'Closing time', { required: true });
  if (!timeOk(open) || !timeOk(close)) throw badRequest('Times must be in HH:MM format');
  const step = V.int(b.slotMinutes, 'Slot length', { required: true, min: 10, max: 120 });
  const capacity = V.int(b.capacity, 'Capacity per slot', { required: true, min: 1, max: 100 });
  const weekdays = (Array.isArray(b.weekdays) ? b.weekdays : [1, 2, 3, 4, 5]).map(Number);
  const breakStart = b.breakStart && timeOk(b.breakStart) ? toMin(b.breakStart) : null; const breakEnd = b.breakEnd && timeOk(b.breakEnd) ? toMin(b.breakEnd) : null;
  const openM = toMin(open); const closeM = toMin(close);
  if (closeM - openM < step) throw badRequest('The opening hours are shorter than one slot');
  const [[office]] = await pool.query('SELECT id FROM government_offices WHERE id = ?', [officeId]);
  if (!office) throw notFound('Office not found');
  const [[{ today }]] = await pool.query(`SELECT DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS today`);

  const result = await withTransaction(async (conn) => {
    let created = 0, skipped = 0, slots = 0;
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.parse(from) + i * 86400000); const ds = d.toISOString().slice(0, 10);
      if (ds < today || !weekdays.includes(d.getUTCDay())) continue;
      const [[exists]] = await conn.query('SELECT id FROM appointment_schedules WHERE office_id = ? AND schedule_date = ?', [officeId, ds]);
      if (exists) { skipped++; continue; }
      const [ins] = await conn.query(
        'INSERT INTO appointment_schedules (office_id, schedule_date, open_time, close_time, slot_minutes, slot_capacity, created_by) VALUES (?,?,?,?,?,?,?)',
        [officeId, ds, `${open}:00`, `${close}:00`, step, capacity, req.user.id]);
      const rows = [];
      for (let m = openM; m + step <= closeM; m += step) {
        if (breakStart !== null && breakEnd !== null && m < breakEnd && m + step > breakStart) continue;
        rows.push([ins.insertId, officeId, ds, hhmmss(m), hhmmss(m + step), capacity]);
      }
      if (rows.length) await conn.query('INSERT INTO time_slots (schedule_id, office_id, slot_date, start_time, end_time, capacity) VALUES ?', [rows]);
      created++; slots += rows.length;
    }
    await audit(req, 'SCHEDULE_GENERATED', 'office', officeId, { from, to, created, skipped, slots, capacity, step }, conn);
    return { created, skipped, slots };
  });
  res.status(201).json(result);
});

async function scheduleFor(req, id) {
  const [[s]] = await pool.query('SELECT * FROM appointment_schedules WHERE id = ?', [id]);
  if (!s) throw notFound('Schedule not found');
  if (req.scopeOfficeId && s.office_id !== req.scopeOfficeId) throw forbidden();
  return s;
}

router.get('/schedules/:id/slots', requirePermission('schedules.manage'), async (req, res) => {
  await scheduleFor(req, req.params.id);
  const [rows] = await pool.query(
    `SELECT id, TIME_FORMAT(start_time, '%H:%i') AS start, TIME_FORMAT(end_time, '%H:%i') AS end, capacity, booked_count, is_active FROM time_slots WHERE schedule_id = ? ORDER BY start_time`, [req.params.id]);
  res.json(rows.map((r) => ({ ...r, is_active: !!r.is_active })));
});

router.patch('/schedules/:id', requirePermission('schedules.manage'), async (req, res) => {
  const id = V.int(req.params.id, 'id', { required: true, min: 1 });
  const b = req.body || {};
  await withTransaction(async (conn) => {
    const [[s]] = await conn.query('SELECT * FROM appointment_schedules WHERE id = ? FOR UPDATE', [id]);
    if (!s) throw notFound('Schedule not found');
    if (req.scopeOfficeId && s.office_id !== req.scopeOfficeId) throw forbidden();
    if (b.isClosed !== undefined) {
      const closed = V.bool(b.isClosed);
      if (closed) {
        const [[{ n }]] = await conn.query(`SELECT COUNT(*) AS n FROM appointments WHERE office_id = ? AND appointment_date = ? AND status IN ('Pending','Confirmed','Checked In','In Progress')`, [s.office_id, s.schedule_date]);
        if (n > 0) throw conflict(`${n} active appointment(s) exist on this day. Reschedule or cancel them before closing the day.`);
      }
      await conn.query('UPDATE appointment_schedules SET is_closed = ?, closed_reason = ? WHERE id = ?', [closed, closed ? (V.str(b.closedReason, 'Reason', { max: 200 }) || 'Closed') : null, id]);
      await audit(req, closed ? 'SCHEDULE_CLOSED' : 'SCHEDULE_REOPENED', 'schedule', id, { date: s.schedule_date, reason: b.closedReason }, conn);
    }
    if (b.slotCapacity !== undefined) {
      const cap = V.int(b.slotCapacity, 'Capacity', { required: true, min: 1, max: 100 });
      const [[m]] = await conn.query('SELECT COALESCE(MAX(booked_count), 0) AS mx FROM time_slots WHERE schedule_id = ? FOR UPDATE', [id]);
      if (cap < m.mx) throw conflict(`Capacity cannot be lower than ${m.mx}, the number already booked in the busiest slot.`);
      await conn.query('UPDATE time_slots SET capacity = ? WHERE schedule_id = ?', [cap, id]);
      await conn.query('UPDATE appointment_schedules SET slot_capacity = ? WHERE id = ?', [cap, id]);
      await audit(req, 'SLOT_CAPACITY_CHANGED', 'schedule', id, { capacity: cap }, conn);
    }
  });
  res.json({ ok: true });
});

router.patch('/slots/:id', requirePermission('schedules.manage'), async (req, res) => {
  const id = V.int(req.params.id, 'id', { required: true, min: 1 });
  await withTransaction(async (conn) => {
    const [[t]] = await conn.query('SELECT * FROM time_slots WHERE id = ? FOR UPDATE', [id]);
    if (!t) throw notFound('Slot not found');
    if (req.scopeOfficeId && t.office_id !== req.scopeOfficeId) throw forbidden();
    const cap = req.body.capacity === undefined ? t.capacity : V.int(req.body.capacity, 'Capacity', { required: true, min: 1, max: 100 });
    const active = req.body.isActive === undefined ? t.is_active : V.bool(req.body.isActive);
    if (cap < t.booked_count) throw conflict(`${t.booked_count} citizen(s) are already booked in this slot, so capacity cannot be lower than that.`);
    if (!active && t.booked_count > 0) throw conflict('This slot has bookings. Reschedule or cancel them before disabling it.');
    await conn.query('UPDATE time_slots SET capacity = ?, is_active = ? WHERE id = ?', [cap, active, id]);
    await audit(req, 'SLOT_UPDATED', 'slot', id, { capacity: cap, active: !!active }, conn);
  });
  res.json({ ok: true });
});

// ============================================================ staff accounts
const staffSelect = `SELECT u.id, u.full_name, u.email, u.phone, u.office_id, o.name AS office_name, u.permissions, u.is_active, u.last_login_at, u.created_at
                       FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN government_offices o ON o.id = u.office_id WHERE r.name = 'staff'`;
const cleanPerms = (p) => (Array.isArray(p) ? p.filter((x) => STAFF_PERMISSIONS.includes(x)) : []);
const permsOut = (r) => ({ ...r, is_active: !!r.is_active, permissions: Array.isArray(r.permissions) ? r.permissions : [] });

router.get('/staff', adminOnly, async (req, res) => {
  const [rows] = await pool.query(`${staffSelect} ORDER BY o.name, u.full_name`);
  res.json(rows.map(permsOut));
});
router.post('/staff', adminOnly, async (req, res) => {
  const b = req.body || {};
  const fullName = V.str(b.fullName, 'Full name', { required: true, min: 3, max: 120 });
  const email = V.email(b.email, 'Email', { required: true });
  const phone = V.str(b.phone, 'Phone', { required: true, max: 25 }); if (!phoneOk(phone)) throw badRequest('Phone number is not valid');
  const officeId = V.int(b.officeId, 'Office', { required: true, min: 1 });
  const pw = V.password(b.password);
  const [[dup]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (dup) throw conflict('An account with this email already exists.');
  const [r] = await pool.query(
    `INSERT INTO users (role_id, office_id, full_name, email, phone, password_hash, permissions) VALUES ((SELECT id FROM roles WHERE name = 'staff'), ?,?,?,?,?,?)`,
    [officeId, fullName, email, phone, await bcrypt.hash(pw, env.bcryptRounds), JSON.stringify(cleanPerms(b.permissions))]);
  await audit(req, 'STAFF_CREATED', 'user', r.insertId, { fullName, officeId, permissions: cleanPerms(b.permissions) });
  res.status(201).json({ id: r.insertId });
});
router.patch('/staff/:id', adminOnly, async (req, res) => {
  const id = V.int(req.params.id, 'id', { required: true, min: 1 }); const b = req.body || {};
  const [[u]] = await pool.query(`SELECT u.id FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ? AND r.name = 'staff'`, [id]);
  if (!u) throw notFound('Staff account not found');
  const fullName = V.str(b.fullName, 'Full name', { required: true, min: 3, max: 120 });
  const phone = V.str(b.phone, 'Phone', { required: true, max: 25 }); if (!phoneOk(phone)) throw badRequest('Phone number is not valid');
  const officeId = V.int(b.officeId, 'Office', { required: true, min: 1 }); const active = V.bool(b.isActive, true);
  const sets = ['full_name = ?', 'phone = ?', 'office_id = ?', 'permissions = ?', 'is_active = ?']; const p = [fullName, phone, officeId, JSON.stringify(cleanPerms(b.permissions)), active];
  if (!active) sets.push('token_version = token_version + 1');
  if (b.newPassword) { sets.push('password_hash = ?', 'token_version = token_version + 1'); p.push(await bcrypt.hash(V.password(b.newPassword, 'New password'), env.bcryptRounds)); }
  await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, [...p, id]);
  await audit(req, 'STAFF_UPDATED', 'user', id, { fullName, officeId, active, permissions: cleanPerms(b.permissions), passwordReset: !!b.newPassword });
  res.json({ ok: true });
});

// ============================================================ appointments (view / search / cancel / reschedule)
router.get('/appointments', requirePermission('appointments.manage'), async (req, res) => {
  const { limit, offset } = paging(req);
  const out = await booking.listAppointments({
    officeId: req.scopeOfficeId || V.int(req.query.officeId, 'officeId', { min: 1 }), serviceId: V.int(req.query.serviceId, 'serviceId', { min: 1 }),
    from: V.date(req.query.from, 'from'), to: V.date(req.query.to, 'to'), q: req.query.q, statuses: req.query.status ? String(req.query.status).split(',') : null,
    limit, offset, order: req.query.order === 'asc' ? 'asc' : 'desc',
  });
  res.json(out);
});
router.post('/appointments/:id/cancel', requirePermission('appointments.manage'), async (req, res) => {
  res.json({ appointment: await booking.cancel(req, V.int(req.params.id, 'id', { required: true, min: 1 }), req.body && req.body.reason) });
});
router.post('/appointments/:id/reschedule', requirePermission('appointments.manage'), async (req, res) => {
  const reason = V.str(req.body && req.body.reason, 'Reason', { max: 200 });
  res.json({ appointment: await booking.reschedule(req, V.int(req.params.id, 'id', { required: true, min: 1 }), V.int(req.body && req.body.slotId, 'New slot', { required: true, min: 1 }), reason) });
});

// ============================================================ notifications & contact inbox
router.get('/notifications', adminOnly, async (req, res) => {
  const where = []; const p = [];
  if (req.query.channel) { where.push('n.channel = ?'); p.push(req.query.channel); }
  if (req.query.deliveryStatus) { where.push('n.delivery_status = ?'); p.push(req.query.deliveryStatus); }
  const { limit, offset } = paging(req, 50);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM notifications n ${w}`, p);
  const [rows] = await pool.query(
    `SELECT n.id, n.type, n.title, n.message, n.channel, n.delivery_status, n.is_read, n.created_at, u.full_name AS recipient FROM notifications n JOIN users u ON u.id = n.user_id ${w} ORDER BY n.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  const [[s]] = await pool.query(`SELECT COALESCE(SUM(delivery_status = 'pending'), 0) AS pending, COALESCE(SUM(channel = 'in_app'), 0) AS in_app FROM notifications`);
  res.json({ total, rows, pending: Number(s.pending), inApp: Number(s.in_app) });
});
router.post('/notifications/broadcast', adminOnly, async (req, res) => {
  const title = V.str(req.body.title, 'Title', { required: true, min: 3, max: 150 }); const message = V.str(req.body.message, 'Message', { required: true, min: 5, max: 500 });
  const audience = V.oneOf(req.body.audience, 'Audience', ['citizens', 'staff', 'all'], { required: true });
  const roles = audience === 'all' ? ['citizen', 'staff'] : [audience === 'citizens' ? 'citizen' : 'staff'];
  const [r] = await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, channel, delivery_status)
     SELECT u.id, 'announcement', ?, ?, 'in_app', 'sent' FROM users u JOIN roles ro ON ro.id = u.role_id WHERE ro.name IN (?) AND u.is_active = 1`, [title, message, roles]);
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, message, channel, delivery_status)
     SELECT u.id, 'announcement', ?, ?, 'email', 'pending' FROM users u JOIN roles ro ON ro.id = u.role_id WHERE ro.name IN (?) AND u.is_active = 1 AND u.notify_email = 1`, [title, message, roles]);
  await audit(req, 'ANNOUNCEMENT_SENT', 'notification', null, { title, audience, recipients: r.affectedRows });
  res.status(201).json({ recipients: r.affectedRows });
});
router.get('/contact-messages', adminOnly, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, subject, message, is_handled, created_at FROM contact_messages ORDER BY is_handled, created_at DESC LIMIT 100');
  res.json(rows.map((r) => ({ ...r, is_handled: !!r.is_handled })));
});
router.patch('/contact-messages/:id', adminOnly, async (req, res) => {
  await pool.query('UPDATE contact_messages SET is_handled = ? WHERE id = ?', [V.bool(req.body.isHandled), req.params.id]);
  res.json({ ok: true });
});

// ============================================================ reports
router.get('/reports', requirePermission('reports.view'), async (req, res) => {
  const [[def]] = await pool.query(`SELECT DATE_FORMAT(CURDATE() - INTERVAL 29 DAY, '%Y-%m-%d') AS f, DATE_FORMAT(CURDATE(), '%Y-%m-%d') AS t`);
  const from = V.date(req.query.from, 'from') || def.f; const to = V.date(req.query.to, 'to') || def.t;
  if (to < from) throw badRequest('The end date must be on or after the start date');
  const officeId = req.scopeOfficeId || V.int(req.query.officeId, 'officeId', { min: 1 }); const serviceId = V.int(req.query.serviceId, 'serviceId', { min: 1 });
  const cond = ['a.appointment_date BETWEEN ? AND ?']; const p = [from, to];
  if (officeId) { cond.push('a.office_id = ?'); p.push(officeId); }
  if (serviceId) { cond.push('a.service_id = ?'); p.push(serviceId); }
  const W = cond.join(' AND ');
  const cols = `COUNT(*) AS total, COALESCE(SUM(a.status = 'Completed'), 0) AS completed, COALESCE(SUM(a.status = 'Cancelled'), 0) AS cancelled, COALESCE(SUM(a.status = 'No Show'), 0) AS no_show`;
  const num = (r) => ({ ...r, total: Number(r.total), completed: Number(r.completed), cancelled: Number(r.cancelled), no_show: Number(r.no_show) });
  const [[tot]] = await pool.query(`SELECT ${cols} FROM appointments a WHERE ${W}`, p);
  const [daily] = await pool.query(`SELECT DATE_FORMAT(a.appointment_date, '%Y-%m-%d') AS label, ${cols} FROM appointments a WHERE ${W} GROUP BY a.appointment_date ORDER BY a.appointment_date`, p);
  const [weekly] = await pool.query(`SELECT DATE_FORMAT(DATE_SUB(a.appointment_date, INTERVAL WEEKDAY(a.appointment_date) DAY), '%Y-%m-%d') AS label, ${cols} FROM appointments a WHERE ${W} GROUP BY label ORDER BY label`, p);
  const [monthly] = await pool.query(`SELECT DATE_FORMAT(a.appointment_date, '%Y-%m') AS label, ${cols} FROM appointments a WHERE ${W} GROUP BY label ORDER BY label`, p);
  const [services] = await pool.query(`SELECT s.name AS label, ${cols} FROM appointments a JOIN government_services s ON s.id = a.service_id WHERE ${W} GROUP BY s.id ORDER BY total DESC LIMIT 10`, p);
  const [offices] = await pool.query(
    `SELECT o.name AS label, ${cols}, ROUND(AVG(TIMESTAMPDIFF(MINUTE, q.checked_in_at, q.started_at)), 1) AS avg_wait_minutes, ROUND(AVG(TIMESTAMPDIFF(MINUTE, q.started_at, q.completed_at)), 1) AS avg_service_minutes
       FROM appointments a JOIN government_offices o ON o.id = a.office_id LEFT JOIN queue_records q ON q.appointment_id = a.id WHERE ${W} GROUP BY o.id ORDER BY total DESC`, p);
  const t = num(tot);
  res.json({
    range: { from, to }, totals: t,
    cancellationRate: t.total ? Math.round((t.cancelled / t.total) * 1000) / 10 : 0, noShowRate: t.total ? Math.round((t.no_show / t.total) * 1000) / 10 : 0,
    completionRate: t.total ? Math.round((t.completed / t.total) * 1000) / 10 : 0,
    daily: daily.map(num), weekly: weekly.map(num), monthly: monthly.map(num), services: services.map(num),
    offices: offices.map((o) => ({ ...num(o), avg_wait_minutes: o.avg_wait_minutes === null ? null : Number(o.avg_wait_minutes), avg_service_minutes: o.avg_service_minutes === null ? null : Number(o.avg_service_minutes) })),
  });
});

// ============================================================ audit log
router.get('/audit', adminOnly, async (req, res) => {
  const where = []; const p = [];
  if (req.query.q) { where.push('(l.action LIKE ? OR u.full_name LIKE ? OR l.entity_type LIKE ? OR l.entity_id = ?)'); const l = like(req.query.q); p.push(l, l, l, String(req.query.q)); }
  const { limit, offset } = paging(req, 50);
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${w}`, p);
  const [rows] = await pool.query(
    `SELECT l.id, l.action, l.entity_type, l.entity_id, l.details, l.ip_address, l.created_at, u.full_name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id = l.user_id ${w} ORDER BY l.id DESC LIMIT ? OFFSET ?`, [...p, limit, offset]);
  res.json({ total, rows });
});

module.exports = router;
