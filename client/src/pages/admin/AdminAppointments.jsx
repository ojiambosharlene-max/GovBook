import { useState } from 'react';
import { CalendarClock, ClipboardList, Eye, XCircle } from 'lucide-react';
import { Alert, ConfirmDialog, EmptyState, ErrorState, Modal, PageHead, PageLoading, Pagination, SearchBox, Spinner, StatusBadge } from '../../components/ui.jsx';
import Calendar from '../../components/Calendar.jsx';
import { useDebounced, useFetch } from '../../hooks/useFetch.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, qs } from '../../services/api.js';
import { fmtDate, fmtDateLong, fmtDateTime, fmtTime, monthKey } from '../../utils/format.js';

const LIMIT = 15; const STATUSES = ['Pending', 'Confirmed', 'Checked In', 'In Progress', 'Completed', 'Cancelled', 'No Show'];

export default function AdminAppointments() {
  const { user } = useAuth(); const toast = useToast(); const isAdmin = user.role === 'admin';
  const [f, setF] = useState({ q: '', status: '', officeId: '', serviceId: '', from: '', to: '' }); const [offset, setOffset] = useState(0);
  const dq = useDebounced(f.q);
  const offices = useFetch(isAdmin ? '/admin/offices' : null); const services = useFetch('/admin/services');
  const { data, loading, error, reload } = useFetch(`/admin/appointments${qs({ ...f, q: dq, limit: LIMIT, offset })}`);
  const [view, setView] = useState(null); const [resch, setResch] = useState(null); const [cancel, setCancel] = useState(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); setOffset(0); };
  const open = (a) => ['Pending', 'Confirmed'].includes(a.status);

  return (
    <>
      <PageHead title="Appointments" subtitle="Search, filter, reschedule or cancel any booking." />
      <div className="toolbar">
        <SearchBox value={f.q} onChange={(v) => { setF({ ...f, q: v }); setOffset(0); }} placeholder="Reference, citizen, ID number or service" />
        <select className="select" value={f.status} onChange={set('status')} aria-label="Status"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        {isAdmin && <select className="select" value={f.officeId} onChange={set('officeId')} aria-label="Office"><option value="">All offices</option>{(offices.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
        <select className="select" value={f.serviceId} onChange={set('serviceId')} aria-label="Service"><option value="">All services</option>{(services.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <input type="date" className="input" style={{ width: 'auto' }} value={f.from} onChange={set('from')} aria-label="From date" /><input type="date" className="input" style={{ width: 'auto' }} value={f.to} onChange={set('to')} aria-label="To date" />
      </div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <div className="card"><EmptyState icon={ClipboardList} title="No appointments match" text="Adjust the search or filters." /></div> : (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Citizen</th><th>Service / office</th><th>When</th><th>Status</th><th /></tr></thead><tbody>
            {data.rows.map((a) => <tr key={a.id}><td><span className="ref-pill">{a.reference}</span></td><td><div className="cell-title">{a.citizen_name}</div><div className="cell-sub">{a.citizen_national_id}</div></td><td>{a.service_name}<div className="cell-sub">{a.office_name}</div></td><td>{fmtDate(a.appointment_date)}<div className="cell-sub">{fmtTime(a.appointment_time)}</div></td><td><StatusBadge status={a.status} /></td>
              <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => setView(a)}><Eye size={14} /> View</button>
                {open(a) && <button className="btn btn-outline btn-sm" onClick={() => setResch(a)}><CalendarClock size={14} /> Reschedule</button>}
                {['Pending', 'Confirmed', 'Checked In'].includes(a.status) && <button className="btn btn-danger btn-sm" onClick={() => setCancel(a)}><XCircle size={14} /> Cancel</button>}</div></td></tr>)}
          </tbody></table></div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
      {view && (
        <Modal title={`Appointment ${view.reference}`} onClose={() => setView(null)}>
          <div className="summary-list">
            {[['Status', <StatusBadge key="s" status={view.status} />], ['Citizen', view.citizen_name], ['National ID', view.citizen_national_id], ['Contact', `${view.citizen_phone} / ${view.citizen_email}`], ['Service', view.service_name], ['Office', view.office_name], ['Date', fmtDateLong(view.appointment_date)], ['Time', fmtTime(view.appointment_time)], ['Booked on', fmtDateTime(view.booked_at)], ['Queue number', view.queue_label || '-'], ['Notes', view.notes || '-'], ...(view.cancel_reason ? [['Cancellation reason', view.cancel_reason]] : [])]
              .map(([l, v]) => <div className="summary-row" key={l}><span>{l}</span><span>{v}</span></div>)}
          </div>
        </Modal>
      )}
      {resch && <Reschedule a={resch} onClose={(d) => { setResch(null); if (d) reload(); }} />}
      {cancel && <ConfirmDialog title="Cancel this appointment?" danger confirmText="Cancel appointment" reasonLabel="Reason for cancellation (recorded and sent to the citizen)" reasonRequired message={`${cancel.reference} - ${cancel.citizen_name}, ${cancel.service_name}, ${fmtDate(cancel.appointment_date)} ${fmtTime(cancel.appointment_time)}.`}
        onClose={() => setCancel(null)} onConfirm={async (reason) => { await api.post(`/admin/appointments/${cancel.id}/cancel`, { reason }); toast.success('Appointment cancelled and the citizen was notified.'); reload(); }} />}
    </>
  );
}

function Reschedule({ a, onClose }) {
  const toast = useToast();
  const [month, setMonth] = useState(monthKey(new Date())); const [date, setDate] = useState(null); const [slot, setSlot] = useState(null); const [reason, setReason] = useState(''); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const avail = useFetch(`/public/availability?officeId=${a.office_id}&month=${month}`);
  const slots = useFetch(date ? `/public/slots?officeId=${a.office_id}&date=${date}` : null);
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.post(`/admin/appointments/${a.id}/reschedule`, { slotId: slot, reason }); toast.success('Appointment rescheduled and the citizen was notified.'); onClose(true); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal wide title={`Reschedule ${a.reference}`} onClose={() => onClose(false)} footer={<><button className="btn btn-outline" onClick={() => onClose(false)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={!slot || busy}>{busy ? 'Moving...' : 'Move appointment'}</button></>}>
      <div className="stack">{err && <Alert>{err}</Alert>}
        <p className="muted small">Currently {fmtDate(a.appointment_date)} at {fmtTime(a.appointment_time)} - {a.service_name}, {a.office_name}.</p>
        <Calendar month={month} onMonthChange={setMonth} availability={avail.data} selected={date} onSelect={(d) => { setDate(d); setSlot(null); }} loading={avail.loading} />
        {date && (slots.loading ? <Spinner /> : <div className="slots">{(slots.data || []).map((s) => <button key={s.id} type="button" className="slot" disabled={!s.bookable || s.remaining <= 0 || (date === String(a.appointment_date).slice(0, 10) && s.id === a.slot_id)} aria-pressed={slot === s.id} onClick={() => setSlot(s.id)}>{s.start}<small>{s.remaining <= 0 ? 'Full' : `${s.remaining} left`}</small></button>)}</div>)}
        <div className="field"><label htmlFor="rr">Reason (sent to the citizen)</label><input id="rr" className="input" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Officer unavailable" /></div>
      </div>
    </Modal>
  );
}
