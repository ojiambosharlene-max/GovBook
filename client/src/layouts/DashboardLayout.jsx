import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard, CalendarPlus, CalendarCheck, History, Bell, UserCircle, Settings, LogOut, Menu, Users, Building2, Layers, CalendarDays, UserCog,
  ClipboardList, FileBarChart, ScrollText, Megaphone, ListOrdered, Search, ChevronDown, Ticket,
} from 'lucide-react';
import { AppBackground, Logo, ThemeToggle } from '../components/brand.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { initials } from '../utils/format.js';

function navFor(user) {
  const personal = [
    { to: '/app/notifications', label: 'Notifications', icon: Bell, badge: true },
    { to: '/app/profile', label: 'My Profile', icon: UserCircle }, { to: '/app/settings', label: 'Settings', icon: Settings },
  ];
  if (user.role === 'citizen') {
    return [
      { label: 'Menu', items: [
        { to: '/app', label: 'Dashboard', icon: LayoutDashboard, end: true }, { to: '/app/book', label: 'Book Appointment', icon: CalendarPlus },
        { to: '/app/appointments', label: 'My Appointments', icon: CalendarCheck }, { to: '/app/history', label: 'Appointment History', icon: History },
        ...personal,
      ] },
    ];
  }
  if (user.role === 'staff') {
    const p = user.permissions || [];
    const extra = [
      p.includes('appointments.manage') && { to: '/admin/appointments', label: 'All Appointments', icon: ClipboardList },
      p.includes('schedules.manage') && { to: '/admin/schedules', label: 'Schedules & Slots', icon: CalendarDays },
      p.includes('citizens.view') && { to: '/admin/citizens', label: 'Citizens', icon: Users },
      p.includes('reports.view') && { to: '/admin/reports', label: 'Reports', icon: FileBarChart },
    ].filter(Boolean);
    return [
      { label: 'Front desk', items: [{ to: '/staff', label: 'Today', icon: LayoutDashboard, end: true }, { to: '/staff/queue', label: 'Queue', icon: ListOrdered }, { to: '/staff/search', label: 'Find Appointment', icon: Search }] },
      ...(extra.length ? [{ label: 'Office management', items: extra }] : []),
      { label: 'Account', items: personal },
    ];
  }
  return [
    { label: 'Administration', items: [
      { to: '/admin', label: 'Overview', icon: LayoutDashboard, end: true }, { to: '/admin/appointments', label: 'Appointments', icon: ClipboardList },
      { to: '/admin/citizens', label: 'Citizens', icon: Users }, { to: '/admin/offices', label: 'Offices', icon: Building2 }, { to: '/admin/services', label: 'Services', icon: Layers },
      { to: '/admin/schedules', label: 'Schedules & Slots', icon: CalendarDays }, { to: '/admin/staff', label: 'Staff Accounts', icon: UserCog },
      { to: '/admin/notifications', label: 'Manage Notifications', icon: Megaphone }, { to: '/admin/reports', label: 'Reports', icon: FileBarChart }, { to: '/admin/audit', label: 'Audit Log', icon: ScrollText },
    ] },
    { label: 'Front desk', items: [{ to: '/staff/queue', label: 'Queue Monitor', icon: ListOrdered }, { to: '/staff/search', label: 'Find Appointment', icon: Search }] },
    { label: 'Account', items: personal },
  ];
}

export function DashboardLayout() {
  const { user, logout } = useAuth();
  const nav = useNavigate(); const { pathname } = useLocation();
  const [open, setOpen] = useState(false); const [menu, setMenu] = useState(false);
  const menuRef = useRef(null);
  const { data: unread, refresh } = useFetch('/notifications/unread-count', { poll: 30000 });
  const count = unread ? unread.unread : 0;

  useEffect(() => { setOpen(false); setMenu(false); window.scrollTo(0, 0); refresh(); }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => { if (menuRef.current && !menuRef.current.contains(e.target)) setMenu(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, []);

  const doLogout = () => { logout(); nav('/login', { replace: true }); };
  const groups = navFor(user);
  return (
    <>
      <a className="skip-link" href="#content">Skip to content</a>
      <AppBackground />
      <div className="shell">
        <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Sidebar">
          <Logo to="/" />
          <nav aria-label="Dashboard">
            {groups.map((g) => (
              <div key={g.label}>
                <div className="nav-label">{g.label}</div>
                {g.items.map((i) => (
                  <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>
                    <i.icon size={19} /><span>{i.label}</span>{i.badge && count > 0 && <span className="count">{count > 99 ? '99+' : count}</span>}
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-foot">
            <div className="user-chip"><div className="av">{initials(user.fullName)}</div><div style={{ minWidth: 0 }}><div className="nm">{user.fullName}</div><div className="rl">{user.role}{user.officeName ? ` - ${user.officeName}` : ''}</div></div></div>
            <button className="side-link" onClick={doLogout}><LogOut size={19} /><span>Logout</span></button>
          </div>
        </aside>
        <div className={`scrim ${open ? 'show' : ''}`} onClick={() => setOpen(false)} />
        <div className="main-col">
          <header className="topbar">
            <button className="icon-btn side-toggle" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
            <h1>Hello, {user.fullName.split(' ')[0]}</h1>
            <span className="spacer" />
            <ThemeToggle />
            <Link to="/app/notifications" className="icon-btn" aria-label={`Notifications${count ? `, ${count} unread` : ''}`}><Bell size={19} />{count > 0 && <span className="dot">{count > 99 ? '99+' : count}</span>}</Link>
            <div style={{ position: 'relative' }} ref={menuRef}>
              <button className="btn btn-outline btn-sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu} aria-haspopup="menu"><Ticket size={16} style={{ display: 'none' }} />{initials(user.fullName)} <ChevronDown size={14} /></button>
              {menu && (
                <div className="menu" role="menu">
                  <Link to="/app/profile" role="menuitem"><UserCircle size={17} /> My Profile</Link>
                  <Link to="/app/settings" role="menuitem"><Settings size={17} /> Settings</Link>
                  <Link to="/" role="menuitem"><LayoutDashboard size={17} /> Public website</Link>
                  <button role="menuitem" onClick={doLogout}><LogOut size={17} /> Logout</button>
                </div>
              )}
            </div>
          </header>
          <main className="content" id="content"><Outlet /></main>
        </div>
      </div>
    </>
  );
}
