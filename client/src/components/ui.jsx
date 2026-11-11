import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Info, Search, X, Eye, EyeOff, Inbox } from 'lucide-react';
import { STATUS_CLASS } from '../utils/format.js';

export const Spinner = () => <span className="spinner" role="status" aria-label="Loading" />;
export const PageLoading = ({ text = 'Loading...' }) => <div className="page-loading"><Spinner /><span>{text}</span></div>;

export function EmptyState({ icon: Icon = Inbox, title, text, action }) {
  return (
    <div className="empty">
      <div className="ico"><Icon size={28} /></div>
      <h4>{title}</h4>
      {text && <p style={{ maxWidth: 360 }}>{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="card"><EmptyState icon={AlertTriangle} title="Something went wrong" text={error?.message || 'Please try again.'}
      action={onRetry && <button className="btn btn-outline btn-sm" onClick={onRetry}>Try again</button>} /></div>
  );
}

export const StatusBadge = ({ status }) => <span className={`badge ${STATUS_CLASS[status] || ''}`}>{status}</span>;

export function Kpi({ icon: Icon, label, value, tone = '', sub, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag className={`card kpi ${tone}`} onClick={onClick} style={onClick ? { textAlign: 'left', cursor: 'pointer', font: 'inherit', color: 'inherit' } : undefined}>
      <div className="ico"><Icon size={24} /></div>
      <div><div className="num">{value}</div><div className="lbl">{label}</div>{sub && <div className="tiny muted">{sub}</div>}</div>
    </Tag>
  );
}

export const PageHead = ({ title, subtitle, children }) => (
  <div className="page-head page-enter">
    <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
    {children && <div className="row">{children}</div>}
  </div>
);

export function Field({ label, error, hint, children, full, htmlFor }) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      {label && <label htmlFor={htmlFor}>{label}</label>}
      {children}
      {error ? <span className="field-error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

/** Text input with an optional show/hide toggle for passwords. */
export function TextInput({ label, error, hint, full, password, id, ...props }) {
  const auto = useId(); const fid = id || auto; const [show, setShow] = useState(false);
  const { type, ...rest } = props;
  return (
    <Field label={label} error={error} hint={hint} full={full} htmlFor={fid}>
      <div className="input-wrap">
        <input id={fid} className="input" aria-invalid={!!error} {...rest} type={password ? (show ? 'text' : 'password') : type || 'text'} />
        {password && (
          <button type="button" className="icon-btn toggle" style={{ border: 0, width: 34, height: 34 }} onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}>
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        )}
      </div>
    </Field>
  );
}

export const Alert = ({ type = 'danger', children }) => {
  const Icon = type === 'success' ? CheckCircle2 : type === 'info' ? Info : AlertTriangle;
  return <div className={`alert alert-${type}`} role={type === 'danger' ? 'alert' : 'status'}><Icon size={18} /><div className="grow">{children}</div></div>;
};

export function Modal({ title, onClose, children, footer, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const prev = document.activeElement;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    const first = ref.current && ref.current.querySelector('input, select, textarea, button:not([data-close])');
    if (first) first.focus();
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; if (prev && prev.focus) prev.focus(); };
  }, [onClose]);
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="modal-head"><h3>{title}</h3><button data-close className="icon-btn" onClick={onClose} aria-label="Close"><X size={18} /></button></div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Confirmation dialog; with `reasonLabel` it also collects a (required) reason, e.g. for cancellations. */
export function ConfirmDialog({ title, message, confirmText = 'Confirm', danger, reasonLabel, reasonRequired, onConfirm, onClose }) {
  const [reason, setReason] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const go = async () => {
    if (reasonLabel && reasonRequired && reason.trim().length < 3) { setErr('Please enter a reason (at least 3 characters).'); return; }
    setBusy(true); setErr('');
    try { await onConfirm(reason.trim()); onClose(); } catch (e) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose} footer={<>
      <button className="btn btn-outline" onClick={onClose} disabled={busy}>Keep it</button>
      <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={go} disabled={busy}>{busy ? 'Working...' : confirmText}</button>
    </>}>
      <div className="stack">
        <p>{message}</p>
        {reasonLabel && <Field label={reasonLabel}><textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} placeholder="Type here..." /></Field>}
        {err && <Alert>{err}</Alert>}
      </div>
    </Modal>
  );
}

export function SearchBox({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="search">
      <Search size={17} />
      <input className="input" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
    </div>
  );
}

export function Pagination({ total, limit, offset, onChange }) {
  if (!total) return null;
  const page = Math.floor(offset / limit) + 1; const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="pagination">
      <span className="muted small">Showing {offset + 1}-{Math.min(offset + limit, total)} of {total}</span>
      <div className="row">
        <button className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => onChange(offset - limit)}><ChevronLeft size={16} /> Previous</button>
        <span className="small muted">Page {page} / {pages}</span>
        <button className="btn btn-outline btn-sm" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next <ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => <button key={t.value} role="tab" aria-selected={value === t.value} className="tab" onClick={() => onChange(t.value)}>{t.label}</button>)}
    </div>
  );
}

export function Switch({ checked, onChange, label }) {
  return <label className="switch"><input type="checkbox" checked={!!checked} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}
