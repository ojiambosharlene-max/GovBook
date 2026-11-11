import { useState } from 'react';
import { Building2, Layers, Pencil, Plus, Users, UserCog, Settings2 } from 'lucide-react';
import { Alert, EmptyState, ErrorState, Field, Modal, PageHead, PageLoading, Pagination, SearchBox, StatusBadge, Switch, TextInput } from '../../components/ui.jsx';
import { ICON_NAMES, ServiceIcon } from '../../components/brand.jsx';
import { useDebounced, useFetch } from '../../hooks/useFetch.js';
import { useAuth } from '../../context/AuthContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { api, qs } from '../../services/api.js';
import { fmtDateTime } from '../../utils/format.js';

const Active = ({ on }) => <span className={`badge ${on ? 'b-completed' : 'b-noshow'}`}>{on ? 'Active' : 'Inactive'}</span>;

/* ============================== citizens ============================== */
export function AdminCitizens() {
  const { user } = useAuth(); const toast = useToast(); const canEdit = user.role === 'admin';
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [offset, setOffset] = useState(0); const [edit, setEdit] = useState(null); const dq = useDebounced(q);
  const { data, loading, error, reload } = useFetch(`/admin/citizens${qs({ q: dq, status, limit: 15, offset })}`);
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { await api.patch(`/admin/citizens/${edit.id}`, { fullName: edit.full_name, phone: edit.phone, isActive: edit.is_active }); toast.success('Citizen updated.'); setEdit(null); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Citizens" subtitle="Registered citizen accounts." />
      <div className="toolbar"><SearchBox value={q} onChange={(v) => { setQ(v); setOffset(0); }} placeholder="Search name, email, phone or ID" />
        <select className="select" value={status} onChange={(e) => { setStatus(e.target.value); setOffset(0); }} aria-label="Status"><option value="">All</option><option value="active">Active</option><option value="inactive">Deactivated</option></select></div>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <div className="card"><EmptyState icon={Users} title="No citizens found" /></div> : (
        <>
          <div className="table-wrap"><table className="table"><thead><tr><th>Citizen</th><th>National ID</th><th>Phone</th><th>Appointments</th><th>Registered</th><th>Status</th>{canEdit && <th />}</tr></thead><tbody>
            {data.rows.map((c) => <tr key={c.id}><td><div className="cell-title">{c.full_name}</div><div className="cell-sub">{c.email}</div></td><td>{c.national_id}</td><td>{c.phone}</td><td>{c.appointments}</td><td>{fmtDateTime(c.created_at)}</td><td><Active on={c.is_active} /></td>
              {canEdit && <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => { setErr(''); setEdit({ ...c, is_active: !!c.is_active }); }}><Pencil size={14} /> Edit</button></div></td>}</tr>)}
          </tbody></table></div>
          <Pagination total={data.total} limit={15} offset={offset} onChange={setOffset} />
        </>
      )}
      {edit && <Modal title="Edit citizen" onClose={() => setEdit(null)} footer={<><button className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save</button></>}>
        <div className="stack">{err && <Alert>{err}</Alert>}
          <TextInput label="Full name" value={edit.full_name} onChange={(e) => setEdit({ ...edit, full_name: e.target.value })} />
          <TextInput label="Phone" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} />
          <TextInput label="Email" value={edit.email} disabled /><Switch checked={edit.is_active} onChange={(v) => setEdit({ ...edit, is_active: v })} label="Account active (deactivating signs the citizen out)" /></div></Modal>}
    </>
  );
}

