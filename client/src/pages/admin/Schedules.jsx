import { useState } from 'react';
import { CalendarDays, CalendarPlus, Lock, LockOpen, Settings2, Gauge } from 'lucide-react';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Field, Modal, PageHead, PageLoading, Switch, TextInput } from '../../components/ui.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, qs } from '../../services/api.js';
import { fmtDate, isoDate, todayISO } from '../../utils/format.js';

const DAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [0, 'Sun']];

export default function AdminSchedules() {
  const { user } = useAuth(); const toast = useToast(); const isAdmin = user.role === 'admin';
  const offices = useFetch(isAdmin ? '/admin/offices' : null);
  const [officeId, setOfficeId] = useState('');
  const [from, setFrom] = useState(todayISO()); const [to, setTo] = useState(isoDate(new Date(Date.now() + 14 * 86400000)));
  const { data, loading, error, reload } = useFetch(`/admin/schedules${qs({ officeId, from, to })}`);
  const [gen, setGen] = useState(false); const [slotsFor, setSlotsFor] = useState(null); const [closing, setClosing] = useState(null); const [capFor, setCapFor] = useState(null);

  return (
    <>
      <PageHead title="Schedules & slots" subtitle="Open days, appointment slots and how many citizens each slot can take.">
        <button className="btn btn-primary" onClick={() => setGen(true)}><CalendarPlus size={17} /> Generate schedule</button>
      </PageHead>
      <div className="toolbar">
        {isAdmin && <select className="select" value={officeId} onChange={(e) => setOfficeId(e.target.value)} aria-label="Office"><option value="">All offices</option>{(offices.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
        <label className="row small muted">From <input type="date" className="input" style={{ width: 'auto' }} value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} /></label>
        <label className="row small muted">To <input type="date" className="input" style={{ width: 'auto' }} value={to} onChange={(e) => e.target.value && setTo(e.target.value)} /></label>
      </div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <div className="card"><EmptyState icon={CalendarDays} title="No schedules in this range" text="Use Generate schedule to open new days for booking." /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Date</th>{isAdmin && !officeId && <th>Office</th>}<th>Hours</th><th>Slots</th><th>Utilisation</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((s) => { const pct = s.capacity_total ? Math.round((s.booked_total / s.capacity_total) * 100) : 0; return (
            <tr key={s.id}><td><div className="cell-title">{fmtDate(s.schedule_date)}</div></td>{isAdmin && !officeId && <td>{s.office_name}</td>}<td>{s.open_time} - {s.close_time}<div className="cell-sub">{s.slot_minutes} min slots</div></td><td>{s.slot_count}<div className="cell-sub">{s.slot_capacity} per slot</div></td>
              <td style={{ minWidth: 140 }}><div className="small">{s.booked_total} / {s.capacity_total} ({pct}%)</div><div style={{ height: 6, borderRadius: 4, background: 'var(--surface-3)', marginTop: 4 }}><div style={{ height: 6, borderRadius: 4, width: `${pct}%`, background: pct > 85 ? 'var(--danger)' : 'var(--primary)' }} /></div></td>
              <td>{s.is_closed ? <span className="badge b-pending">Closed - {s.closed_reason}</span> : <span className="badge b-completed">Open</span>}</td>
              <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => setSlotsFor(s)}><Settings2 size={14} /> Slots</button><button className="btn btn-outline btn-sm" onClick={() => setCapFor(s)}><Gauge size={14} /> Capacity</button>
                {s.is_closed ? <button className="btn btn-success btn-sm" onClick={async () => { try { await api.patch(`/admin/schedules/${s.id}`, { isClosed: false }); toast.success('Day reopened.'); reload(); } catch (e) { toast.error(e.message); } }}><LockOpen size={14} /> Reopen</button>
                  : <button className="btn btn-danger btn-sm" onClick={() => setClosing(s)}><Lock size={14} /> Close</button>}</div></td></tr>); })}
        </tbody></table></div>
      )}
      {gen && <Generate offices={offices.data} isAdmin={isAdmin} onClose={(done) => { setGen(false); if (done) reload(); }} />}
      {slotsFor && <SlotsModal schedule={slotsFor} onClose={() => { setSlotsFor(null); reload(); }} />}
      {capFor && <CapacityModal schedule={capFor} onClose={(d) => { setCapFor(null); if (d) reload(); }} />}
      {closing && <ConfirmDialog title="Close this day?" danger confirmText="Close day" reasonLabel="Reason shown to citizens (e.g. Public holiday)" message={`No new bookings will be possible on ${fmtDate(closing.schedule_date)}. This only works if the day has no active appointments.`}
        onClose={() => setClosing(null)} onConfirm={async (reason) => { await api.patch(`/admin/schedules/${closing.id}`, { isClosed: true, closedReason: reason || 'Closed' }); toast.success('Day closed.'); reload(); }} />}
    </>
  );
}

