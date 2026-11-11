const pad = (n) => String(n).padStart(2, '0');
export const parseDate = (s) => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); };
export const isoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => isoDate(new Date());
export const monthKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

export const fmtDate = (s) => (s ? parseDate(s).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : '-');
export const fmtDateLong = (s) => (s ? parseDate(s).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '-');
export const fmtTime = (t) => (t ? String(t).slice(0, 5) : '-');
export const fmtDateTime = (s) => {
  if (!s) return '-';
  const [d, t] = String(s).replace('T', ' ').split(' ');
  return `${parseDate(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}, ${String(t || '').slice(0, 5)}`;
};
export const fmtShort = (s) => parseDate(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const dateParts = (s) => { const d = parseDate(s); return { mo: d.toLocaleDateString('en-GB', { month: 'short' }), dy: d.getDate(), wd: d.toLocaleDateString('en-GB', { weekday: 'short' }) }; };
export const monthTitle = (key) => { const [y, m] = key.split('-').map(Number); return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); };
export const shiftMonth = (key, delta) => { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + delta, 1)); };

export const STATUS_CLASS = { Pending: 'b-pending', Confirmed: 'b-confirmed', 'Checked In': 'b-checked', 'In Progress': 'b-progress', Completed: 'b-completed', Cancelled: 'b-cancelled', 'No Show': 'b-noshow' };
export const ACTIVE_STATUSES = ['Pending', 'Confirmed', 'Checked In', 'In Progress'];
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const pct = (n, total) => (total ? Math.round((n / total) * 1000) / 10 : 0);

/** Downloads an .ics calendar entry so the appointment can be added to any calendar app. */
export function downloadIcs(a) {
  const d = String(a.appointment_date).slice(0, 10).replace(/-/g, ''); const t = fmtTime(a.appointment_time).replace(':', '') + '00';
  const end = (() => { const [h, m] = fmtTime(a.appointment_time).split(':').map(Number); const mins = h * 60 + m + (a.duration_minutes || 30); return `${pad(Math.floor(mins / 60) % 24)}${pad(mins % 60)}00`; })();
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//GovBook//Appointments//EN', 'BEGIN:VEVENT', `UID:${a.reference}@govbook`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART:${d}T${t}`, `DTEND:${d}T${end}`, `SUMMARY:${a.service_name} - ${a.office_name}`, `LOCATION:${a.office_address}, ${a.office_city}`, `DESCRIPTION:Reference ${a.reference}`, 'END:VEVENT', 'END:VCALENDAR'];
  save(new Blob([lines.join('\r\n')], { type: 'text/calendar' }), `appointment-${a.reference}.ics`);
}

/** Downloads a self-contained HTML slip (opens in any browser, can be printed or saved as PDF). */
export function downloadSlip(a) {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Appointment ${esc(a.reference)}</title><style>body{font-family:Arial,sans-serif;max-width:560px;margin:30px auto;padding:0 16px;color:#0b1b3a}.box{border:2px dashed #1f4fd8;border-radius:16px;padding:26px}h1{margin:0 0 4px;font-size:20px;color:#0b1f4b}.ref{font:800 28px monospace;letter-spacing:2px;color:#1f4fd8;margin:14px 0}table{width:100%;border-collapse:collapse}td{padding:9px 0;border-bottom:1px solid #e2e8f4}td:first-child{color:#5d6e90;width:38%}.note{margin-top:18px;font-size:13px;color:#5d6e90}</style></head><body><div class="box"><h1>GovBook - Appointment confirmation</h1><div>Present this reference at the office</div><div class="ref">${esc(a.reference)}</div><table>
<tr><td>Status</td><td>${esc(a.status)}</td></tr><tr><td>Service</td><td>${esc(a.service_name)}</td></tr><tr><td>Office</td><td>${esc(a.office_name)}<br>${esc(a.office_address)}, ${esc(a.office_city)}</td></tr><tr><td>Date</td><td>${esc(fmtDateLong(a.appointment_date))}</td></tr><tr><td>Time</td><td>${esc(fmtTime(a.appointment_time))}</td></tr><tr><td>Citizen</td><td>${esc(a.citizen_name)}</td></tr></table>
<div class="note"><b>Bring:</b> ${esc((a.requirements || []).join('; ') || 'your national ID')}</div><div class="note">Please arrive 10 minutes early. Booked on ${esc(fmtDateTime(a.booked_at))}.</div></div></body></html>`;
  save(new Blob([html], { type: 'text/html' }), `appointment-${a.reference}.html`);
}

export function downloadCsv(filename, rows) {
  const esc = (v) => { let s = v === null || v === undefined ? '' : String(v); if (/^[=+\-@]/.test(s)) s = `'${s}`; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  save(new Blob([rows.map((r) => r.map(esc).join(',')).join('\n')], { type: 'text/csv' }), filename);
}

function save(blob, name) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
