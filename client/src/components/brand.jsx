import { Link } from 'react-router-dom';
import { Landmark, Moon, Sun, IdCard, Plane, Baby, Car, Briefcase, Receipt, Map, Heart, ShieldCheck, House, FileText } from 'lucide-react';
import { useTheme } from '../context/ThemeContext.jsx';

export const Logo = ({ to = '/', subtitle = true }) => (
  <Link to={to} className="logo" aria-label="GovBook home">
    <span className="logo-mark"><Landmark size={21} /></span>
    <span>GovBook{subtitle && <small>Digital Government</small>}</span>
  </Link>
);

export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button className="icon-btn" onClick={toggle} aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'} data-testid="theme-toggle">
      {dark ? <Sun size={19} /> : <Moon size={19} />}
    </button>
  );
}

export const AppBackground = () => (
  <div className="app-bg" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /></div>
);

const ICONS = { IdCard, Plane, Baby, Car, Briefcase, Receipt, Map, Heart, ShieldCheck, Home: House, House, FileText };
export const ServiceIcon = ({ name, size = 24 }) => { const I = ICONS[name] || FileText; return <I size={size} />; };
export const ICON_NAMES = Object.keys(ICONS).filter((n) => n !== 'House');

/** Original illustration: a civic building, a booking calendar, a queue ticket and a confirmation badge. */
export function HeroArt() {
  const cols = [0, 1, 2, 3, 4];
  return (
    <svg viewBox="0 0 560 500" role="img" aria-label="Illustration of a government building with an online appointment calendar, a queue ticket and a booking confirmation">
      <defs>
        <linearGradient id="hg-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#c9dbff" /></linearGradient>
        <linearGradient id="hg-roof" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2d5bff" /><stop offset="1" stopColor="#14b8a6" /></linearGradient>
        <linearGradient id="hg-card" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#eaf0ff" /></linearGradient>
        <radialGradient id="hg-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#ffffff" stopOpacity=".35" /><stop offset="1" stopColor="#ffffff" stopOpacity="0" /></radialGradient>
      </defs>
      <circle cx="280" cy="260" r="230" fill="url(#hg-glow)" />
      <circle cx="280" cy="260" r="190" fill="none" stroke="#fff" strokeOpacity=".18" strokeDasharray="4 10" />
      {/* building */}
      <g>
        <ellipse cx="190" cy="438" rx="170" ry="16" fill="#000" opacity=".18" />
        <path d="M40 180 L190 90 L340 180 Z" fill="url(#hg-roof)" />
        <path d="M70 180 L190 112 L310 180 Z" fill="#fff" opacity=".18" />
        <circle cx="190" cy="152" r="14" fill="#fff" opacity=".9" /><path d="M190 143v18M181 152h18" stroke="#0b1f4b" strokeWidth="3" strokeLinecap="round" />
        <rect x="48" y="180" width="284" height="22" rx="4" fill="url(#hg-wall)" />
        {cols.map((i) => <g key={i}><rect x={68 + i * 54} y="206" width="26" height="170" rx="6" fill="url(#hg-wall)" /><rect x={64 + i * 54} y="206" width="34" height="9" rx="3" fill="#fff" /><rect x={64 + i * 54} y="368" width="34" height="9" rx="3" fill="#fff" /></g>)}
        <rect x="38" y="378" width="304" height="16" rx="4" fill="url(#hg-wall)" /><rect x="26" y="394" width="328" height="16" rx="4" fill="#dbe7ff" /><rect x="14" y="410" width="352" height="18" rx="4" fill="#b9ceff" />
        <rect x="166" y="300" width="48" height="76" rx="22" fill="#0b1f4b" opacity=".85" />
      </g>
      {/* calendar card */}
      <g className="float-a">
        <rect x="290" y="70" width="238" height="214" rx="22" fill="url(#hg-card)" />
        <path d="M290 92a22 22 0 0 1 22-22h194a22 22 0 0 1 22 22v34H290z" fill="#1f4fd8" />
        <text x="312" y="105" fill="#fff" fontSize="15" fontWeight="700" fontFamily="inherit">November</text>
        <circle cx="482" cy="98" r="5" fill="#fff" opacity=".7" /><circle cx="500" cy="98" r="5" fill="#fff" opacity=".7" />
        {Array.from({ length: 21 }).map((_, i) => {
          const x = 314 + (i % 7) * 31; const y = 152 + Math.floor(i / 7) * 36; const on = i === 9;
          return <g key={i}>{on ? <circle cx={x} cy={y} r="13" fill="#14b8a6" /> : <circle cx={x} cy={y} r="3.4" fill="#9db4e8" />}{on && <path d={`M${x - 6} ${y}l4 4 8-8`} stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />}</g>;
        })}
      </g>
      {/* queue ticket */}
      <g className="float-b">
        <rect x="318" y="296" width="116" height="84" rx="16" fill="#0b1f4b" opacity=".92" />
        <text x="334" y="322" fill="#9fc0ff" fontSize="11" fontWeight="600" fontFamily="inherit">YOUR NUMBER</text>
        <text x="334" y="358" fill="#fff" fontSize="30" fontWeight="800" fontFamily="inherit">Q-014</text>
        <circle cx="412" cy="322" r="9" fill="#14b8a6" /><path d="M408 322l3 3 6-6" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      {/* confirmation badge */}
      <g className="float-c">
        <rect x="372" y="396" width="176" height="62" rx="18" fill="#fff" />
        <circle cx="404" cy="427" r="17" fill="#dcf5e4" /><path d="M396 427l6 6 11-12" stroke="#15803d" strokeWidth="3.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <text x="430" y="422" fill="#0b1b3a" fontSize="13" fontWeight="700" fontFamily="inherit">Confirmed</text>
        <text x="430" y="441" fill="#5d6e90" fontSize="11.5" fontFamily="ui-monospace, monospace">GOV-7K3M9Q2X</text>
      </g>
      <g className="float-b"><circle cx="70" cy="70" r="26" fill="#fff" opacity=".95" /><path d="M70 55l15 6v10c0 9-6 16-15 19-9-3-15-10-15-19V61z" fill="#14b8a6" /><path d="M63 72l5 5 10-11" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" /></g>
    </svg>
  );
}
