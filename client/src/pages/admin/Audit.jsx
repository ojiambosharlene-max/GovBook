import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { EmptyState, ErrorState, PageHead, PageLoading, Pagination, SearchBox } from '../../components/ui.jsx';
import { useDebounced, useFetch } from '../../hooks/useFetch.js';
import { qs } from '../../services/api.js';
import { fmtDateTime } from '../../utils/format.js';

export default function AuditLog() {
  const [q, setQ] = useState(''); const [offset, setOffset] = useState(0); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(`/admin/audit${qs({ q: dq, limit: 25, offset })}`);
  return (
    <>
      <PageHead title="Audit log" subtitle="A permanent record of important actions in the system." />
      <div className="toolbar"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search action, person or record" /></div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <div className="card"><EmptyState icon={ScrollText} title="No log entries" /></div> : (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Record</th><th>Details</th><th>IP</th></tr></thead><tbody>
            {data.rows.map((l) => <tr key={l.id}><td className="small" style={{ whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td><td className="cell-title">{l.user_name || 'System'}</td><td><span className="badge b-confirmed b-plain mono">{l.action}</span></td>
              <td className="small">{l.entity_type ? `${l.entity_type} #${l.entity_id ?? ''}` : '-'}</td><td className="cell-sub" style={{ whiteSpace: 'normal', maxWidth: 360, wordBreak: 'break-word' }}>{l.details ? (typeof l.details === 'string' ? l.details : JSON.stringify(l.details)) : '-'}</td><td className="small">{l.ip_address || '-'}</td></tr>)}
          </tbody></table></div>
          <Pagination total={data.total} limit={25} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}
