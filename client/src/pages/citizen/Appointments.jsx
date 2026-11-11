import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, CalendarPlus, CalendarCheck, Check, Download, MapPin, Phone, Printer, XCircle, CalendarDays, History, ClipboardList, Hourglass, Ban, UserX, CircleCheck } from 'lucide-react';
import { Alert, ConfirmDialog, EmptyState, ErrorState, PageHead, PageLoading, Pagination, SearchBox, StatusBadge } from '../../components/ui.jsx';
import AppointmentCard from '../../components/AppointmentCard.jsx';
import { useDebounced, useFetch } from '../../hooks/useFetch.js';
import { api, qs } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { downloadIcs, downloadSlip, fmtDateLong, fmtDateTime, fmtTime } from '../../utils/format.js';

const LIMIT = 8;

export function AppointmentList({ mode }) {
  const history = mode === 'history'; const toast = useToast(); const nav = useNavigate();
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [offset, setOffset] = useState(0); const [cancelling, setCancelling] = useState(null);
  const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(`/appointments${qs({ view: history ? 'history' : 'upcoming', q: dq, status, limit: LIMIT, offset })}`);

  return (
    <>
      <PageHead title={history ? 'Appointment History' : 'My Appointments'} subtitle={history ? 'Completed, cancelled and missed appointments.' : 'Your active and upcoming bookings.'}>
        {!history && <button className="btn btn-primary" onClick={() => nav('/app/book')}><CalendarPlus size={18} /> Book Appointment</button>}
      </PageHead>
      <div className="toolbar">
        <SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search by reference or service" />
        {history && (
          <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Filter by status">
            <option value="">All statuses</option><option>Completed</option><option>Cancelled</option><option>No Show</option>
          </select>
        )}
      </div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? (
        <div className="card"><EmptyState icon={history ? History : CalendarCheck} title={history ? 'No past appointments found' : 'No upcoming appointments'} text={dq || status ? 'Try a different search or filter.' : history ? 'Completed and cancelled appointments will be listed here.' : 'Book your first appointment to see it here.'}
          action={!history && <Link to="/app/book" className="btn btn-primary btn-sm">Book Appointment</Link>} /></div>
      ) : (
        <>
          <div className="stack page-enter">
            {data.rows.map((a) => (
              <AppointmentCard key={a.id} a={a} actions={<>
                <Link to={`/app/appointments/${a.id}`} className="btn btn-outline btn-sm">View</Link>
                {['Pending', 'Confirmed'].includes(a.status) && <button className="btn btn-danger btn-sm" onClick={() => setCancelling(a)}>Cancel</button>}
              </>} />
            ))}
          </div>
          <Pagination total={data.total} limit={LIMIT} offset={offset} onChange={setOffset} />
        </>
      )}
      {cancelling && (
        <ConfirmDialog title="Cancel this appointment?" danger confirmText="Yes, cancel it" reasonLabel="Reason (optional)"
          message={`${cancelling.service_name} on ${fmtDateLong(cancelling.appointment_date)} at ${fmtTime(cancelling.appointment_time)}. The time slot will be released for other citizens.`}
          onClose={() => setCancelling(null)}
          onConfirm={async (reason) => { await api.post(`/appointments/${cancelling.id}/cancel`, { reason }); toast.success('Appointment cancelled and the slot released.'); reload(); }} />
      )}
    </>
  );
}

const FLOW = [['Booked', ClipboardList], ['Confirmed', CircleCheck], ['Checked In', MapPin], ['In Progress', Hourglass], ['Completed', Check]];

