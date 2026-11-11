import { useState } from 'react';
import { CalendarCheck, CheckCircle2, Hourglass, ListOrdered, PhoneCall, Play, Search, Ticket, UserCheck, UserX, Users, BadgeCheck, XCircle, Clock } from 'lucide-react';
import { Alert, EmptyState, ErrorState, PageHead, PageLoading, SearchBox, StatusBadge } from '../../components/ui.jsx';
import { DateChip } from '../../components/AppointmentCard.jsx';
import { useDebounced, useFetch } from '../../hooks/useFetch.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, qs } from '../../services/api.js';
import { fmtDateLong, fmtDateTime, fmtTime, todayISO } from '../../utils/format.js';

/** Staff are tied to one office; administrators choose which office they are looking at. */
function useOfficeChoice() {
  const { user } = useAuth();
  const offices = useFetch(user.role === 'admin' ? '/admin/offices' : null);
  const [picked, setPicked] = useState('');
  const officeId = user.role === 'staff' ? user.officeId : (picked || offices.data?.[0]?.id || '');
  const selector = user.role === 'admin' && offices.data ? (
    <select className="select" value={officeId} onChange={(e) => setPicked(e.target.value)} aria-label="Office">
      {offices.data.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
    </select>
  ) : null;
  return { officeId, selector, ready: user.role === 'staff' || !!officeId };
}

function RowActions({ a, onDone, officeId, counter = 'Counter 1' }) {
  const toast = useToast(); const [busy, setBusy] = useState(false);
  const isToday = String(a.appointment_date).slice(0, 10) === todayISO();
  const run = async (action, msg) => {
    setBusy(true);
    try { await api.post(`/staff/appointments/${a.id}/${action}`, { counter, officeId }); toast.success(msg); onDone && onDone(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="actions">
      {a.status === 'Pending' && <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run('confirm', `${a.reference} confirmed.`)}><BadgeCheck size={15} /> Confirm</button>}
      {a.status === 'Confirmed' && <button className="btn btn-primary btn-sm" disabled={busy || !isToday} title={isToday ? '' : 'Only possible on the day of the appointment'} onClick={() => run('checkin', 'Citizen checked in - queue number issued.')}><UserCheck size={15} /> Check in</button>}
      {a.status === 'Checked In' && <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => run('start', 'Service started.')}><Play size={15} /> Start</button>}
      {a.status === 'In Progress' && <button className="btn btn-success btn-sm" disabled={busy} onClick={() => run('complete', 'Appointment completed.')}><CheckCircle2 size={15} /> Complete</button>}
      {['Pending', 'Confirmed', 'Checked In'].includes(a.status) && String(a.appointment_date).slice(0, 10) <= todayISO() && <button className="btn btn-ghost btn-sm" disabled={busy} onClick={() => run('noshow', 'Marked as no-show.')}><UserX size={15} /> No-show</button>}
    </div>
  );
}

function Board({ o }) {
  const c = o.counts;
  return (
    <div className="board page-enter">
      <div className="board-tile now"><div className="muted small">Now serving</div><div className="big" data-testid="now-serving">{o.currentLabel || '--'}</div><div className="muted small">Last number issued: {o.lastIssued ? `Q-${String(o.lastIssued).padStart(3, '0')}` : '-'}</div></div>
      <div className="board-tile"><div className="muted small">Citizens waiting</div><div className="big">{c.waiting}</div><div className="muted small">checked in</div></div>
      <div className="board-tile"><div className="muted small">Being served</div><div className="big">{c.serving}</div><div className="muted small">at counters</div></div>
      <div className="board-tile"><div className="muted small">Completed</div><div className="big">{c.completed}</div><div className="muted small">of {c.total} booked</div></div>
    </div>
  );
}

export function StaffToday() {
  const { user } = useAuth(); const { officeId, selector, ready } = useOfficeChoice();
  const [date, setDate] = useState(todayISO()); const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const dq = useDebounced(q);
  const ov = useFetch(ready ? `/staff/overview${qs({ officeId, date })}` : null, { poll: 10000 });
  const list = useFetch(ready ? `/staff/appointments${qs({ officeId, date, q: dq, status })}` : null, { poll: 10000 });
  const reload = () => { ov.refresh(); list.refresh(); };

  return (
    <>
      <PageHead title="Today's schedule" subtitle={ov.data ? `${ov.data.office.name} - ${fmtDateLong(date)}` : 'Appointments at your office'}>
        {selector}<input type="date" className="input" style={{ width: 'auto' }} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="Date" />
      </PageHead>
      {user.role === 'staff' && !user.officeId && <Alert>Your account is not assigned to an office yet.</Alert>}
      {ov.loading && !ov.data ? <PageLoading /> : ov.error ? <ErrorState error={ov.error} onRetry={ov.reload} /> : ov.data && <Board o={ov.data} />}

      <div className="card mt">
        <div className="card-head"><h3>Appointments {list.data ? `(${list.data.total})` : ''}</h3></div>
        <div className="toolbar">
          <SearchBox value={q} onChange={setQ} placeholder="Search reference, name or ID number" />
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">All statuses</option>{['Pending', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'].map((s) => <option key={s}>{s}</option>)}</select>
        </div>
        {list.loading && !list.data ? <PageLoading /> : list.error ? <ErrorState error={list.error} onRetry={list.reload} /> : list.data.rows.length === 0 ? <EmptyState icon={CalendarCheck} title="No appointments" text="Nothing matches this day or search." /> : (
          <div className="table-wrap"><table className="table">
            <thead><tr><th>Time</th><th>Citizen</th><th>Service</th><th>Reference</th><th>Queue</th><th>Status</th><th /></tr></thead>
            <tbody>
              {list.data.rows.map((a) => (
                <tr key={a.id}>
                  <td className="strong">{fmtTime(a.appointment_time)}</td>
                  <td><div className="cell-title">{a.citizen_name}</div><div className="cell-sub">{a.citizen_phone}</div></td>
                  <td>{a.service_name}</td><td><span className="ref-pill">{a.reference}</span></td><td>{a.queue_label || '-'}</td><td><StatusBadge status={a.status} /></td>
                  <td><RowActions a={a} onDone={reload} officeId={officeId} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

export function StaffQueue() {
  const { officeId, selector, ready } = useOfficeChoice(); const toast = useToast();
  const [counter, setCounter] = useState('Counter 1'); const [busy, setBusy] = useState(false);
  const ov = useFetch(ready ? `/staff/overview${qs({ officeId })}` : null, { poll: 6000 });
  const queue = useFetch(ready ? `/staff/queue${qs({ officeId })}` : null, { poll: 6000 });
  const reload = () => { ov.refresh(); queue.refresh(); };
  const callNext = async () => {
    setBusy(true);
    try { const r = await api.post('/staff/queue/call-next', { counter, officeId }); toast.success(`Now serving ${r.appointment.queue_label} (${r.appointment.citizen_name}) at ${counter}.`); reload(); } catch (e) { toast.error(e.message); } finally { setBusy(false); }
  };
  const rows = queue.data || [];
  const serving = rows.filter((r) => r.queue_status === 'Serving'); const waiting = rows.filter((r) => r.queue_status === 'Waiting'); const done = rows.filter((r) => ['Completed', 'Skipped'].includes(r.queue_status));
  const asAppt = (r) => ({ id: r.appointment_id, status: r.status, reference: r.reference, appointment_date: todayISO() });
  const Item = ({ r, cls }) => (
    <div className={`q-item ${cls}`}>
      <div className="q-num">{r.queue_label}</div>
      <div className="grow"><div className="strong">{r.citizen_name}</div><div className="muted small">{r.service_name} - booked {r.appointment_time}{r.counter ? ` - ${r.counter}` : ''}</div></div>
      {cls !== 'done' ? <RowActions a={asAppt(r)} onDone={reload} officeId={officeId} counter={counter} /> : <StatusBadge status={r.status} />}
    </div>
  );
  return (
    <>
      <PageHead title="Queue management" subtitle="Check-ins, queue numbers and who is being served right now.">{selector}</PageHead>
      {ov.data && <Board o={ov.data} />}
      <div className="card mt row between">
        <div className="row"><PhoneCall size={20} style={{ color: 'var(--primary)' }} /><div><div className="strong">Call the next citizen</div><div className="muted small">Takes the lowest waiting queue number and starts the service.</div></div></div>
        <div className="row">
          <select className="select" value={counter} onChange={(e) => setCounter(e.target.value)} aria-label="Counter" style={{ width: 'auto' }}>{['Counter 1', 'Counter 2', 'Counter 3', 'Counter 4'].map((c) => <option key={c}>{c}</option>)}</select>
          <button className="btn btn-primary" onClick={callNext} disabled={busy || waiting.length === 0} data-testid="call-next"><Play size={16} /> Call next ({waiting.length} waiting)</button>
        </div>
      </div>
      {queue.loading && !queue.data ? <PageLoading /> : (
        <div className="grid grid-3 mt" style={{ alignItems: 'start' }}>
          <div className="card"><div className="card-head"><h3>Being served</h3><span className="badge b-progress">{serving.length}</span></div>{serving.length ? serving.map((r) => <Item key={r.id} r={r} cls="serving" />) : <EmptyState icon={Hourglass} title="Nobody is being served" />}</div>
          <div className="card"><div className="card-head"><h3>Waiting</h3><span className="badge b-checked">{waiting.length}</span></div>{waiting.length ? waiting.map((r) => <Item key={r.id} r={r} cls="" />) : <EmptyState icon={Users} title="Queue is empty" text="Citizens appear here once checked in." />}</div>
          <div className="card"><div className="card-head"><h3>Finished</h3><span className="badge b-completed">{done.length}</span></div>{done.length ? done.slice().reverse().map((r) => <Item key={r.id} r={r} cls="done" />) : <EmptyState icon={ListOrdered} title="No finished services yet" />}</div>
        </div>
      )}
    </>
  );
}

export function StaffSearch() {
  const toast = useToast();
  const [ref, setRef] = useState(''); const [busy, setBusy] = useState(false); const [res, setRes] = useState(null); const [error, setError] = useState('');
  const look = async (e) => {
    e && e.preventDefault(); const r = ref.trim().toUpperCase(); if (!r) return;
    setBusy(true); setError(''); setRes(null);
    try { setRes(await api.get(`/staff/lookup${qs({ reference: r })}`)); } catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  const a = res?.appointment; const v = res?.verification;
  const Check = ({ ok, label, detail }) => <div className="row" style={{ flexWrap: 'nowrap', gap: 10 }}>{ok ? <CheckCircle2 size={19} style={{ color: 'var(--success)' }} /> : <XCircle size={19} style={{ color: 'var(--danger)' }} />}<span className="strong">{label}</span><span className="muted small">{detail}</span></div>;
  return (
    <>
      <PageHead title="Find an appointment" subtitle="Enter the reference number the citizen shows you to verify their booking." />
      <form className="card row" onSubmit={look}>
        <div className="search" style={{ position: 'relative', flex: 1, minWidth: 220 }}><Search size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }} />
          <input className="input mono" style={{ paddingLeft: 40, textTransform: 'uppercase' }} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="GOV-XXXXXXXX" aria-label="Reference number" autoFocus /></div>
        <button className="btn btn-primary" disabled={busy || !ref.trim()}>{busy ? 'Searching...' : 'Find booking'}</button>
      </form>
      {error && <div className="mt"><Alert>{error}</Alert></div>}
      {a && (
        <div className="grid grid-main mt page-enter">
          <div className="card stack" style={{ gap: 16 }}>
            <div className="row between"><div className="row"><DateChip date={a.appointment_date} /><div><h3>{a.service_name}</h3><div className="muted small">{fmtDateLong(a.appointment_date)} at {fmtTime(a.appointment_time)}</div></div></div><StatusBadge status={a.status} /></div>
            <div className="summary-list">
              <div className="summary-row"><span>Reference</span><span className="mono">{a.reference}</span></div>
              <div className="summary-row"><span>Citizen</span><span>{a.citizen_name}</span></div>
              <div className="summary-row"><span>National ID</span><span>{a.citizen_national_id || '-'}</span></div>
              <div className="summary-row"><span>Phone / email</span><span>{a.citizen_phone}<br /><span className="muted small" style={{ fontWeight: 400 }}>{a.citizen_email}</span></span></div>
              <div className="summary-row"><span>Office</span><span>{a.office_name}</span></div>
              <div className="summary-row"><span>Booked on</span><span>{fmtDateTime(a.booked_at)}</span></div>
              {a.queue_label && <div className="summary-row"><span>Queue number</span><span>{a.queue_label}</span></div>}
              {a.notes && <div className="summary-row"><span>Notes</span><span>{a.notes}</span></div>}
            </div>
            {a.requirements?.length > 0 && <div><div className="strong small" style={{ marginBottom: 6 }}>Documents the citizen should bring</div><ul className="req-list">{a.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>}
          </div>
          <div className="stack" style={{ gap: 16 }}>
            <div className="verify-box stack" style={{ gap: 12 }}>
              <h3>Verification</h3>
              <Check ok label="Booking found" detail="Saved in the system" />
              <Check ok={v.isToday} label="Booked for today" detail={v.isToday ? 'Date matches' : `Booked for ${fmtDateLong(a.appointment_date)}`} />
              <Check ok={['Confirmed', 'Checked In', 'In Progress'].includes(a.status)} label="Status valid" detail={a.status} />
              <RowActions a={a} officeId={a.office_id} onDone={() => { look(); toast.info('Updated.'); }} />
            </div>
          </div>
        </div>
      )}
      {!a && !error && !busy && <div className="card mt"><EmptyState icon={Ticket} title="Ready to verify a booking" text="Type or scan the reference printed on the citizen's confirmation slip." /></div>}
    </>
  );
}
