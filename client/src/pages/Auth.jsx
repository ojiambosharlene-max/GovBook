import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarCheck, Lock, BadgeCheck, Clock } from 'lucide-react';
import { Logo, ThemeToggle } from '../components/brand.jsx';
import { Alert, TextInput } from '../components/ui.jsx';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import { api } from '../services/api.js';

function AuthShell({ children, title, subtitle }) {
  return (
    <div className="auth-page">
      <aside className="auth-side">
        <Logo />
        <div>
          <h2>Government services, without the guesswork.</h2>
          <p>One account to book, track and manage every appointment with a government office.</p>
          <ul>
            <li><BadgeCheck size={20} /> Guaranteed slots - no double bookings</li>
            <li><CalendarCheck size={20} /> Confirmations that never disappear</li>
            <li><Clock size={20} /> Live queue numbers on the day</li>
            <li><Lock size={20} /> Your data stays private and secure</li>
          </ul>
        </div>
        <p className="small" style={{ opacity: .7 }}>&copy; {new Date().getFullYear()} GovBook</p>
      </aside>
      <div className="auth-main">
        <div className="auth-top"><Link to="/" className="btn btn-ghost btn-sm"><ArrowLeft size={16} /> Home</Link><ThemeToggle /></div>
        <div className="auth-card page-enter">
          <div className="auth-mobile-logo" style={{ marginBottom: 22 }}><Logo /></div>
          <h1>{title}</h1>
          <p className="muted" style={{ marginBottom: 22 }}>{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

const DEMO = [
  ['Citizen', 'citizen@govbook.demo'], ['Staff (Central office)', 'staff.central@govbook.demo'], ['Administrator', 'admin@govbook.demo'],
];

export function Login() {
  const { user, login } = useAuth(); const nav = useNavigate(); const loc = useLocation();
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={loc.state?.from || homeFor(user.role)} replace />;

  const submit = async (e) => {
    e.preventDefault(); setError('');
    const errs = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = 'Enter a valid email address';
    if (!password) errs.password = 'Enter your password';
    setErrors(errs); if (Object.keys(errs).length) return;
    setBusy(true);
    try { const u = await login(email.trim(), password); nav(loc.state?.from || homeFor(u.role), { replace: true }); } catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to manage your appointments.">
      <form className="stack" onSubmit={submit} noValidate>
        {loc.state?.from && <Alert type="info">Please sign in to continue.</Alert>}
        {error && <Alert>{error}</Alert>}
        <TextInput label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} error={errors.email} autoComplete="email" placeholder="you@example.com" />
        <TextInput label="Password" password value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} autoComplete="current-password" placeholder="Your password" />
        <div className="row between"><span /><Link to="/forgot-password" className="small strong">Forgot password?</Link></div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Signing in...' : 'Sign in'}</button>
        <p className="center muted">New here? <Link to="/register" className="strong">Create an account</Link></p>
        <div className="demo-box">
          <div className="strong" style={{ marginBottom: 4 }}>Demo accounts <span className="muted">(password: Password@123)</span></div>
          {DEMO.map(([l, em]) => <button type="button" key={em} onClick={() => { setEmail(em); setPassword('Password@123'); }}>{l} - {em}</button>)}
        </div>
      </form>
    </AuthShell>
  );
}

export function Register() {
  const { user, register } = useAuth(); const nav = useNavigate(); const toast = useToast();
  const [f, setF] = useState({ fullName: '', email: '', phone: '', nationalId: '', password: '', confirmPassword: '' });
  const [errors, setErrors] = useState({}); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user.role)} replace />;
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const validate = () => {
    const e = {};
    if (f.fullName.trim().length < 3) e.fullName = 'Enter your full name (at least 3 characters)';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address';
    if (!/^\+?[0-9][0-9 ()-]{6,19}$/.test(f.phone)) e.phone = 'Enter a valid phone number, e.g. +254 712 345 678';
    if (!/^[A-Za-z0-9-]{5,20}$/.test(f.nationalId)) e.nationalId = 'National ID must be 5-20 letters or digits';
    if (f.password.length < 8 || !/[A-Za-z]/.test(f.password) || !/\d/.test(f.password)) e.password = 'At least 8 characters with a letter and a number';
    if (f.confirmPassword !== f.password) e.confirmPassword = 'Passwords do not match';
    return e;
  };
  const submit = async (ev) => {
    ev.preventDefault(); setError('');
    const e = validate(); setErrors(e); if (Object.keys(e).length) return;
    setBusy(true);
    try { await register({ ...f, email: f.email.trim(), fullName: f.fullName.trim() }); toast.success('Account created - welcome to GovBook!'); nav('/app', { replace: true }); }
    catch (x) { setError(x.message); if (x.data?.field) setErrors({ [x.data.field]: x.message }); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Create your account" subtitle="It takes less than a minute. Citizens only - staff accounts are created by an administrator.">
      <form className="stack" onSubmit={submit} noValidate>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Full name" value={f.fullName} onChange={set('fullName')} error={errors.fullName} autoComplete="name" placeholder="As shown on your ID" />
        <div className="form-grid">
          <TextInput label="Email address" type="email" value={f.email} onChange={set('email')} error={errors.email} autoComplete="email" />
          <TextInput label="Phone number" type="tel" value={f.phone} onChange={set('phone')} error={errors.phone} autoComplete="tel" placeholder="+254 7XX XXX XXX" />
        </div>
        <TextInput label="National ID number" value={f.nationalId} onChange={set('nationalId')} error={errors.nationalId} placeholder="e.g. 30123456" />
        <div className="form-grid">
          <TextInput label="Password" password value={f.password} onChange={set('password')} error={errors.password} autoComplete="new-password" hint="8+ characters, letters and numbers" />
          <TextInput label="Confirm password" password value={f.confirmPassword} onChange={set('confirmPassword')} error={errors.confirmPassword} autoComplete="new-password" />
        </div>
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Creating account...' : 'Create account'}</button>
        <p className="center muted small">By registering you agree to our <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>.</p>
        <p className="center muted">Already registered? <Link to="/login" className="strong">Sign in</Link></p>
      </form>
    </AuthShell>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [res, setRes] = useState(null);
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Enter a valid email address'); return; }
    setBusy(true);
    try { setRes(await api.post('/auth/forgot-password', { email: email.trim() })); } catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Forgot your password?" subtitle="Enter your email and we will send you a link to choose a new one.">
      {res ? (
        <div className="stack">
          <Alert type="success">{res.message}</Alert>
          {res.devResetLink && (
            <Alert type="info">
              <strong>Development mode:</strong> no email server is configured, so the link is shown here instead.<br />
              <Link to={res.devResetLink} className="strong">Open the reset page</Link>
            </Alert>
          )}
          <Link to="/login" className="btn btn-outline">Back to sign in</Link>
        </div>
      ) : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert>{error}</Alert>}
          <TextInput label="Email address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Sending...' : 'Send reset link'}</button>
          <p className="center"><Link to="/login">Back to sign in</Link></p>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const [sp] = useSearchParams(); const nav = useNavigate(); const toast = useToast();
  const [password, setPassword] = useState(''); const [confirmPassword, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const token = sp.get('token');
  const submit = async (e) => {
    e.preventDefault(); setError('');
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) { setError('Password needs at least 8 characters with a letter and a number'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match'); return; }
    setBusy(true);
    try { const r = await api.post('/auth/reset-password', { token, password, confirmPassword }); toast.success(r.message); nav('/login', { replace: true }); } catch (x) { setError(x.message); } finally { setBusy(false); }
  };
  return (
    <AuthShell title="Choose a new password" subtitle="Pick something strong that you do not use elsewhere.">
      {!token ? <Alert>This reset link is incomplete. Please request a new one.</Alert> : (
        <form className="stack" onSubmit={submit} noValidate>
          {error && <Alert>{error}</Alert>}
          <TextInput label="New password" password value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
          <TextInput label="Confirm new password" password value={confirmPassword} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Saving...' : 'Reset password'}</button>
        </form>
      )}
    </AuthShell>
  );
}

export function LegalPage({ kind }) {
  const privacy = kind === 'privacy';
  return (
    <div className="section"><div className="container" style={{ maxWidth: 820 }}>
      <div className="card stack page-enter" style={{ gap: 16 }}>
        <h1>{privacy ? 'Privacy Policy' : 'Terms and Conditions'}</h1>
        <p className="muted">Last updated {new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}. This is sample text for the demonstration platform - replace it with your organisation's approved wording before going live.</p>
        {(privacy ? [
          ['What we collect', 'Your name, email address, phone number and National ID number, plus the appointments you book. Passwords are never stored in readable form.'],
          ['How we use it', 'To create and confirm your appointments, to let office staff verify you on arrival, and to send notifications about your bookings.'],
          ['Who can see it', 'You, the staff of the office where you have an appointment, and system administrators. Every access to a record is role-controlled and audited.'],
          ['Your choices', 'You can update your contact details and notification preferences at any time from your profile and settings pages.'],
        ] : [
          ['Using the service', 'Appointments are offered for the listed government services only. Please provide accurate details and arrive on time with the documents listed for your service.'],
          ['Cancellations', 'You may cancel a booking before it starts so that the slot can be used by another citizen. Repeated missed appointments may limit future bookings.'],
          ['Accounts', 'Keep your password confidential. You are responsible for activity on your account.'],
          ['Changes', 'Offices may reschedule or cancel appointments when necessary; you will be notified in your dashboard.'],
        ]).map(([t, d]) => <section key={t}><h3 style={{ marginBottom: 6 }}>{t}</h3><p className="muted">{d}</p></section>)}
        <div><Link to="/" className="btn btn-outline">Back to home</Link></div>
      </div>
    </div></div>
  );
}
