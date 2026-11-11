import { useState } from 'react';
import { Check, Megaphone, Send } from 'lucide-react';
import { Alert, EmptyState, ErrorState, Field, PageHead, PageLoading, Pagination, Tabs, TextInput } from '../../components/ui.jsx';
import { useFetch } from '../../hooks/useFetch.js';
import { useToast } from '../../context/ToastContext.jsx';
import { api, qs } from '../../services/api.js';
import { fmtDateTime } from '../../utils/format.js';

export default function AdminNotifications() {
  const [tab, setTab] = useState('send');
  return (
    <>
      <PageHead title="Manage notifications" subtitle="Send announcements, review delivery and answer contact messages." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'send', label: 'Send announcement' }, { value: 'log', label: 'Delivery log' }, { value: 'inbox', label: 'Contact inbox' }]} />
      <div className="mt">{tab === 'send' ? <Send_ /> : tab === 'log' ? <Log /> : <Inbox_ />}</div>
    </>
  );
}

function Send_() {
  const toast = useToast(); const [f, setF] = useState({ audience: 'citizens', title: '', message: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api.post('/admin/notifications/broadcast', f); toast.success(`Announcement delivered to ${r.recipients} people.`); setF({ ...f, title: '', message: '' }); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit} style={{ maxWidth: 720 }} noValidate>
      <div className="row"><Megaphone size={20} style={{ color: 'var(--primary)' }} /><h3>New announcement</h3></div>
      {err && <Alert>{err}</Alert>}
      <Field label="Send to"><select className="select" value={f.audience} onChange={(e) => setF({ ...f, audience: e.target.value })}><option value="citizens">All citizens</option><option value="staff">All staff</option><option value="all">Everyone</option></select></Field>
      <TextInput label="Title" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={150} />
      <Field label="Message"><textarea className="textarea" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} maxLength={500} /></Field>
      <p className="muted small">It appears in each person's notifications. Recipients who opted in to e-mail are queued for e-mail delivery.</p>
      <div><button className="btn btn-primary" disabled={busy}><Send size={16} /> {busy ? 'Sending...' : 'Send announcement'}</button></div>
    </form>
  );
}

function Log() {
  const [channel, setChannel] = useState(''); const [ds, setDs] = useState(''); const [offset, setOffset] = useState(0);
  const { data, loading, error, reload } = useFetch(`/admin/notifications${qs({ channel, deliveryStatus: ds, limit: 20, offset })}`);
  return (
    <>
      <div className="toolbar">
        <select className="select" value={channel} onChange={(e) => { setChannel(e.target.value); setOffset(0); }} aria-label="Channel"><option value="">All channels</option><option value="in_app">In-app</option><option value="email">E-mail</option><option value="sms">SMS</option></select>
        <select className="select" value={ds} onChange={(e) => { setDs(e.target.value); setOffset(0); }} aria-label="Delivery"><option value="">Any delivery status</option><option value="sent">Sent</option><option value="pending">Pending</option><option value="failed">Failed</option></select>
        {data && <span className="muted small">{data.pending} e-mail/SMS notification(s) waiting for a delivery provider</span>}
      </div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <div className="card"><EmptyState title="Nothing here" /></div> : (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>When</th><th>Recipient</th><th>Notification</th><th>Channel</th><th>Delivery</th></tr></thead><tbody>
            {data.rows.map((n) => <tr key={n.id}><td className="small">{fmtDateTime(n.created_at)}</td><td className="cell-title">{n.recipient}</td><td><div className="strong small">{n.title}</div><div className="cell-sub" style={{ whiteSpace: 'normal', maxWidth: 420 }}>{n.message}</div></td><td><span className="badge b-plain">{n.channel}</span></td><td><span className={`badge ${n.delivery_status === 'sent' ? 'b-completed' : n.delivery_status === 'pending' ? 'b-pending' : 'b-cancelled'}`}>{n.delivery_status}</span></td></tr>)}
          </tbody></table></div>
          <Pagination total={data.total} limit={20} offset={offset} onChange={setOffset} />
        </>
      )}
    </>
  );
}

function Inbox_() {
  const toast = useToast(); const { data, loading, error, reload } = useFetch('/admin/contact-messages');
  const mark = async (m) => { try { await api.patch(`/admin/contact-messages/${m.id}`, { isHandled: !m.is_handled }); reload(); } catch (e) { toast.error(e.message); } };
  if (loading) return <PageLoading />; if (error) return <ErrorState error={error} onRetry={reload} />;
  if (!data.length) return <div className="card"><EmptyState title="No contact messages" text="Messages sent from the website's contact form appear here." /></div>;
  return <div className="stack">{data.map((m) => (
    <div className="card" key={m.id} style={{ opacity: m.is_handled ? .65 : 1 }}>
      <div className="row between"><div><div className="strong">{m.subject}</div><div className="muted small">{m.name} - <a href={`mailto:${m.email}`}>{m.email}</a> - {fmtDateTime(m.created_at)}</div></div>
        <button className={`btn btn-sm ${m.is_handled ? 'btn-outline' : 'btn-success'}`} onClick={() => mark(m)}>{m.is_handled ? 'Reopen' : <><Check size={14} /> Mark handled</>}</button></div>
      <p style={{ marginTop: 10 }}>{m.message}</p>
    </div>))}</div>;
}