function Generate({ offices, isAdmin, onClose }) {
  const toast = useToast();
  const [f, setF] = useState({ officeId: offices?.[0]?.id || '', fromDate: isoDate(new Date(Date.now() + 86400000)), toDate: isoDate(new Date(Date.now() + 28 * 86400000)), openTime: '08:30', closeTime: '16:30', slotMinutes: 30, capacity: 3, weekdays: [1, 2, 3, 4, 5], breakStart: '12:30', breakEnd: '13:00' });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const tog = (d) => setF({ ...f, weekdays: f.weekdays.includes(d) ? f.weekdays.filter((x) => x !== d) : [...f.weekdays, d] });
  const save = async () => {
    setBusy(true); setErr('');
    try { const r = await api.post('/admin/schedules/generate', f); toast.success(`${r.created} day(s) and ${r.slots} slots created${r.skipped ? ` (${r.skipped} existing day(s) skipped)` : ''}.`); onClose(true); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title="Generate schedule" onClose={() => onClose(false)} footer={<><button className="btn btn-outline" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Creating...' : 'Create schedule'}</button></>}>
      <div className="stack">{err && <Alert>{err}</Alert>}
        <p className="muted small">Creates open days and time slots. Days that already have a schedule are left untouched.</p>
        <div className="form-grid">
          {isAdmin && <Field label="Office" full><select className="select" value={f.officeId} onChange={set('officeId')}>{(offices || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>}
          <TextInput label="From date" type="date" value={f.fromDate} onChange={set('fromDate')} /><TextInput label="To date" type="date" value={f.toDate} onChange={set('toDate')} />
          <TextInput label="Opening time" type="time" value={f.openTime} onChange={set('openTime')} /><TextInput label="Closing time" type="time" value={f.closeTime} onChange={set('closeTime')} />
          <TextInput label="Slot length (minutes)" type="number" value={f.slotMinutes} onChange={set('slotMinutes')} /><TextInput label="Citizens per slot (capacity)" type="number" value={f.capacity} onChange={set('capacity')} />
          <TextInput label="Break from (optional)" type="time" value={f.breakStart} onChange={set('breakStart')} /><TextInput label="Break to" type="time" value={f.breakEnd} onChange={set('breakEnd')} />
        </div>
        <div><div className="label" style={{ marginBottom: 8 }}>Open on</div><div className="row">{DAYS.map(([d, l]) => <label key={d} className="checkbox"><input type="checkbox" checked={f.weekdays.includes(d)} onChange={() => tog(d)} />{l}</label>)}</div></div>
      </div>
    </Modal>
  );
}

function SlotsModal({ schedule, onClose }) {
  const toast = useToast(); const { data, loading, reload } = useFetch(`/admin/schedules/${schedule.id}/slots`);
  const [edits, setEdits] = useState({});
  const save = async (s) => {
    const e = edits[s.id] || {};
    try { await api.patch(`/admin/slots/${s.id}`, { capacity: e.capacity ?? s.capacity, isActive: e.isActive ?? s.is_active }); toast.success(`Slot ${s.start} updated.`); setEdits((x) => { const n = { ...x }; delete n[s.id]; return n; }); reload(); } catch (x) { toast.error(x.message); }
  };
  return (
    <Modal wide title={`Slots - ${fmtDate(schedule.schedule_date)}`} onClose={onClose}>
      {loading ? <PageLoading /> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Time</th><th>Booked</th><th>Capacity</th><th>Active</th><th /></tr></thead><tbody>
          {data.map((s) => { const e = edits[s.id] || {}; const dirty = e.capacity !== undefined || e.isActive !== undefined; return (
            <tr key={s.id}><td className="strong">{s.start} - {s.end}</td><td>{s.booked_count}</td>
              <td><input type="number" min="1" max="100" className="input" style={{ width: 90, minHeight: 36 }} aria-label={`Capacity ${s.start}`} value={e.capacity ?? s.capacity} onChange={(ev) => setEdits({ ...edits, [s.id]: { ...e, capacity: Number(ev.target.value) } })} /></td>
              <td><Switch checked={e.isActive ?? s.is_active} onChange={(v) => setEdits({ ...edits, [s.id]: { ...e, isActive: v } })} label="" /></td>
              <td><button className="btn btn-primary btn-sm" disabled={!dirty} onClick={() => save(s)}>Save</button></td></tr>); })}
        </tbody></table></div>
      )}
    </Modal>
  );
}

function CapacityModal({ schedule, onClose }) {
  const toast = useToast(); const [cap, setCap] = useState(schedule.slot_capacity); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => { setBusy(true); setErr(''); try { await api.patch(`/admin/schedules/${schedule.id}`, { slotCapacity: Number(cap) }); toast.success('Capacity updated for every slot of the day.'); onClose(true); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <Modal title={`Slot capacity - ${fmtDate(schedule.schedule_date)}`} onClose={() => onClose(false)} footer={<><button className="btn btn-outline" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Apply</button></>}>
      <div className="stack">{err && <Alert>{err}</Alert>}<p className="muted small">Sets how many citizens each slot of this day can take. It cannot go below the number already booked in the busiest slot.</p>
        <TextInput label="Citizens per slot" type="number" min="1" value={cap} onChange={(e) => setCap(e.target.value)} /></div>
    </Modal>
  );
}