export function AppointmentDetail() {
  const { id } = useParams(); const [sp] = useSearchParams(); const toast = useToast();
  const { data, loading, error, reload } = useFetch(`/appointments/${id}`, { poll: 10000 });
  const [cancelling, setCancelling] = useState(false);
  if (loading) return <PageLoading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const a = data.appointment; const queue = data.queue; const isNew = sp.get('new') === '1';
  const ended = ['Cancelled', 'No Show'].includes(a.status);
  const reached = (label) => {
    const order = ['Pending', 'Confirmed', 'Checked In', 'In Progress', 'Completed'];
    if (label === 'Booked') return 'done';
    const idx = order.indexOf(label === 'Confirmed' ? 'Confirmed' : label); const cur = order.indexOf(a.status);
    if (cur < 0) return label === 'Confirmed' && a.status !== 'Pending' ? 'done' : '';
    if (idx < cur) return 'done'; if (idx === cur) return label === 'Completed' ? 'done' : 'cur'; return '';
  };

  return (
    <>
      <div className="no-print"><Link to="/app/appointments" className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }}><ArrowLeft size={16} /> My appointments</Link></div>

      {isNew && (
        <div className="card center page-enter no-print" style={{ marginBottom: 22, background: 'linear-gradient(135deg, var(--success-soft), var(--surface))' }}>
          <div className="success-ring"><Check size={42} strokeWidth={3} /></div>
          <h2>{a.status === 'Pending' ? 'Booking received!' : 'Booking confirmed!'}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{a.status === 'Pending' ? 'Your request is saved and waiting for confirmation by the office.' : 'Your appointment is saved. We also added it to your notifications.'} Keep your reference number safe.</p>
        </div>
      )}

      <div className="grid grid-main">
        <div className="stack" style={{ gap: 18 }}>
          <div className="ticket print-area" id="slip">
            <div className="row between"><div className="logo" style={{ fontSize: 17 }}>GovBook <small style={{ display: 'inline', marginLeft: 6 }}>Appointment slip</small></div><StatusBadge status={a.status} /></div>
            <div className="muted small" style={{ marginTop: 18 }}>Reference number</div>
            <div className="ref" data-testid="reference">{a.reference}</div>
            <div className="summary-list" style={{ marginTop: 8 }}>
              <div className="summary-row"><span>Service</span><span>{a.service_name}</span></div>
              <div className="summary-row"><span>Office</span><span>{a.office_name}<br /><span className="muted small" style={{ fontWeight: 400 }}>{a.office_address}, {a.office_city}</span></span></div>
              <div className="summary-row"><span>Date</span><span>{fmtDateLong(a.appointment_date)}</span></div>
              <div className="summary-row"><span>Time</span><span>{fmtTime(a.appointment_time)}</span></div>
              <div className="summary-row"><span>Citizen</span><span>{a.citizen_name}</span></div>
              <div className="summary-row"><span>Booked on</span><span>{fmtDateTime(a.booked_at)}</span></div>
              {a.queue_label && <div className="summary-row"><span>Queue number</span><span>{a.queue_label}</span></div>}
              {a.status === 'Cancelled' && <div className="summary-row"><span>Cancellation reason</span><span>{a.cancel_reason || '-'}</span></div>}
            </div>
            <div className="small muted" style={{ marginTop: 14 }}>Please arrive 10 minutes early and show this reference to the officer.</div>
          </div>

          <div className="row no-print">
            <button className="btn btn-primary" onClick={() => window.print()}><Printer size={17} /> Print</button>
            <button className="btn btn-outline" onClick={() => downloadSlip(a)}><Download size={17} /> Download slip</button>
            <button className="btn btn-outline" onClick={() => downloadIcs(a)}><CalendarDays size={17} /> Add to calendar</button>
            {['Pending', 'Confirmed'].includes(a.status) && <button className="btn btn-danger" onClick={() => setCancelling(true)}><XCircle size={17} /> Cancel appointment</button>}
          </div>

          {a.requirements?.length > 0 && (
            <div className="card no-print"><h3 style={{ marginBottom: 12 }}>What to bring</h3><ul className="req-list">{a.requirements.map((r) => <li key={r}>{r}</li>)}</ul>{a.processing_info && <p className="muted small" style={{ marginTop: 12 }}>{a.processing_info}</p>}</div>
          )}
        </div>

        <div className="stack no-print" style={{ gap: 18 }}>
          <div className="card">
            <h3 style={{ marginBottom: 16 }}>Progress</h3>
            {ended ? (
              <Alert type={a.status === 'Cancelled' ? 'danger' : 'warning'}>{a.status === 'Cancelled' ? <>This appointment was cancelled{a.cancelled_at ? ` on ${fmtDateTime(a.cancelled_at)}` : ''}.</> : 'This appointment was marked as missed.'}</Alert>
            ) : (
              <div className="timeline">
                {FLOW.map(([label, Icon]) => { const st = reached(label); return <div key={label} className={`tl ${st}`}><div className="pt"><Icon size={13} /></div><div><div className="strong small">{label === 'Booked' ? 'Booked' : label}</div>{label === 'Confirmed' && a.status === 'Pending' && <div className="tiny muted">Waiting for the office</div>}</div></div>; })}
              </div>
            )}
          </div>
          {queue && !ended && a.status !== 'Completed' && (
            <div className="card" style={{ textAlign: 'center' }}>
              <h3>Live queue</h3>
              <div className="muted small">Your number</div><div style={{ fontSize: 38, fontWeight: 800, color: 'var(--primary)' }}>{a.queue_label}</div>
              <div className="row" style={{ justifyContent: 'center', gap: 22 }}><div><div className="muted tiny">Now serving</div><div className="strong">{queue.currentLabel || '-'}</div></div><div><div className="muted tiny">Ahead of you</div><div className="strong">{queue.ahead}</div></div></div>
            </div>
          )}
          <div className="card">
            <h3 style={{ marginBottom: 12 }}>Office</h3>
            <div className="stack" style={{ gap: 8 }}><div className="row" style={{ flexWrap: 'nowrap' }}><Building2 size={17} className="muted" /> <span className="strong">{a.office_name}</span></div>
              <div className="row muted small" style={{ flexWrap: 'nowrap' }}><MapPin size={16} /> {a.office_address}, {a.office_city}</div>
              {a.office_phone && <div className="row muted small" style={{ flexWrap: 'nowrap' }}><Phone size={16} /> {a.office_phone}</div>}</div>
          </div>
        </div>
      </div>
      {cancelling && (
        <ConfirmDialog title="Cancel this appointment?" danger confirmText="Yes, cancel it" reasonLabel="Reason (optional)" message="The time slot will be released for other citizens."
          onClose={() => setCancelling(false)} onConfirm={async (reason) => { await api.post(`/appointments/${a.id}/cancel`, { reason }); toast.success('Appointment cancelled.'); reload(); }} />
      )}
    </>
  );
}
