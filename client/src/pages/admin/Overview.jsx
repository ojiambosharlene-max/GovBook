import { Link, useNavigate } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { CalendarCheck, CalendarClock, CheckCircle2, ClipboardList, Hourglass, Inbox, Users, XCircle } from 'lucide-react';
import { Alert, ErrorState, Kpi, PageHead, PageLoading, StatusBadge } from '../../components/ui.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { useChartColors } from '../../hooks/useChartColors.js';
import { fmtDate, fmtShort, fmtTime } from '../../utils/format.js';

export const tooltipStyle = (c) => ({ contentStyle: { background: c.surface, border: `1px solid ${c.border}`, borderRadius: 12, color: c.text === '' ? undefined : undefined, boxShadow: '0 10px 30px rgba(0,0,0,.2)' }, labelStyle: { fontWeight: 700 }, cursor: { fill: 'rgba(120,140,200,.12)' } });

export default function AdminOverview() {
  const { data, loading, error, reload } = useFetch('/admin/dashboard', { poll: 30000 });
  const c = useChartColors(); const nav = useNavigate();
  if (loading) return <PageLoading />;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const k = data.counts;
  const statusColors = { Pending: c.c3, Confirmed: c.c1, 'Checked In': c.c2, 'In Progress': c.c4, Completed: '#22a55a', Cancelled: c.c5, 'No Show': '#8b97b5' };
  const tt = tooltipStyle(c);

  return (
    <>
      <PageHead title="Administration overview" subtitle="Live figures straight from the appointment database." />
      {data.unhandledMessages > 0 && <div style={{ marginBottom: 16 }}><Alert type="info"><Inbox size={0} /> You have {data.unhandledMessages} unread contact message(s). <Link to="/admin/notifications" className="strong">Open inbox</Link></Alert></div>}
      <div className="grid grid-4 keep2 page-enter">
        <Kpi icon={Users} label="Registered citizens" value={k.citizens} onClick={() => nav('/admin/citizens')} />
        <Kpi icon={ClipboardList} label="Total appointments" value={k.total} tone="teal" onClick={() => nav('/admin/appointments')} />
        <Kpi icon={CalendarCheck} label="Confirmed" value={k.confirmed} onClick={() => nav('/admin/appointments')} />
        <Kpi icon={Hourglass} label="Pending" value={k.pending} tone="amber" onClick={() => nav('/admin/appointments')} />
        <Kpi icon={CheckCircle2} label="Completed" value={k.completed} tone="green" onClick={() => nav('/admin/appointments')} />
        <Kpi icon={XCircle} label="Cancelled" value={k.cancelled} tone="red" onClick={() => nav('/admin/appointments')} />
        <Kpi icon={CalendarClock} label="Today's appointments" value={k.today} tone="teal" onClick={() => nav('/staff/queue')} />
        <Kpi icon={Users} label="Active staff" value={k.staff} tone="gray" sub={`${k.offices} offices - ${k.services} services`} onClick={() => nav('/admin/staff')} />
      </div>

      <div className="grid grid-main mt page-enter">
        <div className="card">
          <div className="card-head"><h3>Appointments - last 14 days</h3></div>
          <div className="chart-box"><ResponsiveContainer>
            <AreaChart data={data.trend.map((t) => ({ ...t, label: fmtShort(t.date) }))} margin={{ left: -18, right: 8, top: 8 }}>
              <defs><linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={c.c1} stopOpacity=".4" /><stop offset="1" stopColor={c.c1} stopOpacity="0" /></linearGradient></defs>
              <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="total" name="Booked" stroke={c.c1} fill="url(#gA)" strokeWidth={2.5} />
              <Area type="monotone" dataKey="completed" name="Completed" stroke={c.c2} fill="transparent" strokeWidth={2} />
            </AreaChart></ResponsiveContainer></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>By status</h3></div>
          <div className="chart-box"><ResponsiveContainer>
            <PieChart><Pie data={data.byStatus} dataKey="count" nameKey="status" innerRadius={55} outerRadius={90} paddingAngle={2} stroke="none">{data.byStatus.map((s) => <Cell key={s.status} fill={statusColors[s.status] || c.c1} />)}</Pie>
              <Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 12 }} /></PieChart></ResponsiveContainer></div>
        </div>
      </div>

      <div className="grid grid-main mt page-enter">
        <div className="card">
          <div className="card-head"><h3>Latest bookings</h3><Link to="/admin/appointments" className="small strong">View all</Link></div>
          <div className="table-wrap"><table className="table"><thead><tr><th>Reference</th><th>Citizen</th><th>Service</th><th>When</th><th>Status</th></tr></thead><tbody>
            {data.recent.map((a) => <tr key={a.id}><td><span className="ref-pill">{a.reference}</span></td><td className="cell-title">{a.citizen_name}</td><td>{a.service_name}<div className="cell-sub">{a.office_name}</div></td><td className="nowrap">{fmtDate(a.appointment_date)}<div className="cell-sub">{fmtTime(a.appointment_time)}</div></td><td><StatusBadge status={a.status} /></td></tr>)}
          </tbody></table></div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Today by office</h3></div>
          <div className="chart-box"><ResponsiveContainer>
            <BarChart data={data.todayByOffice.map((o) => ({ ...o, short: o.name.split(' ')[0] }))} margin={{ left: -18 }}>
              <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="short" tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} /><YAxis allowDecimals={false} tick={{ fill: c.text, fontSize: 11 }} tickLine={false} axisLine={false} />
              <Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 12 }} /><Bar dataKey="total" name="Booked" fill={c.c1} radius={[6, 6, 0, 0]} /><Bar dataKey="completed" name="Completed" fill={c.c2} radius={[6, 6, 0, 0]} />
            </BarChart></ResponsiveContainer></div>
        </div>
      </div>
    </>
  );
}
