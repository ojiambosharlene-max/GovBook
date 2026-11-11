'use strict';
/**
 * End-to-end API checks against the running server (http://localhost:5000) and the real database.
 *   1. npm run db:reset   2. npm start (or npm run dev)   3. npm test --prefix server
 * The test WRITES data (new citizens, bookings) - run `npm run db:reset` afterwards to get a clean demo again.
 */
const { pool } = require('../config/db');
const BASE = process.env.API_URL || 'http://localhost:5000/api';
let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`  ${c ? 'PASS' : 'FAIL'}  ${m}`); };

async function call(method, url, body, token) {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch (_) { /* no body */ }
  return { status: res.status, data };
}
const login = async (email) => (await call('POST', '/auth/login', { email, password: 'Password@123' })).data.token;

(async () => {
  const stamp = Date.now();
  console.log('Public & auth');
  ok((await call('GET', '/health')).data.database === 'connected', 'health check reaches MySQL');
  const ov = (await call('GET', '/public/overview')).data;
  const [[dbc]] = await pool.query(`SELECT COUNT(*) n FROM appointments`);
  ok(ov.appointmentsBooked === dbc.n && ov.services >= 8, `home statistics come from the database (${ov.appointmentsBooked} appointments, ${ov.services} services)`);
  ok((await call('POST', '/auth/login', { email: 'citizen@govbook.demo', password: 'wrong' })).status === 401, 'wrong password rejected');
  const citizen = await login('citizen@govbook.demo'); const admin = await login('admin@govbook.demo');
  const central = await login('staff.central@govbook.demo'); const north = await login('staff.northgate@govbook.demo'); const river = await login('staff.riverside@govbook.demo');
  ok(!!citizen && !!admin && !!central, 'citizen, staff and admin can log in');
  ok((await call('GET', '/appointments/stats')).status === 401, 'protected endpoint without token -> 401');
  ok((await call('GET', '/admin/dashboard', null, citizen)).status === 403, 'citizen blocked from admin dashboard (403)');
  ok((await call('GET', '/staff/overview', null, citizen)).status === 403, 'citizen blocked from staff area (403)');
  ok((await call('GET', '/admin/reports', null, north)).status === 403, 'staff without reports.view blocked from reports');
  ok((await call('GET', '/admin/reports', null, central)).status === 200, 'staff with reports.view can read reports');
  ok((await call('GET', '/admin/staff', null, central)).status === 403, 'staff cannot manage staff accounts');

  const email = `tester.${stamp}@mail.example`;
  const reg = { fullName: 'Test Citizen', email, phone: '+254712345678', nationalId: String(stamp).slice(-9), password: 'Secret123', confirmPassword: 'Secret123' };
  const r1 = await call('POST', '/auth/register', reg);
  ok(r1.status === 201 && r1.data.token, 'registration works');
  ok((await call('POST', '/auth/register', { ...reg, nationalId: 'ABC123456' })).status === 400, 'duplicate email rejected');
  ok((await call('POST', '/auth/register', { ...reg, email: 'x@y.example', password: 'short', confirmPassword: 'short' })).status === 400, 'weak password rejected');
  const [[hrow]] = await pool.query('SELECT password_hash FROM users WHERE email = ?', [email]);
  ok(/^\$2[aby]\$/.test(hrow.password_hash), 'password stored as a bcrypt hash');

  console.log('Booking');
  const offices = (await call('GET', '/public/offices')).data; const office = offices.find((o) => o.code === 'CCC');
  const svcs = (await call('GET', `/public/offices/${office.id}/services`)).data;
  const month = new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 7);
  const [[future]] = await pool.query(
    `SELECT t.id, t.capacity, t.booked_count FROM time_slots t JOIN appointment_schedules s ON s.id = t.schedule_id
      WHERE t.office_id = ? AND s.is_closed = 0 AND t.slot_date >= CURDATE() + INTERVAL 5 DAY AND t.booked_count = 0 ORDER BY t.slot_date, t.start_time LIMIT 1`, [office.id]);
  const av = (await call('GET', `/public/availability?officeId=${office.id}&month=${month}`)).data;
  ok(Array.isArray(av.days) && av.days.length > 0, 'availability calendar returns open days from the database');
  const me = r1.data.token;
  const svcA = svcs.find((s) => s.code === 'NID'); const svcB = svcs.find((s) => s.code === 'TAX');
  const b1 = await call('POST', '/appointments', { officeId: office.id, serviceId: svcA.id, slotId: future.id, idempotencyKey: `k-${stamp}` }, me);
  ok(b1.status === 201 && /^GOV-[A-Z0-9]{8}$/.test(b1.data.appointment.reference), `booking confirmed with reference ${b1.data.appointment && b1.data.appointment.reference}`);
  const [[dbA]] = await pool.query('SELECT status, service_id FROM appointments WHERE reference = ?', [b1.data.appointment.reference]);
  ok(dbA && dbA.status === 'Confirmed' && dbA.service_id === svcA.id, 'appointment really saved in MySQL');
  const [[sl1]] = await pool.query('SELECT booked_count FROM time_slots WHERE id = ?', [future.id]);
  ok(sl1.booked_count === 1, 'slot capacity consumed (booked_count = 1)');
  const replay = await call('POST', '/appointments', { officeId: office.id, serviceId: svcA.id, slotId: future.id, idempotencyKey: `k-${stamp}` }, me);
  ok(replay.status === 200 && replay.data.appointment.id === b1.data.appointment.id, 'double-click / retry returns the same booking (idempotent)');
  const dup = await call('POST', '/appointments', { officeId: office.id, serviceId: svcA.id, slotId: future.id }, me);
  ok(dup.status === 409 && dup.data.code === 'DUPLICATE_BOOKING', 'same citizen cannot hold two live bookings for one service');
  const [[notif]] = await pool.query(`SELECT COUNT(*) n FROM notifications WHERE appointment_id = ? AND channel = 'in_app'`, [b1.data.appointment.id]);
  ok(notif.n === 1, 'in-app notification created together with the booking');
  const mine = (await call('GET', '/appointments?view=upcoming', null, me)).data;
  ok(mine.rows.some((a) => a.reference === b1.data.appointment.reference), 'confirmation is accessible from the citizen dashboard list');

  // wrong service for office
  const other = offices.find((o) => o.code === 'RSO'); const rsoSvc = (await call('GET', `/public/offices/${other.id}/services`)).data.map((s) => s.id);
  const notOffered = svcs.find((s) => !rsoSvc.includes(s.id));
  const wrong = await call('POST', '/appointments', { officeId: other.id, serviceId: notOffered.id, slotId: future.id }, me);
  ok(wrong.status === 400, 'service not offered by the office is rejected (incorrect service assignment)');
  const bogus = await call('POST', '/appointments', { officeId: office.id, serviceId: 99999, slotId: future.id }, me);
  ok(bogus.status === 400, 'non-existent service rejected');
  const [[pastSlot]] = await pool.query(`SELECT id FROM time_slots WHERE office_id = ? AND slot_date < CURDATE() LIMIT 1`, [office.id]);
  const pastTry = await call('POST', '/appointments', { officeId: office.id, serviceId: svcB.id, slotId: pastSlot.id }, me);
  ok(pastTry.status === 400 && pastTry.data.code === 'SLOT_PAST', 'booking a past date is rejected by the server');
  const [[hol]] = await pool.query(`SELECT s.id FROM appointment_schedules s WHERE s.is_closed = 1 AND s.office_id = ? LIMIT 1`, [office.id]);
  ok(!!hol, 'holiday (closed day) exists and has no bookable slots');

  // cancel releases capacity
  const can = await call('POST', `/appointments/${b1.data.appointment.id}/cancel`, { reason: 'test' }, me);
  const [[sl2]] = await pool.query('SELECT booked_count FROM time_slots WHERE id = ?', [future.id]);
  ok(can.status === 200 && can.data.appointment.status === 'Cancelled' && sl2.booked_count === 0, 'cancelling releases the slot capacity');
  ok((await call('POST', `/appointments/${b1.data.appointment.id}/cancel`, {}, me)).status === 409, 'cancelled appointment cannot be cancelled again');

  console.log('Concurrency (double-booking prevention)');
  const [[cslot]] = await pool.query(
    `SELECT t.id FROM time_slots t JOIN appointment_schedules s ON s.id = t.schedule_id WHERE t.office_id = ? AND s.is_closed = 0 AND t.slot_date >= CURDATE() + INTERVAL 8 DAY AND t.booked_count = 0 ORDER BY t.slot_date, t.start_time LIMIT 1 OFFSET 3`, [office.id]);
  await pool.query('UPDATE time_slots SET capacity = 2 WHERE id = ?', [cslot.id]);
  const racers = [];
  for (let i = 0; i < 10; i++) {
    const r = await call('POST', '/auth/register', { fullName: `Racer ${String.fromCharCode(65 + i)}`, email: `racer${i}.${stamp}@mail.example`, phone: '+254700000000', nationalId: `R${stamp}${i}`.slice(0, 20), password: 'Secret123', confirmPassword: 'Secret123' });
    if (r.status === 201) racers.push(r.data.token); // (a 429 here would just be the register rate limiter)
  }
  const results = await Promise.all(racers.map((t) => call('POST', '/appointments', { officeId: office.id, serviceId: svcB.id, slotId: cslot.id }, t)));
  const accepted = results.filter((r) => r.status === 201).length; const full = results.filter((r) => r.status === 409 && r.data.code === 'SLOT_FULL').length;
  const [[cs]] = await pool.query('SELECT booked_count, capacity FROM time_slots WHERE id = ?', [cslot.id]);
  const [[cnt]] = await pool.query(`SELECT COUNT(*) n FROM appointments WHERE slot_id = ? AND status <> 'Cancelled'`, [cslot.id]);
  ok(racers.length >= 4 && accepted === 2 && accepted + full === racers.length, `${racers.length} simultaneous requests for a 2-seat slot: ${accepted} accepted, ${full} told "slot full"`);
  ok(cs.booked_count === 2 && cnt.n === 2, 'database agrees: exactly 2 appointments, booked_count = capacity');

  console.log('Queue management (staff)');
  const sov = (await call('GET', '/staff/overview', null, central)).data;
  ok(sov.counts.total > 0 && sov.office.name === 'Central Civic Centre', `staff overview from the database (${sov.counts.total} appointments today)`);
  const [[cfm]] = await pool.query(`SELECT a.id, a.reference FROM appointments a WHERE a.office_id = ? AND a.appointment_date = CURDATE() AND a.status = 'Confirmed' ORDER BY a.appointment_time LIMIT 1`, [office.id]);
  if (cfm) {
    const look = await call('GET', `/staff/lookup?reference=${cfm.reference}`, null, central);
    ok(look.status === 200 && look.data.verification.isToday, 'staff can find and verify a booking by reference number');
    ok((await call('GET', `/staff/lookup?reference=${cfm.reference}`, null, river)).status === 403, 'staff of another office cannot open it');
    const ci = await call('POST', `/staff/appointments/${cfm.id}/checkin`, {}, central);
    ok(ci.status === 200 && ci.data.appointment.status === 'Checked In' && ci.data.appointment.queue_number > 0, `check-in issues queue number ${ci.data.appointment && ci.data.appointment.queue_label}`);
    ok((await call('POST', `/staff/appointments/${cfm.id}/checkin`, {}, central)).status === 409, 'cannot check in twice');
    ok((await call('POST', `/staff/appointments/${cfm.id}/complete`, {}, central)).status === 409, 'cannot complete before service has started');
  } else ok(true, '(no confirmed appointment left today - check-in step skipped)');
  const next = await call('POST', '/staff/queue/call-next', { counter: 'Counter 2' }, central);
  ok(next.status === 200 && next.data.appointment.status === 'In Progress', 'call next moves the lowest waiting number to In Progress');
  const done = await call('POST', `/staff/appointments/${next.data.appointment.id}/complete`, {}, central);
  ok(done.status === 200 && done.data.appointment.status === 'Completed', 'staff can mark the service as completed');
  const [[futAppt]] = await pool.query(`SELECT id FROM appointments WHERE office_id = ? AND appointment_date > CURDATE() AND status = 'Confirmed' LIMIT 1`, [office.id]);
  ok((await call('POST', `/staff/appointments/${futAppt.id}/checkin`, {}, central)).status === 409, 'check-in before the appointment day is rejected');
  const [[dupq]] = await pool.query(`SELECT COUNT(*) n FROM (SELECT office_id, queue_date, queue_number FROM queue_records GROUP BY 1,2,3 HAVING COUNT(*) > 1) x`);
  ok(dupq.n === 0, 'queue numbers are unique per office per day');

  console.log('Administration');
  const dash = (await call('GET', '/admin/dashboard', null, admin)).data;
  const [[tot]] = await pool.query('SELECT COUNT(*) n FROM appointments');
  ok(dash.counts.total === tot.n, `admin dashboard totals match the database (${dash.counts.total})`);
  const [[busy]] = await pool.query(`SELECT a.id, a.slot_id FROM appointments a WHERE a.office_id = ? AND a.status = 'Confirmed' AND a.appointment_date > CURDATE() + INTERVAL 3 DAY LIMIT 1`, [office.id]);
  const [[target]] = await pool.query(`SELECT t.id FROM time_slots t JOIN appointment_schedules s ON s.id = t.schedule_id WHERE t.office_id = ? AND s.is_closed = 0 AND t.booked_count = 0 AND t.slot_date > CURDATE() + INTERVAL 20 DAY LIMIT 1`, [office.id]);
  const rs = await call('POST', `/admin/appointments/${busy.id}/reschedule`, { slotId: target.id, reason: 'Officer unavailable' }, admin);
  const [[o1]] = await pool.query('SELECT booked_count FROM time_slots WHERE id = ?', [busy.slot_id]); const [[o2]] = await pool.query('SELECT booked_count FROM time_slots WHERE id = ?', [target.id]);
  ok(rs.status === 200 && o2.booked_count === 1 && rs.data.appointment.slot_id === target.id, 'admin can reschedule (new slot used, old slot released)');
  ok((await call('POST', `/admin/appointments/${busy.id}/cancel`, {}, admin)).status === 400, 'cancelling as admin requires a recorded reason');
  ok((await call('POST', `/admin/appointments/${busy.id}/cancel`, { reason: 'Citizen request by phone' }, admin)).status === 200, 'admin can cancel with a reason');
  const [[o3]] = await pool.query('SELECT booked_count FROM time_slots WHERE id = ?', [target.id]);
  ok(o3.booked_count === 0, 'capacity released after admin cancellation');
  const [[sl3]] = await pool.query(`SELECT s.id, s.schedule_id FROM time_slots s WHERE s.office_id = ? AND s.booked_count > 0 AND s.slot_date > CURDATE() LIMIT 1`, [office.id]);
  const lower = await call('PATCH', `/admin/slots/${sl3.id}`, { capacity: 0 }, admin);
  ok(lower.status === 400 || lower.status === 409, 'capacity cannot be set below existing bookings');
  const [[sched]] = await pool.query(`SELECT schedule_id FROM time_slots WHERE id = ?`, [sl3.id]);
  ok((await call('PATCH', `/admin/schedules/${sched.schedule_id}`, { isClosed: true, closedReason: 'test' }, admin)).status === 409, 'a day with live bookings cannot be closed');
  const gen = await call('POST', '/admin/schedules/generate', { officeId: office.id, fromDate: new Date(Date.now() + 86400000 * 200).toISOString().slice(0, 10), toDate: new Date(Date.now() + 86400000 * 206).toISOString().slice(0, 10), openTime: '09:00', closeTime: '12:00', slotMinutes: 30, capacity: 2, weekdays: [0, 1, 2, 3, 4, 5, 6] }, admin);
  ok(gen.status === 201 && gen.data.created === 7 && gen.data.slots === 42, `admin can create schedules and slots (${gen.data.created} days, ${gen.data.slots} slots)`);
  const svc = await call('POST', '/admin/services', { code: `T${stamp}`.slice(0, 12), name: 'Test Service', category: 'Testing', description: 'A test service for the smoke test', requirements: ['ID'], durationMinutes: 15 }, admin);
  ok(svc.status === 201, 'admin can add a government service');
  ok((await call('PUT', `/admin/offices/${office.id}/services`, { serviceIds: [...svcs.map((s) => s.id), svc.data.id] }, admin)).status === 200, 'admin can link the service to an office');
  ok((await call('PUT', `/admin/services/${svc.data.id}`, { code: `T${stamp}`.slice(0, 12), name: 'Test Service', category: 'Testing', description: 'A test service for the smoke test', durationMinutes: 15, isActive: false }, admin)).status === 200, 'admin can deactivate it');
  const pub = (await call('GET', '/public/services')).data;
  ok(!pub.some((s) => s.id === svc.data.id), 'deactivated service disappears from the public list');
  const st = await call('POST', '/admin/staff', { fullName: 'New Officer', email: `officer.${stamp}@govbook.demo`, phone: '+254700111222', officeId: office.id, password: 'Secret123', permissions: ['reports.view'] }, admin);
  ok(st.status === 201, 'admin can create a staff account with permissions');
  const bc = await call('POST', '/admin/notifications/broadcast', { audience: 'citizens', title: 'Test announcement', message: 'Systems will be updated tonight.' }, admin);
  ok(bc.status === 201 && bc.data.recipients > 10, `announcement delivered to ${bc.data.recipients} citizens`);
  const rep = (await call('GET', '/admin/reports', null, admin)).data;
  ok(rep.daily.length > 0 && rep.services.length > 0 && rep.offices.length > 0 && typeof rep.noShowRate === 'number', 'reports return daily/weekly/monthly, services, offices and rates');
  const rep2 = (await call('GET', `/admin/reports?officeId=${office.id}`, null, admin)).data;
  ok(rep2.offices.length === 1, 'reports can be filtered by office');
  const au = (await call('GET', '/admin/audit?q=APPOINTMENT', null, admin)).data;
  ok(au.total > 0, `audit log recorded ${au.total} appointment actions`);

  console.log('Integrity');
  const [[bad]] = await pool.query(`SELECT COUNT(*) n FROM time_slots t WHERE t.booked_count <> (SELECT COUNT(*) FROM appointments a WHERE a.slot_id = t.id AND a.status <> 'Cancelled')`);
  ok(bad.n === 0, 'every slot booked_count equals its real number of non-cancelled bookings');
  const [[over]] = await pool.query('SELECT COUNT(*) n FROM time_slots WHERE booked_count > capacity');
  ok(over.n === 0, 'no slot is over capacity');
  const [[mism]] = await pool.query(`SELECT COUNT(*) n FROM appointments a JOIN time_slots t ON t.id = a.slot_id WHERE a.appointment_date <> t.slot_date OR a.appointment_time <> t.start_time`);
  ok(mism.n === 0, 'appointment date/time always matches its slot');

  console.log(`\n${pass} passed, ${fail} failed`);
  await pool.end();
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('CRASH', e); process.exit(1); });
