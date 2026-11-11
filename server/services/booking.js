'use strict';
/**
 * Appointment engine - every change to an appointment or its slot capacity goes through here.
 *
 * Double-booking protection (defence in depth):
 *   1. The slot row is locked (SELECT ... FOR UPDATE) inside a transaction, availability is re-checked after the lock,
 *      and booked_count is incremented in the same transaction.
 *   2. time_slots has CHECK (booked_count <= capacity).
 *   3. appointments has unique keys so a citizen cannot hold the same slot twice or have two live bookings for one service.
 *   4. Composite foreign keys make it impossible to store a service the office does not offer or a slot of another office.
 * A confirmation is only returned after COMMIT succeeded.
 */
const { pool, withTransaction } = require('../config/db');
const env = require('../config/env');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');
const { audit } = require('./audit');
const { notify, describe } = require('./notifications');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const makeReference = () => 'GOV-' + Array.from({ length: 8 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
const queueLabel = (n) => 'Q-' + String(n).padStart(3, '0');

const DETAIL_SQL = `
  SELECT a.id, a.reference, a.status, a.appointment_date, a.appointment_time, a.booked_at, a.notes, a.cancel_reason, a.cancelled_at, a.completed_at,
         a.citizen_id, a.office_id, a.service_id, a.slot_id,
         o.name AS office_name, o.address AS office_address, o.city AS office_city, o.phone AS office_phone,
         s.name AS service_name, s.category AS service_category, s.requirements, s.processing_info, s.duration_minutes, s.icon AS service_icon,
         u.full_name AS citizen_name, u.email AS citizen_email, u.phone AS citizen_phone, u.national_id AS citizen_national_id,
         q.queue_number, q.status AS queue_status, q.counter AS queue_counter
    FROM appointments a
    JOIN government_offices o ON o.id = a.office_id
    JOIN government_services s ON s.id = a.service_id
    JOIN users u ON u.id = a.citizen_id
    LEFT JOIN queue_records q ON q.appointment_id = a.id`;

const shape = (r) => r && ({
  ...r,
  requirements: Array.isArray(r.requirements) ? r.requirements : (() => { try { return JSON.parse(r.requirements || '[]'); } catch (_) { return []; } })(),
  queue_label: r.queue_number ? queueLabel(r.queue_number) : null,
});

async function getAppointment(id, db = pool) {
  const [[r]] = await db.query(`${DETAIL_SQL} WHERE a.id = ?`, [id]);
  return shape(r);
}

/** Returns what a citizen needs to follow their place in the queue today. */
async function queueProgress(a) {
  if (!a.queue_number) return null;
  const [[now]] = await pool.query(
    `SELECT MAX(CASE WHEN status IN ('Serving','Completed') THEN queue_number END) AS current_number,
            SUM(status = 'Waiting' AND queue_number < ?) AS ahead
       FROM queue_records WHERE office_id = ? AND queue_date = ?`, [a.queue_number, a.office_id, String(a.appointment_date).slice(0, 10)]);
  return { currentNumber: now.current_number || 0, currentLabel: now.current_number ? queueLabel(now.current_number) : null, ahead: Number(now.ahead) || 0 };
}

function assertCanAccess(user, a) {
  if (user.role === 'admin') return;
  if (user.role === 'citizen' && a.citizen_id === user.id) return;
  if (user.role === 'staff' && user.office_id === a.office_id) return;
  throw forbidden('You do not have access to this appointment');
}

// ----------------------------------------------------------------------------------------------------------------
async function book(req, { officeId, serviceId, slotId, notes, idempotencyKey }) {
  const citizenId = req.user.id;
  const result = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [citizenId]); // serialises one citizen's own bookings

    if (idempotencyKey) {
      const [[again]] = await conn.query('SELECT id FROM appointments WHERE citizen_id = ? AND idempotency_key = ?', [citizenId, idempotencyKey]);
      if (again) return { id: again.id, replay: true };
    }

    // Service must exist, be active and be offered by this office.
    const [[svc]] = await conn.query(
      `SELECT s.id, s.name, s.requires_approval, s.is_active AS service_active, os.is_active AS link_active, o.is_active AS office_active
         FROM government_services s
         JOIN office_services os ON os.service_id = s.id AND os.office_id = ?
         JOIN government_offices o ON o.id = os.office_id
        WHERE s.id = ?`, [officeId, serviceId]);
    if (!svc) throw badRequest('The selected service is not offered at the selected office. Please review your selection.');
    if (!svc.service_active || !svc.link_active || !svc.office_active) throw badRequest('This service is currently not available for booking at this office.');

    // Lock the slot, then re-validate everything against the locked row.
    const [[slot]] = await conn.query(
      `SELECT id, office_id, schedule_id, slot_date, start_time, capacity, booked_count, is_active,
              TIMESTAMP(slot_date, start_time) > (NOW() + INTERVAL ? MINUTE) AS bookable
         FROM time_slots WHERE id = ? FOR UPDATE`, [env.bookingLeadMinutes, slotId]);
    if (!slot || slot.office_id !== Number(officeId)) throw badRequest('The selected time slot does not belong to this office.');
    const [[sched]] = await conn.query('SELECT is_closed, closed_reason FROM appointment_schedules WHERE id = ?', [slot.schedule_id]);
    if (!slot.is_active || sched.is_closed) throw conflict('This time slot is not available. Please choose another.', { code: 'SLOT_UNAVAILABLE' });
    if (!slot.bookable) throw badRequest(`This time has already passed or starts in less than ${env.bookingLeadMinutes} minutes. Please choose a later slot.`, { code: 'SLOT_PAST' });
    if (slot.booked_count >= slot.capacity) throw conflict('Sorry, that time slot has just been fully booked. Please choose another time.', { code: 'SLOT_FULL' });

    const [[dup]] = await conn.query('SELECT reference FROM appointments WHERE citizen_id = ? AND service_id = ? AND open_flag = 1 LIMIT 1', [citizenId, serviceId]);
    if (dup) throw conflict(`You already have an active appointment (${dup.reference}) for this service. Cancel or complete it before booking another.`, { code: 'DUPLICATE_BOOKING' });

    const status = svc.requires_approval ? 'Pending' : 'Confirmed';
    let id;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [ins] = await conn.query(
          `INSERT INTO appointments (reference, citizen_id, office_id, service_id, slot_id, appointment_date, appointment_time, status, notes, idempotency_key)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [makeReference(), citizenId, officeId, serviceId, slotId, slot.slot_date, slot.start_time, status, notes || null, idempotencyKey || null]);
        id = ins.insertId; break;
      } catch (err) {
        if (err.code === 'ER_DUP_ENTRY' && /uq_appt_reference/.test(err.sqlMessage || '') && attempt < 4) continue;
        throw err;
      }
    }
    await conn.query('UPDATE time_slots SET booked_count = booked_count + 1 WHERE id = ?', [slotId]);

    const full = await getAppointment(id, conn);
    await notify(conn, citizenId, {
      appointmentId: id, type: status === 'Pending' ? 'appointment_pending' : 'appointment_confirmed',
      title: status === 'Pending' ? 'Appointment received' : 'Appointment confirmed',
      message: `Your appointment ${describe(full)} ${status === 'Pending' ? 'was received and is awaiting confirmation by the office.' : 'is confirmed.'}`,
    });
    await audit(req, 'APPOINTMENT_BOOKED', 'appointment', id, { reference: full.reference, service: full.service_name, office: full.office_name, status }, conn);
    return { id, replay: false };
  });
  // Only now - after COMMIT - do we read the record back and report success.
  const appointment = await getAppointment(result.id);
  if (!appointment) throw new Error('Booking could not be verified');
  return { appointment, replay: result.replay };
}

// ----------------------------------------------------------------------------------------------------------------
async function lockAppointment(conn, id) {
  const [[a]] = await conn.query('SELECT * FROM appointments WHERE id = ? FOR UPDATE', [id]);
  if (!a) throw notFound('Appointment not found');
  return a;
}

async function releaseSlot(conn, slotId) {
  await conn.query('SELECT id FROM time_slots WHERE id = ? FOR UPDATE', [slotId]);
  await conn.query('UPDATE time_slots SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = ?', [slotId]);
}

async function cancel(req, id, reason) {
  const user = req.user;
  const text = reason ? String(reason).trim().slice(0, 300) : '';
  if (user.role !== 'citizen' && text.length < 3) throw badRequest('Please record a reason for the cancellation');
  await withTransaction(async (conn) => {
    const a = await lockAppointment(conn, id);
    assertCanAccess(user, a);
    const allowed = user.role === 'citizen' ? ['Pending', 'Confirmed'] : ['Pending', 'Confirmed', 'Checked In'];
    if (!allowed.includes(a.status)) throw conflict(`An appointment that is "${a.status}" cannot be cancelled.`);
    await releaseSlot(conn, a.slot_id); // capacity is released immediately
    await conn.query(`UPDATE appointments SET status = 'Cancelled', cancel_reason = ?, cancelled_by = ?, cancelled_at = NOW() WHERE id = ?`,
      [text || 'Cancelled by citizen', user.id, id]);
    await conn.query(`UPDATE queue_records SET status = 'Skipped' WHERE appointment_id = ? AND status = 'Waiting'`, [id]);
    const full = await getAppointment(id, conn);
    await notify(conn, a.citizen_id, {
      appointmentId: id, type: 'appointment_cancelled', title: 'Appointment cancelled',
      message: `Your appointment ${describe(full)} was cancelled${user.role === 'citizen' ? '' : ' by the office'}. Reason: ${text || 'Cancelled by citizen'}.`,
    });
    await audit(req, 'APPOINTMENT_CANCELLED', 'appointment', id, { reference: a.reference, reason: text, by: user.role }, conn);
  });
  return getAppointment(id);
}

async function reschedule(req, id, newSlotId, reason) {
  await withTransaction(async (conn) => {
    const a = await lockAppointment(conn, id);
    assertCanAccess(req.user, a);
    if (!['Pending', 'Confirmed'].includes(a.status)) throw conflict(`An appointment that is "${a.status}" cannot be rescheduled.`);
    if (Number(newSlotId) === a.slot_id) throw badRequest('Please choose a different time slot.');
    const ids = [a.slot_id, Number(newSlotId)].sort((x, y) => x - y); // lock in id order - deadlock safe
    const [locked] = await conn.query('SELECT id, office_id, schedule_id, slot_date, start_time, capacity, booked_count, is_active FROM time_slots WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
    const next = locked.find((s) => s.id === Number(newSlotId));
    if (!next || next.office_id !== a.office_id) throw badRequest('The new slot must belong to the same office.');
    const [[sched]] = await conn.query('SELECT is_closed FROM appointment_schedules WHERE id = ?', [next.schedule_id]);
    const [[future]] = await conn.query('SELECT TIMESTAMP(?, ?) > NOW() AS ok', [next.slot_date, next.start_time]);
    if (!next.is_active || sched.is_closed) throw conflict('The new slot is not available.');
    if (!future.ok) throw badRequest('The new slot is in the past.');
    if (next.booked_count >= next.capacity) throw conflict('The new slot is already full.', { code: 'SLOT_FULL' });
    await conn.query('UPDATE time_slots SET booked_count = booked_count + 1 WHERE id = ?', [next.id]);
    await conn.query('UPDATE time_slots SET booked_count = GREATEST(booked_count - 1, 0) WHERE id = ?', [a.slot_id]);
    await conn.query('UPDATE appointments SET slot_id = ?, appointment_date = ?, appointment_time = ? WHERE id = ?', [next.id, next.slot_date, next.start_time, id]);
    const full = await getAppointment(id, conn);
    await notify(conn, a.citizen_id, {
      appointmentId: id, type: 'appointment_updated', title: 'Appointment rescheduled',
      message: `Your appointment was moved. New details: ${describe(full)}.${reason ? ' Reason: ' + reason : ''}`,
    });
    await audit(req, 'APPOINTMENT_RESCHEDULED', 'appointment', id, { reference: a.reference, from: `${a.appointment_date} ${a.appointment_time}`, to: `${next.slot_date} ${next.start_time}`, reason }, conn);
  });
  return getAppointment(id);
}

// ---------------- staff workflow: confirm -> check in -> in progress -> completed -------------------------------
async function transition(req, id, action, opts = {}) {
  await withTransaction(async (conn) => {
    const a = await lockAppointment(conn, id);
    assertCanAccess(req.user, a);
    const full0 = await getAppointment(id, conn);
    const today = (await conn.query('SELECT CURDATE() AS d'))[0][0].d;
    const apptDay = String(a.appointment_date).slice(0, 10);
    const bad = (msg) => conflict(msg || `This appointment is "${a.status}" so that action is not possible.`);
    let notice = null;

    if (action === 'confirm') {
      if (a.status !== 'Pending') throw bad();
      await conn.query(`UPDATE appointments SET status = 'Confirmed' WHERE id = ?`, [id]);
      notice = { type: 'appointment_confirmed', title: 'Appointment confirmed', message: `Good news - your appointment ${describe(full0)} has been confirmed.` };
    } else if (action === 'checkin') {
      if (a.status === 'Pending') throw bad('This booking is still Pending. Confirm it before checking the citizen in.');
      if (a.status !== 'Confirmed') throw bad();
      if (apptDay !== today) throw bad(`This appointment is for ${apptDay}, not today. Citizens can only be checked in on the day.`);
      await conn.query('SELECT id FROM government_offices WHERE id = ? FOR UPDATE', [a.office_id]); // serialises queue numbering
      const [[n]] = await conn.query('SELECT COALESCE(MAX(queue_number), 0) + 1 AS next FROM queue_records WHERE office_id = ? AND queue_date = ?', [a.office_id, today]);
      await conn.query('INSERT INTO queue_records (appointment_id, office_id, queue_date, queue_number, status, checked_in_at) VALUES (?,?,?,?,?,NOW())', [id, a.office_id, today, n.next, 'Waiting']);
      await conn.query(`UPDATE appointments SET status = 'Checked In' WHERE id = ?`, [id]);
      notice = { type: 'queue_update', title: 'You are checked in', message: `Your queue number is ${queueLabel(n.next)} for appointment ${a.reference}. Please wait to be called.` };
    } else if (action === 'start') {
      if (a.status !== 'Checked In') throw bad('Only citizens who are checked in can be served.');
      await conn.query(`UPDATE appointments SET status = 'In Progress' WHERE id = ?`, [id]);
      await conn.query(`UPDATE queue_records SET status = 'Serving', started_at = NOW(), served_by = ?, counter = ? WHERE appointment_id = ?`, [req.user.id, opts.counter || 'Counter 1', id]);
      notice = { type: 'queue_update', title: 'It is your turn', message: `You are now being served for appointment ${a.reference} at ${opts.counter || 'Counter 1'}.` };
    } else if (action === 'complete') {
      if (a.status !== 'In Progress') throw bad('Only an appointment that is In Progress can be completed.');
      await conn.query(`UPDATE appointments SET status = 'Completed', completed_at = NOW() WHERE id = ?`, [id]);
      await conn.query(`UPDATE queue_records SET status = 'Completed', completed_at = NOW() WHERE appointment_id = ?`, [id]);
      notice = { type: 'appointment_completed', title: 'Appointment completed', message: `Your appointment ${describe(full0)} was completed. Thank you for using GovBook.` };
    } else if (action === 'noshow') {
      if (!['Pending', 'Confirmed', 'Checked In'].includes(a.status)) throw bad();
      if (apptDay > today) throw bad('An appointment in the future cannot be marked as a no-show.');
      await conn.query(`UPDATE appointments SET status = 'No Show' WHERE id = ?`, [id]);
      await conn.query(`UPDATE queue_records SET status = 'Skipped' WHERE appointment_id = ? AND status = 'Waiting'`, [id]);
      notice = { type: 'appointment_noshow', title: 'Appointment missed', message: `You did not attend appointment ${describe(full0)}. Please book a new appointment if you still need the service.` };
    } else throw badRequest('Unknown action');

    if (notice) await notify(conn, a.citizen_id, { appointmentId: id, ...notice });
    await audit(req, `APPOINTMENT_${action.toUpperCase()}`, 'appointment', id, { reference: a.reference, from: a.status }, conn);
  });
  return getAppointment(id);
}

/** Calls the next waiting citizen of an office (lowest queue number first). */
async function callNext(req, officeId, counter) {
  const id = await withTransaction(async (conn) => {
    await conn.query('SELECT id FROM government_offices WHERE id = ? FOR UPDATE', [officeId]);
    const [[nxt]] = await conn.query(
      `SELECT q.appointment_id FROM queue_records q JOIN appointments a ON a.id = q.appointment_id
        WHERE q.office_id = ? AND q.queue_date = CURDATE() AND q.status = 'Waiting' AND a.status = 'Checked In'
        ORDER BY q.queue_number LIMIT 1`, [officeId]);
    return nxt ? nxt.appointment_id : null;
  });
  if (!id) throw notFound('No citizens are waiting in the queue.');
  return transition(req, id, 'start', { counter });
}

// ---------------- listing ----------------------------------------------------------------------------------------
async function listAppointments({ citizenId, officeId, serviceId, date, from, to, statuses, q, limit = 25, offset = 0, upcomingOnly, pastOnly, order }) {
  const where = []; const p = [];
  if (citizenId) { where.push('a.citizen_id = ?'); p.push(citizenId); }
  if (officeId) { where.push('a.office_id = ?'); p.push(officeId); }
  if (serviceId) { where.push('a.service_id = ?'); p.push(serviceId); }
  if (date) { where.push('a.appointment_date = ?'); p.push(date); }
  if (from) { where.push('a.appointment_date >= ?'); p.push(from); }
  if (to) { where.push('a.appointment_date <= ?'); p.push(to); }
  if (statuses && statuses.length) { where.push('a.status IN (?)'); p.push(statuses); }
  if (upcomingOnly) where.push(`a.status IN ('Pending','Confirmed','Checked In','In Progress') AND TIMESTAMP(a.appointment_date, a.appointment_time) >= (NOW() - INTERVAL 12 HOUR)`);
  if (pastOnly) where.push(`NOT (a.status IN ('Pending','Confirmed','Checked In','In Progress') AND TIMESTAMP(a.appointment_date, a.appointment_time) >= (NOW() - INTERVAL 12 HOUR))`);
  if (q) {
    const like = `%${String(q).replace(/[\\%_]/g, (m) => '\\' + m)}%`;
    where.push('(a.reference LIKE ? OR u.full_name LIKE ? OR u.email LIKE ? OR u.national_id LIKE ? OR s.name LIKE ?)');
    p.push(like, like, like, like, like);
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const dir = order === 'asc' ? 'ASC' : 'DESC';
  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM appointments a JOIN users u ON u.id = a.citizen_id JOIN government_services s ON s.id = a.service_id ${w}`, p);
  const [rows] = await pool.query(`${DETAIL_SQL} ${w} ORDER BY a.appointment_date ${dir}, a.appointment_time ${dir}, a.id ${dir} LIMIT ? OFFSET ?`, [...p, Number(limit), Number(offset)]);
  return { total, rows: rows.map(shape) };
}

module.exports = { book, cancel, reschedule, transition, callNext, getAppointment, listAppointments, queueProgress, assertCanAccess, queueLabel };
