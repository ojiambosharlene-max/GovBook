import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BadgeCheck, CalendarCheck, Download, Percent, UserX } from 'lucide-react';
import { EmptyState, ErrorState, Kpi, PageHead, PageLoading, Tabs } from '../../components/ui.jsx';
import { tooltipStyle } from './Overview.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { useChartColors } from '../../hooks/useChartColors.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { qs } from '../../services/api.js';
import { downloadCsv, fmtShort, monthTitle } from '../../utils/format.js';

export default function Reports() {
  const { user } = useAuth(); const c = useChartColors(); const isAdmin = user.role === 'admin'; const tt = tooltipStyle(c);
  const [f, setF] = useState({ from: '', to: '', officeId: '', serviceId: '' }); const [period, setPeriod] = useState('daily');
  const offices = useFetch(isAdmin ? '/admin/offices' : null); const services = useFetch('/admin/services');
  const { data, loading, error, reload } = useFetch(`/admin/reports${qs(f)}`);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const label = (l) => (period === 'daily' ? fmtShort(l) : period === 'weekly' ? `Wk ${fmtShort(l)}` : monthTitle(l));
  const series = data ? data[period].map((r) => ({ ...r, label: label(r.label), other: Math.max(0, r.total - r.completed - r.cancelled - r.no_show) })) : [];
  const exportCsv = () => {
    const rows = [['Period', 'Total', 'Completed', 'Cancelled', 'No show'], ...data[period].map((r) => [r.label, r.total, r.completed, r.cancelled, r.no_show])];
    downloadCsv(`appointments-${period}-${data.range.from}-to-${data.range.to}.csv`, rows);
  };
  const axis = { tick: { fill: c.text, fontSize: 11 }, tickLine: false, axisLine: false };

  return (
    <>
      <PageHead title="Reports & analytics" subtitle={data ? `Appointments from ${data.range.from} to ${data.range.to}` : 'Appointment statistics'}>
        <button className="btn btn-outline" onClick={exportCsv} disabled={!data}><Download size={17} /> Export CSV</button>
      </PageHead>
      <div className="toolbar">
        <label className="row small muted">From <input type="date" className="input" style={{ width: 'auto' }} value={f.from} onChange={set('from')} /></label>
        <label className="row small muted">To <input type="date" className="input" style={{ width: 'auto' }} value={f.to} onChange={set('to')} /></label>
        {isAdmin && <select className="select" value={f.officeId} onChange={set('officeId')} aria-label="Office"><option value="">All offices</option>{(offices.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select>}
        <select className="select" value={f.serviceId} onChange={set('serviceId')} aria-label="Service"><option value="">All services</option>{(services.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        {(f.from || f.to || f.officeId || f.serviceId) && <button className="btn btn-ghost btn-sm" onClick={() => setF({ from: '', to: '', officeId: '', serviceId: '' })}>Clear filters</button>}
      </div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.totals.total === 0 ? <div className="card"><EmptyState icon={CalendarCheck} title="No appointments in this selection" text="Try a wider date range." /></div> : (
        <>
          <div className="grid grid-4 keep2 page-enter">
            <Kpi icon={CalendarCheck} label="Appointments" value={data.totals.total} />
            <Kpi icon={BadgeCheck} label="Completed" value={data.totals.completed} tone="green" sub={`${data.completionRate}% completion`} />
            <Kpi icon={Percent} label="Cancellation rate" value={`${data.cancellationRate}%`} tone="red" sub={`${data.totals.cancelled} cancelled`} />
            <Kpi icon={UserX} label="No-show rate" value={`${data.noShowRate}%`} tone="amber" sub={`${data.totals.no_show} no-shows`} />
          </div>

          <div className="card mt page-enter">
            <div className="card-head"><h3>Appointment statistics</h3><Tabs value={period} onChange={setPeriod} tabs={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }, { value: 'monthly', label: 'Monthly' }]} /></div>
            <div className="chart-box"><ResponsiveContainer>
              <BarChart data={series} margin={{ left: -16, right: 8 }}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" {...axis} interval="preserveStartEnd" /><YAxis allowDecimals={false} {...axis} />
                <Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completed" name="Completed" stackId="a" fill="#22a55a" /><Bar dataKey="other" name="Scheduled / in progress" stackId="a" fill={c.c1} /><Bar dataKey="cancelled" name="Cancelled" stackId="a" fill={c.c5} /><Bar dataKey="no_show" name="No show" stackId="a" fill="#8b97b5" radius={[6, 6, 0, 0]} />
              </BarChart></ResponsiveContainer></div>
          </div>

          <div className="grid grid-2 mt page-enter">
            <div className="card"><div className="card-head"><h3>Most requested services</h3></div>
              <div className="chart-box"><ResponsiveContainer><BarChart data={data.services.map((s) => ({ ...s, short: s.label.length > 22 ? `${s.label.slice(0, 21)}...` : s.label }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} {...axis} /><YAxis type="category" dataKey="short" width={140} {...axis} />
                <Tooltip {...tt} /><Bar dataKey="total" name="Appointments" fill={c.c1} radius={[0, 6, 6, 0]} /></BarChart></ResponsiveContainer></div></div>
            <div className="card"><div className="card-head"><h3>Office workload</h3></div>
              <div className="chart-box"><ResponsiveContainer><BarChart data={data.offices.map((o) => ({ ...o, short: o.label.split(' ')[0] }))} margin={{ left: -16 }}>
                <CartesianGrid stroke={c.grid} strokeDasharray="3 3" vertical={false} /><XAxis dataKey="short" {...axis} /><YAxis allowDecimals={false} {...axis} /><Tooltip {...tt} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="Booked" fill={c.c1} radius={[6, 6, 0, 0]} /><Bar dataKey="completed" name="Completed" fill={c.c2} radius={[6, 6, 0, 0]} /><Bar dataKey="no_show" name="No show" fill="#8b97b5" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div></div>
          </div>

          <div className="card mt page-enter"><div className="card-head"><h3>Office summary</h3></div>
            <div className="table-wrap"><table className="table"><thead><tr><th>Office</th><th>Booked</th><th>Completed</th><th>Cancelled</th><th>No show</th><th>Avg wait</th><th>Avg service time</th></tr></thead><tbody>
              {data.offices.map((o) => <tr key={o.label}><td className="cell-title">{o.label}</td><td>{o.total}</td><td>{o.completed}</td><td>{o.cancelled}</td><td>{o.no_show}</td><td>{o.avg_wait_minutes === null ? '-' : `${o.avg_wait_minutes} min`}</td><td>{o.avg_service_minutes === null ? '-' : `${o.avg_service_minutes} min`}</td></tr>)}
            </tbody></table></div></div>
        </>
      )}
    </>
  );
}