/* ============================== offices ============================== */
const blankOffice = { code: '', name: '', address: '', city: '', phone: '', email: '', openingHours: 'Mon-Fri 08:30 - 16:30', isActive: true };
export function AdminOffices() {
  const toast = useToast(); const { data, loading, error, reload } = useFetch('/admin/offices');
  const [edit, setEdit] = useState(null); const [svc, setSvc] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true); setErr('');
    try { edit.id ? await api.put(`/admin/offices/${edit.id}`, edit) : await api.post('/admin/offices', edit); toast.success('Office saved.'); setEdit(null); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const open = (o) => { setErr(''); setEdit(o ? { id: o.id, code: o.code, name: o.name, address: o.address, city: o.city, phone: o.phone || '', email: o.email || '', openingHours: o.opening_hours || '', isActive: !!o.is_active } : { ...blankOffice }); };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  return (
    <>
      <PageHead title="Government offices" subtitle="Where citizens are served."><button className="btn btn-primary" onClick={() => open()}><Plus size={17} /> Add office</button></PageHead>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <div className="card"><EmptyState icon={Building2} title="No offices yet" /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Office</th><th>Location</th><th>Hours</th><th>Services</th><th>Staff</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((o) => <tr key={o.id}><td><div className="cell-title">{o.name}</div><div className="cell-sub">{o.code}</div></td><td>{o.address}<div className="cell-sub">{o.city}</div></td><td>{o.opening_hours}</td><td>{o.service_count}</td><td>{o.staff_count}</td><td><Active on={o.is_active} /></td>
            <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => setSvc(o)}><Settings2 size={14} /> Services</button><button className="btn btn-outline btn-sm" onClick={() => open(o)}><Pencil size={14} /> Edit</button></div></td></tr>)}
        </tbody></table></div>
      )}
      {edit && <Modal title={edit.id ? 'Edit office' : 'Add office'} onClose={() => setEdit(null)} footer={<><button className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save office</button></>}>
        <div className="stack">{err && <Alert>{err}</Alert>}<div className="form-grid"><TextInput label="Name" value={edit.name} onChange={set('name')} full /><TextInput label="Code" value={edit.code} onChange={set('code')} hint="Short unique code, e.g. CCC" /><TextInput label="City" value={edit.city} onChange={set('city')} />
          <TextInput label="Address" value={edit.address} onChange={set('address')} full /><TextInput label="Phone" value={edit.phone} onChange={set('phone')} /><TextInput label="Email" value={edit.email} onChange={set('email')} /><TextInput label="Opening hours" value={edit.openingHours} onChange={set('openingHours')} full /></div>
          <Switch checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Office is active (visible for booking)" /></div></Modal>}
      {svc && <OfficeServices office={svc} onClose={() => { setSvc(null); reload(); }} />}
    </>
  );
}

function OfficeServices({ office, onClose }) {
  const toast = useToast(); const { data, loading } = useFetch(`/admin/offices/${office.id}/services`);
  const [sel, setSel] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const chosen = sel || new Set((data || []).filter((s) => s.offered).map((s) => s.id));
  const toggle = (id) => { const n = new Set(chosen); n.has(id) ? n.delete(id) : n.add(id); setSel(n); };
  const save = async () => { setBusy(true); setErr(''); try { await api.put(`/admin/offices/${office.id}/services`, { serviceIds: [...chosen] }); toast.success('Services updated for this office.'); onClose(); } catch (e) { setErr(e.message); setBusy(false); } };
  return (
    <Modal title={`Services at ${office.name}`} onClose={onClose} footer={<><button className="btn btn-outline" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy || loading}>Save</button></>}>
      {loading ? <PageLoading /> : <div className="perm-grid">{err && <Alert>{err}</Alert>}{data.map((s) => <label className="checkbox" key={s.id}><input type="checkbox" checked={chosen.has(s.id)} onChange={() => toggle(s.id)} /><span>{s.name} <span className="muted small">- {s.category}{s.service_active ? '' : ' (inactive)'}</span></span></label>)}</div>}
    </Modal>
  );
}

