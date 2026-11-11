import { ChevronLeft, ChevronRight } from 'lucide-react';
import { isoDate, monthTitle, parseDate, shiftMonth, todayISO, monthKey } from '../utils/format.js';

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Month calendar driven by real availability from the database.
 * availability = { days: [{date, free, total}], closed: [{date, reason}] }
 */
export default function Calendar({ month, onMonthChange, availability, selected, onSelect, loading }) {
  const [y, m] = month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7; // Monday first
  const count = new Date(y, m, 0).getDate();
  const today = todayISO();
  const byDate = Object.fromEntries((availability?.days || []).map((d) => [d.date, d]));
  const closed = Object.fromEntries((availability?.closed || []).map((d) => [d.date, d.reason]));
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push(<span key={`e${i}`} />);
  for (let d = 1; d <= count; d++) {
    const date = isoDate(new Date(y, m - 1, d)); const info = byDate[date]; const isHoliday = closed[date] !== undefined;
    const has = info && info.free > 0; const full = info && info.free <= 0;
    const cls = ['cal-day', has ? 'avail' : '', full ? 'full' : '', isHoliday ? 'holiday' : '', date === today ? 'today' : '', selected === date ? 'sel' : ''].join(' ');
    cells.push(
      <button key={date} type="button" className={cls} disabled={!has} onClick={() => onSelect(date)} aria-pressed={selected === date}
        aria-label={`${parseDate(date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${has ? `${info.free} places free` : isHoliday ? `closed - ${closed[date]}` : full ? 'fully booked' : 'unavailable'}`}
        title={isHoliday ? `Closed: ${closed[date]}` : full ? 'Fully booked' : has ? `${info.free} places free` : 'Not available'}>
        {d}{has && <small>{info.free}</small>}
      </button>,
    );
  }
  const canPrev = month > monthKey(new Date());
  return (
    <div className="calendar" aria-busy={loading}>
      <div className="cal-head">
        <button type="button" className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, -1))} disabled={!canPrev} aria-label="Previous month"><ChevronLeft size={18} /></button>
        <h4>{monthTitle(month)}</h4>
        <button type="button" className="icon-btn" onClick={() => onMonthChange(shiftMonth(month, 1))} aria-label="Next month"><ChevronRight size={18} /></button>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {cells}
      </div>
      <div className="legend">
        <span><i style={{ background: 'var(--primary-soft)', border: '1px solid var(--primary)' }} />Available (free places)</span>
        <span><i style={{ background: 'var(--surface-3)' }} />Full / unavailable</span>
        <span><i style={{ background: 'var(--warning-soft)' }} />Office closed</span>
      </div>
    </div>
  );
}
