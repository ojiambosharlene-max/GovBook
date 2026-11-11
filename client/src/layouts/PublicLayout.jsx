import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { Menu, X, Mail, Phone, MapPin } from 'lucide-react';
import { AppBackground, Logo, ThemeToggle } from '../components/brand.jsx';
import { useAuth, homeFor } from '../context/AuthContext.jsx';
import { useFetch } from '../hooks/useFetch.js';

const LINKS = [
  { to: '/', label: 'Home' }, { to: '/#services', label: 'Available Services' }, { to: '/#how-it-works', label: 'How It Works' },
  { to: '/#about', label: 'About Us' }, { to: '/#contact', label: 'Contact' },
];

export function PublicLayout() {
  const { user } = useAuth();
  const { pathname, hash } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => { setOpen(false); }, [pathname, hash]);
  useEffect(() => { // smooth-scroll to #sections (and to the top on a normal page change)
    if (hash) { const el = document.getElementById(hash.slice(1)); if (el) { setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); return; } }
    window.scrollTo(0, 0);
  }, [pathname, hash]);

  const isActive = (to) => (to === '/' ? pathname === '/' && !hash : pathname === '/' && hash === to.slice(1));
  return (
    <>
      <a className="skip-link" href="#main">Skip to content</a>
      <AppBackground />
      <header className="public-nav">
        <div className="container">
          <Logo />
          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => <Link key={l.to} to={l.to} className={isActive(l.to) ? 'active' : ''}>{l.label}</Link>)}
          </nav>
          <div className="nav-actions">
            <ThemeToggle />
            {user ? (
              <Link to={homeFor(user.role)} className="btn btn-primary btn-sm">My Dashboard</Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline btn-sm">Login</Link>
                <Link to="/register" className="btn btn-primary btn-sm hide-sm">Register</Link>
              </>
            )}
            <button className="icon-btn burger" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>{open ? <X size={20} /> : <Menu size={20} />}</button>
          </div>
        </div>
        <div className={`mobile-menu ${open ? 'open' : ''}`}>
          {LINKS.map((l) => <Link key={l.to} to={l.to}>{l.label}</Link>)}
          {!user && <Link to="/register">Register</Link>}
        </div>
      </header>
      <main id="main"><Outlet /></main>
      <Footer />
    </>
  );
}

function Footer() {
  const { data: services } = useFetch('/public/services');
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Logo />
            <p className="small" style={{ marginTop: 14, maxWidth: 320 }}>GovBook helps citizens book government appointments online, with confirmed time slots, reliable records and shorter queues.</p>
          </div>
          <div>
            <h4>Quick links</h4>
            <Link to="/">Home</Link><Link to="/#services">Available Services</Link><Link to="/#how-it-works">How It Works</Link><Link to="/#contact">Contact</Link><Link to="/login">Login</Link><Link to="/register">Register</Link>
          </div>
          <div>
            <h4>Services</h4>
            {(services || []).slice(0, 6).map((s) => <Link key={s.id} to={`/app/book?service=${s.id}`}>{s.name}</Link>)}
          </div>
          <div>
            <h4>Contact</h4>
            <div className="small" style={{ display: 'grid', gap: 10 }}>
              <span className="row" style={{ flexWrap: 'nowrap' }}><MapPin size={16} /> 12 Independence Avenue, Metro City</span>
              <span className="row" style={{ flexWrap: 'nowrap' }}><Phone size={16} /> +254 20 555 0100</span>
              <span className="row" style={{ flexWrap: 'nowrap' }}><Mail size={16} /> support@govbook.demo</span>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <span>&copy; {new Date().getFullYear()} GovBook Digital Government Platform. All rights reserved.</span>
          <span className="row" style={{ gap: 18 }}><Link to="/privacy" style={{ display: 'inline' }}>Privacy Policy</Link><Link to="/terms" style={{ display: 'inline' }}>Terms and Conditions</Link></span>
        </div>
      </div>
    </footer>
  );
}
