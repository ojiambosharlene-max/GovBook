import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, BellRing, CheckCheck, CalendarCheck, CalendarX, Megaphone, Monitor, Moon, Sun, Ticket, CalendarClock } from 'lucide-react';
import { Alert, EmptyState, ErrorState, PageHead, PageLoading, Switch, TextInput } from '../components/ui.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useTheme } from '../context/ThemeContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api, setToken } from '../services/api.js';
import { fmtDateTime } from '../utils/format.js';

const ICON = { appointment_confirmed: CalendarCheck, appointment_pending: CalendarClock, appointment_cancelled: CalendarX, appointment_updated: CalendarClock, appointment_completed: CalendarCheck, appointment_noshow: CalendarX, queue_update: Ticket, announcement: Megaphone };
const TONE = { appointment_cancelled: 't-cancelled', appointment_noshow: 't-cancelled', appointment_confirmed: 't-ok', appointment_completed: 't-ok' };

export function Notifications() {
  const { data, loading, error, reload } = useFetch('/notifications', { poll: 20000 });
  const toast = useToast();
  const markAll = async () => { await api.post('/notifications/read-all'); toast.success('All notifications marked as read.'); reload(); };
  const markOne = async (n) => { if (!n.is_read) { await api.post(`/notifications/${n.id}/read`); reload(); } };
  return (
    <>
      <PageHead title="Notifications" subtitle="Updates about your appointments and announcements from the offices.">
        {data && data.unread > 0 && <button className="btn btn-outline" onClick={markAll}><CheckCheck size={17} /> Mark all as read ({data.unread})</button>}
      </PageHead>
      {loading ? <PageLoading /> : error ? <ErrorState error={error} onRetry={reload} /> : data.rows.length === 0 ? <div className="card"><EmptyState icon={Bell} title="No notifications yet" text="You will be notified when appointments are created, updated or cancelled." /></div> : (
        <div className="page-enter">
          {data.rows.map((n) => { const I = ICON[n.type] || Bell; return (
            <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'} ${TONE[n.type] || ''}`} onClick={() => markOne(n)}>
              <div className="ico"><I size={19} /></div>
              <div className="grow"><div className="row between" style={{ gap: 8 }}><span className="strong">{n.title}</span><span className="tiny muted">{fmtDateTime(n.created_at)}</span></div>
                <div className="muted small" style={{ marginTop: 3 }}>{n.message}</div>
                {n.appointment_id && <Link to={`/app/appointments/${n.appointment_id}`} className="small strong">View appointment</Link>}</div>
              {!n.is_read && <span className="badge b-confirmed b-plain" style={{ alignSelf: 'flex-start' }}>New</span>}
            </div>); })}
        </div>
      )}
    </>
  );
}

export function Profile() {
  const { user, setUser } = useAuth(); const toast = useToast();
  const [f, setF] = useState({ fullName: user.fullName, phone: user.phone }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api.patch('/auth/profile', f); setUser(r.user); toast.success('Profile updated.'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <>
      <PageHead title="My Profile" subtitle="Your personal details." />
      <div className="grid grid-main">
        <form className="card stack" onSubmit={save} noValidate>
          {err && <Alert>{err}</Alert>}
          <div className="form-grid">
            <TextInput label="Full name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
            <TextInput label="Phone number" type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
            <TextInput label="Email address" value={user.email} disabled hint="Contact support to change your email." />
            <TextInput label="National ID number" value={user.nationalId || '-'} disabled hint="Verified at registration." />
          </div>
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Saving...' : 'Save changes'}</button></div>
        </form>
        <div className="card stack"><h3>Account</h3>
          <div className="summary-list"><div className="summary-row"><span>Role</span><span style={{ textTransform: 'capitalize' }}>{user.role}</span></div>
            {user.officeName && <div className="summary-row"><span>Office</span><span>{user.officeName}</span></div>}</div></div>
      </div>
    </>
  );
}

export function SettingsPage() {
  const { user, setUser } = useAuth(); const { theme, setTheme } = useTheme(); const toast = useToast();
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' }); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const savePref = async (patch) => {
    try { const r = await api.patch('/auth/settings', { notifyEmail: user.notifyEmail, notifySms: user.notifySms, ...patch }); setUser(r.user); toast.success('Preferences saved.'); } catch (x) { toast.error(x.message); }
  };
  const changePw = async (e) => {
    e.preventDefault(); setErr(''); setBusy(true);
    try { const r = await api.post('/auth/change-password', pw); setToken(r.token); setPw({ currentPassword: '', newPassword: '', confirmPassword: '' }); toast.success('Password updated.'); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const themes = [['light', 'Light', Sun], ['dark', 'Dark', Moon]];
  return (
    <>
      <PageHead title="Settings" subtitle="Appearance, notifications and security." />
      <div className="grid grid-2">
        <div className="stack" style={{ gap: 18 }}>
          <div className="card stack">
            <h3>Appearance</h3><p className="muted small">Your choice is remembered on this device.</p>
            <div className="row">{themes.map(([v, l, I]) => <button key={v} className={`btn ${theme === v ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTheme(v)} aria-pressed={theme === v}><I size={17} /> {l}</button>)}</div>
          </div>
          <div className="card stack">
            <h3>Notifications</h3><p className="muted small">In-app notifications are always on. E-mail and SMS delivery will start once your office connects a provider.</p>
            <Switch checked={user.notifyEmail} onChange={(v) => savePref({ notifyEmail: v })} label="E-mail me about my appointments" />
            <Switch checked={user.notifySms} onChange={(v) => savePref({ notifySms: v })} label="Send me SMS reminders" />
          </div>
        </div>
        <form className="card stack" onSubmit={changePw} noValidate>
          <h3>Change password</h3>
          {err && <Alert>{err}</Alert>}
          <TextInput label="Current password" password value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} autoComplete="current-password" />
          <TextInput label="New password" password value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} autoComplete="new-password" hint="8+ characters with a letter and a number" />
          <TextInput label="Confirm new password" password value={pw.confirmPassword} onChange={(e) => setPw({ ...pw, confirmPassword: e.target.value })} autoComplete="new-password" />
          <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Updating...' : 'Update password'}</button></div>
        </form>
      </div>
    </>
  );
}