/* ============================== services ============================== */
const blankSvc = { code: '', name: '', category: '', description: '', requirements: '', processingInfo: '', icon: 'FileText', durationMinutes: 30, requiresApproval: false, isActive: true };
export function AdminServices() {
  const toast = useToast(); const { data, loading, error, reload } = useFetch('/admin/services');
  const [edit, setEdit] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const open = (s) => { setErr(''); setEdit(s ? { id: s.id, code: s.code, name: s.name, category: s.category, description: s.description, requirements: (s.requirements || []).join('\n'), processingInfo: s.processing_info || '', icon: s.icon, durationMinutes: s.duration_minutes, requiresApproval: !!s.requires_approval, isActive: !!s.is_active } : { ...blankSvc }); };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const save = async () => {
    setBusy(true); setErr('');
    try { edit.id ? await api.put(`/admin/services/${edit.id}`, edit) : await api.post('/admin/services', edit); toast.success('Service saved.'); setEdit(null); reload(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const toggleActive = async (s) => {
    try { await api.put(`/admin/services/${s.id}`, { code: s.code, name: s.name, category: s.category, description: s.description, requirements: s.requirements, processingInfo: s.processing_info, icon: s.icon, durationMinutes: s.duration_minutes, requiresApproval: !!s.requires_approval, isActive: !s.is_active }); toast.success(s.is_active ? 'Service deactivated - it can no longer be booked.' : 'Service activated.'); reload(); } catch (e) { toast.error(e.message); }
  };
  return (
    <>
      <PageHead title="Government services" subtitle="Add, edit or deactivate the services citizens can book."><button className="btn btn-primary" onClick={() => open()}><Plus size={17} /> Add service</button></PageHead>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <div className="card"><EmptyState icon={Layers} title="No services yet" /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Service</th><th>Category</th><th>Duration</th><th>Offices</th><th>Bookings</th><th>Approval</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((s) => <tr key={s.id}><td><div className="row" style={{ flexWrap: 'nowrap' }}><span style={{ color: 'var(--primary)' }}><ServiceIcon name={s.icon} size={20} /></span><div><div className="cell-title">{s.name}</div><div className="cell-sub">{s.code}</div></div></div></td><td>{s.category}</td><td>{s.duration_minutes} min</td><td>{s.office_count}</td><td>{s.appointment_count}</td><td>{s.requires_approval ? 'Officer confirms' : 'Automatic'}</td><td><Active on={s.is_active} /></td>
            <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => open(s)}><Pencil size={14} /> Edit</button><button className={`btn btn-sm ${s.is_active ? 'btn-danger' : 'btn-success'}`} onClick={() => toggleActive(s)}>{s.is_active ? 'Deactivate' : 'Activate'}</button></div></td></tr>)}
        </tbody></table></div>
      )}
      {edit && <Modal wide title={edit.id ? 'Edit service' : 'Add service'} onClose={() => setEdit(null)} footer={<><button className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save service</button></>}>
        <div className="stack">{err && <Alert>{err}</Alert>}
          <div className="form-grid"><TextInput label="Name" value={edit.name} onChange={set('name')} /><TextInput label="Code" value={edit.code} onChange={set('code')} hint="Short unique code" />
            <TextInput label="Category" value={edit.category} onChange={set('category')} /><TextInput label="Duration (minutes)" type="number" value={edit.durationMinutes} onChange={set('durationMinutes')} />
            <Field label="Description" full><textarea className="textarea" value={edit.description} onChange={set('description')} /></Field>
            <Field label="Requirements (one per line)" full><textarea className="textarea" value={edit.requirements} onChange={set('requirements')} placeholder={'National ID card\nCompleted application form'} /></Field>
            <TextInput label="Processing information" value={edit.processingInfo} onChange={set('processingInfo')} full />
            <Field label="Icon"><select className="select" value={edit.icon} onChange={set('icon')}>{ICON_NAMES.map((i) => <option key={i}>{i}</option>)}</select></Field></div>
          <Switch checked={edit.requiresApproval} onChange={(v) => setEdit({ ...edit, requiresApproval: v })} label="Bookings must be confirmed by an officer (start as Pending)" />
          <Switch checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Service is active" /></div></Modal>}
    </>
  );
}

