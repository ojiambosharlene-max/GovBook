import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, Check, Clock, MapPin, Phone, ShieldCheck, Timer } from 'lucide-react';
import { Alert, EmptyState, ErrorState, PageHead, PageLoading, Spinner } from '../../components/ui.jsx';
import { ServiceIcon } from '../../components/brand.jsx';
import Calendar from '../../components/Calendar.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { api } from '../../services/api.js';
import { useToast } from '../../context/ToastContext.jsx';
import { fmtDateLong, monthKey, parseDate } from '../../utils/format.js';

const STEPS = ['Office', 'Service', 'Date', 'Time', 'Confirm'];
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

export default function Book() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const presetService = sp.get('service') ? Number(sp.get('service')) : null;
  const [step, setStep] = useState(1);
  const [office, setOffice] = useState(null); const [service, setService] = useState(null);
  const [month, setMonth] = useState(monthKey(new Date())); const [date, setDate] = useState(null); const [slot, setSlot] = useState(null);
  const [notes, setNotes] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(null);
  const key = useRef(newKey());

  const offices = useFetch(`/public/offices${presetService ? `?serviceId=${presetService}` : ''}`);
  const services = useFetch(office ? `/public/offices/${office.id}/services` : null);
  const avail = useFetch(office && step >= 3 ? `/public/availability?officeId=${office.id}&month=${month}` : null);
  const slots = useFetch(office && date && step >= 4 ? `/public/slots?officeId=${office.id}&date=${date}` : null);

  // A service picked on the home page is pre-selected as soon as the office offers it.
  useEffect(() => {
    if (presetService && services.data && !service) { const s = services.data.find((x) => x.id === presetService); if (s) setService(s); }
  }, [presetService, services.data, service]);

  const pickOffice = (o) => { setOffice(o); if (!presetService || !service || office?.id !== o.id) { if (office?.id !== o.id) setService(null); } setDate(null); setSlot(null); setError(null); setStep(2); };
  const pickService = (s) => { setService(s); setError(null); setStep(3); };
  const pickDate = (d) => { setDate(d); setSlot(null); setError(null); setStep(4); };
  const pickSlot = (s) => { setSlot(s); setError(null); };

  const goto = (n) => { if (n < step) { setError(null); setStep(n); } };
  const progress = useMemo(() => ({ 1: !!office, 2: !!service, 3: !!date, 4: !!slot }), [office, service, date, slot]);

  const confirm = async () => {
    setBusy(true); setError(null);
    try {
      const r = await api.post('/appointments', { officeId: office.id, serviceId: service.id, slotId: slot.id, notes: notes.trim() || undefined, idempotencyKey: key.current });
      toast.success(`Appointment ${r.appointment.status === 'Pending' ? 'received' : 'confirmed'}: ${r.appointment.reference}`);
      nav(`/app/appointments/${r.appointment.id}?new=1`, { replace: true });
    } catch (e) {
      setError(e);
      if (['SLOT_FULL', 'SLOT_UNAVAILABLE', 'SLOT_PAST'].includes(e.code)) { setSlot(null); slots.reload(); avail.reload(); setStep(4); }
      key.current = newKey();
    } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead title="Book an Appointment" subtitle="Choose an office, a service and a time. Availability is checked live against the database." />
      <ol className="stepper" aria-label="Booking steps" style={{ listStyle: 'none', padding: 0 }}>
        {STEPS.map((s, i) => {
          const n = i + 1; const cls = n === step ? 'active' : n < step && progress[n] ? 'done' : '';
          return (
            <li key={s} className={`st ${cls}`} aria-current={n === step ? 'step' : undefined} style={{ cursor: n < step ? 'pointer' : 'default' }} onClick={() => goto(n)}>
              <span className="n">{cls === 'done' ? <Check size={14} /> : n}</span><span className="t">{s}</span>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-main">
        <div className="card page-enter" key={step}>
          {error && (
            <div style={{ marginBottom: 16 }}>
              <Alert>{error.message}{error.code === 'DUPLICATE_BOOKING' && <> <Link to="/app/appointments" className="strong">View my appointments</Link></>}</Alert>
            </div>
          )}

          {step === 1 && (
            <>
              <div className="card-head"><h3>Step 1 - Select a government office</h3></div>
              {presetService && <Alert type="info">Showing offices that offer your chosen service.</Alert>}
              {offices.loading ? <PageLoading /> : offices.error ? <ErrorState error={offices.error} onRetry={offices.reload} /> : offices.data.length === 0 ? <EmptyState icon={Building2} title="No offices available" text="No office currently offers this service." /> : (
                <div className="grid grid-2" style={{ marginTop: 14 }}>
                  {offices.data.map((o) => (
                    <button key={o.id} type="button" className="choice" aria-pressed={office?.id === o.id} onClick={() => pickOffice(o)}>
                      <span className="ico"><Building2 size={22} /></span>
                      <span><h4>{o.name}</h4><p><MapPin size={12} style={{ verticalAlign: -1 }} /> {o.address}, {o.city}</p><p>{o.opening_hours}</p><p>{o.service_count} services offered</p></span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="card-head"><h3>Step 2 - Select the service you need</h3><span className="muted small">{office?.name}</span></div>
              {services.loading ? <PageLoading /> : services.error ? <ErrorState error={services.error} onRetry={services.reload} /> : (
                <div className="grid grid-2" style={{ marginTop: 14 }}>
                  {services.data.map((s) => (
                    <button key={s.id} type="button" className="choice" aria-pressed={service?.id === s.id} onClick={() => pickService(s)}>
                      <span className="ico"><ServiceIcon name={s.icon} size={22} /></span>
                      <span><h4>{s.name}</h4><p>{s.description}</p><p style={{ marginTop: 6 }}><Timer size={12} style={{ verticalAlign: -1 }} /> about {s.duration_minutes} min{s.requires_approval ? ' - confirmed by an officer' : ''}</p></span>
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="card-head"><h3>Step 3 - Choose an available date</h3></div>
              {avail.error ? <ErrorState error={avail.error} onRetry={avail.reload} /> : (
                <Calendar month={month} onMonthChange={(m) => { setMonth(m); }} availability={avail.data} selected={date} onSelect={pickDate} loading={avail.loading} />
              )}
              {avail.loading && <div className="row mt"><Spinner /> <span className="muted small">Checking availability...</span></div>}
              {!avail.loading && avail.data && avail.data.days.length === 0 && <div style={{ marginTop: 14 }}><Alert type="warning">No dates with free places this month. Try the next month.</Alert></div>}
            </>
          )}

          {step === 4 && (
            <>
              <div className="card-head"><h3>Step 4 - Choose a time on {fmtDateLong(date)}</h3><button className="btn btn-ghost btn-sm" onClick={() => setStep(3)}>Change date</button></div>
              {slots.loading ? <PageLoading text="Loading time slots..." /> : slots.error ? <ErrorState error={slots.error} onRetry={slots.reload} /> : slots.data.length === 0 ? <EmptyState icon={Clock} title="No time slots on this day" /> : (
                <>
                  <div className="slots" role="group" aria-label="Available time slots">
                    {slots.data.map((s) => (
                      <button key={s.id} type="button" className={`slot ${s.remaining > 0 && s.remaining <= 1 ? 'low' : ''}`} disabled={!s.bookable || s.remaining <= 0} aria-pressed={slot?.id === s.id} onClick={() => pickSlot(s)}>
                        {s.start}<small>{!s.bookable && s.remaining > 0 ? 'Passed' : s.remaining <= 0 ? 'Full' : `${s.remaining} left`}</small>
                      </button>
                    ))}
                  </div>
                  <div className="row between mt">
                    <button className="btn btn-outline" onClick={() => setStep(3)}><ArrowLeft size={16} /> Back</button>
                    <button className="btn btn-primary" disabled={!slot} onClick={() => setStep(5)}>Review booking <ArrowRight size={16} /></button>
                  </div>
                </>
              )}
            </>
          )}

          {step === 5 && (
            <>
              <div className="card-head"><h3>Step 5 - Review and confirm</h3></div>
              <div className="summary-list">
                <div className="summary-row"><span>Office</span><span>{office.name}</span></div>
                <div className="summary-row"><span>Service</span><span>{service.name}</span></div>
                <div className="summary-row"><span>Date</span><span>{fmtDateLong(date)}</span></div>
                <div className="summary-row"><span>Time</span><span>{slot.start} - {slot.end}</span></div>
                <div className="summary-row"><span>Address</span><span>{office.address}, {office.city}</span></div>
              </div>
              {service.requirements?.length > 0 && (
                <div className="mt"><div className="strong" style={{ marginBottom: 8 }}>Please bring</div><ul className="req-list">{service.requirements.map((r) => <li key={r}>{r}</li>)}</ul></div>
              )}
              <div className="field mt"><label htmlFor="notes">Notes for the officer (optional)</label><textarea id="notes" className="textarea" maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything the office should know, e.g. you need wheelchair access." /></div>
              {service.requires_approval ? <div className="mt"><Alert type="info">This service is confirmed by an officer. Your booking will show as <strong>Pending</strong> until it is approved.</Alert></div> : null}
              <div className="row between mt">
                <button className="btn btn-outline" onClick={() => setStep(4)} disabled={busy}><ArrowLeft size={16} /> Back</button>
                <button className="btn btn-primary btn-lg" onClick={confirm} disabled={busy} data-testid="confirm-booking">{busy ? <><Spinner /> Saving your booking...</> : <><ShieldCheck size={18} /> Confirm booking</>}</button>
              </div>
            </>
          )}
        </div>

        <aside className="card" style={{ alignSelf: 'start', position: 'sticky', top: 90 }}>
          <h3 style={{ marginBottom: 12 }}>Your booking</h3>
          <div className="summary-list">
            <div className="summary-row"><span>Office</span><span>{office ? office.name : '-'}</span></div>
            <div className="summary-row"><span>Service</span><span>{service ? service.name : '-'}</span></div>
            <div className="summary-row"><span>Date</span><span>{date ? parseDate(date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : '-'}</span></div>
            <div className="summary-row"><span>Time</span><span>{slot ? slot.start : '-'}</span></div>
          </div>
          {office?.phone && <div className="row muted small" style={{ marginTop: 14 }}><Phone size={15} /> {office.phone}</div>}
          <p className="tiny muted" style={{ marginTop: 14 }}>Your slot is only reserved when you press <strong>Confirm booking</strong>. We re-check availability at that moment so two people can never hold the same place.</p>
        </aside>
      </div>
    </>
  );
}
