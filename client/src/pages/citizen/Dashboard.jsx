import { Link, useNavigate } from 'react-router-dom';
import { CalendarCheck, CalendarClock, CheckCircle2, XCircle, CalendarPlus, ArrowRight, Bell, Clock, Building2, History } from 'lucide-react';
import { EmptyState, ErrorState, Kpi, PageHead, PageLoading, StatusBadge } from '../../components/ui.jsx';
import AppointmentCard, { DateChip } from '../../components/AppointmentCard.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { fmtDateLong, fmtDateTime, fmtTime, todayISO } from '../../utils/format.js';

export default function CitizenDashboard() {
  const { user } = useAuth(); const nav = useNavigate();
  const stats = useFetch('/appointments/stats', { poll: 20000 });
  const up = useFetch('/appointments?view=upcoming&limit=4', { poll: 20000 });
  const notes = useFetch('/notifications');

  if (stats.loading || up.loading) return <PageLoading />;
  if (stats.error) return <ErrorState error={stats.error} onRetry={stats.reload} />;
  const s = stats.data; const next = s.next;
  const isToday = next && String(next.appointment_date).slice(0, 10) === todayISO();

  return (
    <>
      <PageHead title={`Welcome back, ${user.fullName.split(' ')[0]}`} subtitle="Here is a summary of your government appointments.">
        <button className="btn btn-primary" onClick={() => nav('/app/book')}><CalendarPlus size={18} /> Book Appointment</button>
      </PageHead>

      <div className="grid grid-4 keep2 page-enter">
        <Kpi icon={CalendarCheck} label="Total appointments" value={s.total} onClick={() => nav('/app/history')} />
        <Kpi icon={CalendarClock} label="Upcoming" value={s.upcoming} tone="teal" onClick={() => nav('/app/appointments')} />
        <Kpi icon={CheckCircle2} label="Completed" value={s.completed} tone="green" onClick={() => nav('/app/history')} />
        <Kpi icon={XCircle} label="Cancelled" value={s.cancelled} tone="red" onClick={() => nav('/app/history')} />
      </div>

      <div className="grid grid-main mt page-enter">
        <div className="stack" style={{ gap: 18 }}>
          {next ? (
            <div className="card next-card">
              <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
                <span className="badge b-plain" style={{ background: 'rgba(255,255,255,.18)', color: '#fff' }}>{isToday ? 'Your appointment is today' : 'Next appointment'}</span>
                <StatusBadge status={next.status} />
              </div>
              <div className="appt-card" style={{ marginTop: 16, position: 'relative', zIndex: 1 }}>
                <DateChip date={next.appointment_date} />
                <div className="appt-body">
                  <h3 style={{ fontSize: 21 }}>{next.service_name}</h3>
                  <div className="appt-meta"><span><Clock size={15} /> {fmtDateLong(next.appointment_date)} at {fmtTime(next.appointment_time)}</span><span><Building2 size={15} /> {next.office_name}</span></div>
                  <div className="row" style={{ marginTop: 6 }}>
                    <span className="ref-pill">{next.reference}</span>
                    {next.queue_label && <span className="ref-pill">Queue {next.queue_label}</span>}
                    <Link to={`/app/appointments/${next.id}`} className="btn btn-outline btn-sm">View details <ArrowRight size={15} /></Link>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card"><EmptyState icon={CalendarPlus} title="No upcoming appointments" text="Book a time that suits you - it only takes a minute." action={<Link to="/app/book" className="btn btn-primary btn-sm">Book Appointment</Link>} /></div>
          )}

          <div>
            <div className="card-head"><h3>Upcoming appointments</h3><Link to="/app/appointments" className="small strong">See all</Link></div>
            {up.data.rows.length === 0 ? <div className="card"><EmptyState icon={CalendarCheck} title="Nothing scheduled" text="Your upcoming bookings will appear here." /></div> : (
              <div className="stack">{up.data.rows.map((a) => <AppointmentCard key={a.id} a={a} />)}</div>
            )}
          </div>
        </div>

        <div className="stack" style={{ gap: 18 }}>
          <div className="card">
            <div className="card-head"><h3>Recent notifications</h3><Link to="/app/notifications" className="small strong">View all</Link></div>
            {notes.loading ? <PageLoading /> : (notes.data?.rows || []).length === 0 ? <EmptyState icon={Bell} title="All caught up" /> : (
              <div className="stack" style={{ gap: 12 }}>
                {notes.data.rows.slice(0, 4).map((n) => (
                  <div key={n.id} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 12 }}>
                    <span className="ico" style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: n.is_read ? 'var(--surface-3)' : 'var(--primary-soft)', color: n.is_read ? 'var(--muted)' : 'var(--primary)', flexShrink: 0 }}><Bell size={16} /></span>
                    <div><div className="strong small">{n.title}</div><div className="muted tiny">{n.message.slice(0, 90)}{n.message.length > 90 ? '...' : ''}</div><div className="tiny muted">{fmtDateTime(n.created_at)}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="card stack">
            <h3>Quick actions</h3>
            <Link to="/app/book" className="btn btn-outline"><CalendarPlus size={17} /> Book a new appointment</Link>
            <Link to="/app/history" className="btn btn-outline"><History size={17} /> View appointment history</Link>
          </div>
        </div>
      </div>
    </>
  );
}