/* ============================== staff accounts ============================== */
const PERM_LABEL = { 'appointments.manage': 'Reschedule / cancel appointments and view all office bookings', 'schedules.manage': 'Manage office schedules and slot capacities', 'reports.view': 'View reports for their office', 'citizens.view': 'View the citizen directory' };
export function AdminStaff() {
  const toast = useToast(); const { data, loading, error, reload } = useFetch('/admin/staff'); const offices = useFetch('/admin/offices'); const meta = useFetch('/admin/meta');
  const [edit, setEdit] = useState(null); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const open = (s) => { setErr(''); setEdit(s ? { id: s.id, fullName: s.full_name, email: s.email, phone: s.phone, officeId: s.office_id || '', permissions: s.permissions, isActive: !!s.is_active, password: '' } : { fullName: '', email: '', phone: '', officeId: offices.data?.[0]?.id || '', permissions: [], isActive: true, password: '' }); };
  const set = (k) => (e) => setEdit({ ...edit, [k]: e.target.value });
  const togglePerm = (p) => setEdit({ ...edit, permissions: edit.permissions.includes(p) ? edit.permissions.filter((x) => x !== p) : [...edit.permissions, p] });
  const save = async () => {
    setBusy(true); setErr('');
    try {
      edit.id ? await api.patch(`/admin/staff/${edit.id}`, { ...edit, newPassword: edit.password || undefined }) : await api.post('/admin/staff', edit);
      toast.success('Staff account saved.'); setEdit(null); reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="Staff accounts" subtitle="Create employee accounts and choose what each person may do."><button className="btn btn-primary" onClick={() => open()}><Plus size={17} /> Add staff member</button></PageHead>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.length === 0 ? <div className="card"><EmptyState icon={UserCog} title="No staff yet" /></div> : (
        <div className="table-wrap"><table className="table"><thead><tr><th>Employee</th><th>Office</th><th>Extra permissions</th><th>Last login</th><th>Status</th><th /></tr></thead><tbody>
          {data.map((s) => <tr key={s.id}><td><div className="cell-title">{s.full_name}</div><div className="cell-sub">{s.email}</div></td><td>{s.office_name || '-'}</td>
            <td>{s.permissions.length ? s.permissions.map((p) => <span key={p} className="badge b-confirmed b-plain" style={{ margin: 2 }}>{p}</span>) : <span className="muted small">Front desk only</span>}</td><td>{s.last_login_at ? fmtDateTime(s.last_login_at) : 'Never'}</td><td><Active on={s.is_active} /></td>
            <td><div className="actions"><button className="btn btn-outline btn-sm" onClick={() => open(s)}><Pencil size={14} /> Edit</button></div></td></tr>)}
        </tbody></table></div>
      )}
      {edit && <Modal wide title={edit.id ? 'Edit staff member' : 'Add staff member'} onClose={() => setEdit(null)} footer={<><button className="btn btn-outline" onClick={() => setEdit(null)}>Cancel</button><button className="btn btn-primary" onClick={save} disabled={busy}>Save</button></>}>
        <div className="stack">{err && <Alert>{err}</Alert>}
          <div className="form-grid"><TextInput label="Full name" value={edit.fullName} onChange={set('fullName')} /><TextInput label="Email" value={edit.email} onChange={set('email')} disabled={!!edit.id} /><TextInput label="Phone" value={edit.phone} onChange={set('phone')} />
            <Field label="Office"><select className="select" value={edit.officeId} onChange={set('officeId')}><option value="">Select office...</option>{(offices.data || []).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}</select></Field>
            <TextInput label={edit.id ? 'Reset password (optional)' : 'Password'} password value={edit.password} onChange={set('password')} autoComplete="new-password" hint="8+ characters with a letter and a number" full /></div>
          <div><div className="label" style={{ marginBottom: 8 }}>Permissions beyond the front desk</div><div className="perm-grid">{(meta.data?.permissions || []).map((p) => <label key={p} className="checkbox"><input type="checkbox" checked={edit.permissions.includes(p)} onChange={() => togglePerm(p)} /><span><strong>{p}</strong> <span className="muted small">- {PERM_LABEL[p]}</span></span></label>)}</div></div>
          {edit.id && <Switch checked={edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} label="Account active" />}</div></Modal>}
    </>
  );
}
