import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(null);
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const remove = useCallback((id) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((type, message) => {
    const id = Math.random().toString(36).slice(2);
    setItems((l) => [...l.slice(-3), { id, type, message }]);
    setTimeout(() => remove(id), type === 'error' ? 7000 : 4500);
  }, [remove]);
  const api = useMemo(() => ({ success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m) }), [push]);
  const Icon = { success: CheckCircle2, error: AlertTriangle, info: Info };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-host" role="status" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.type];
          return (
            <div key={t.id} className={`toast t-${t.type}`}>
              <I size={19} style={{ color: t.type === 'success' ? 'var(--success)' : t.type === 'error' ? 'var(--danger)' : 'var(--primary)', flexShrink: 0, marginTop: 1 }} />
              <div className="grow">{t.message}</div>
              <button className="btn-ghost" style={{ border: 0, background: 'none', cursor: 'pointer', color: 'var(--muted)' }} aria-label="Dismiss" onClick={() => remove(t.id)}><X size={16} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
