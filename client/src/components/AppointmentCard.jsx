import { Link } from 'react-router-dom';
import { Building2, Clock, MapPin } from 'lucide-react';
import { StatusBadge } from './ui.jsx';
import { dateParts, fmtTime } from '../utils/format.js';

export function DateChip({ date }) {
  const p = dateParts(date);
  return <div className="date-chip" aria-hidden="true"><div className="mo">{p.mo}</div><div className="dy">{p.dy}</div><div className="wd">{p.wd}</div></div>;
}

export default function AppointmentCard({ a, actions, showCitizen }) {
  return (
    <div className="card hover appt-card">
      <DateChip date={a.appointment_date} />
      <div className="appt-body">
        <div className="row between" style={{ gap: 8 }}>
          <h4><Link to={`/app/appointments/${a.id}`} style={{ color: 'inherit' }}>{a.service_name}</Link></h4>
          <StatusBadge status={a.status} />
        </div>
        <div className="appt-meta">
          <span><Clock size={15} /> {fmtTime(a.appointment_time)}</span>
          <span><Building2 size={15} /> {a.office_name}</span>
          <span><MapPin size={15} /> {a.office_city}</span>
          {showCitizen && <span>{a.citizen_name}</span>}
        </div>
        <div className="row between">
          <span className="ref-pill">{a.reference}</span>
          <div className="row" style={{ gap: 8 }}>{a.queue_label && a.status !== 'Completed' && <span className="badge b-progress b-plain">Queue {a.queue_label}</span>}{actions}</div>
        </div>
      </div>
    </div>
  );
}
