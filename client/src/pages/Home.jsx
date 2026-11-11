import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight, CalendarCheck, Users, Layers, BadgeCheck, Clock, Lock, ShieldCheck, Smartphone, Zap, MapPin, Mail, Phone, Timer, Send, Accessibility, Building2, Globe, Hourglass,
} from 'lucide-react';
import { HeroArt, ServiceIcon } from '../components/brand.jsx';
import { Alert, Spinner } from '../components/ui.jsx';
import { useFetch } from '../hooks/useFetch.js';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../services/api.js';
import { useToast } from '../context/ToastContext.jsx';

function CountUp({ value }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf; const start = performance.now(); const dur = 900;
    const tick = (t) => { const p = Math.min(1, (t - start) / dur); setN(Math.round(value * (1 - Math.pow(1 - p, 3)))); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n.toLocaleString()}</>;
}

export default function Home() {
  const { user } = useAuth(); const nav = useNavigate();
  const { data: stats, loading: ls, error: es } = useFetch('/public/overview');
  const { data: services, loading: lsv, error: esv } = useFetch('/public/services');
  const [cat, setCat] = useState('All');
  const cats = ['All', ...Array.from(new Set((services || []).map((s) => s.category)))];
  const shown = (services || []).filter((s) => cat === 'All' || s.category === cat);
  const book = (id) => nav(id ? `/app/book?service=${id}` : '/app/book');

  const statCards = [
    { icon: Users, label: 'Registered Citizens', v: stats?.citizens }, { icon: Layers, label: 'Available Government Services', v: stats?.services },
    { icon: CalendarCheck, label: 'Appointments Booked', v: stats?.appointmentsBooked }, { icon: BadgeCheck, label: 'Appointments Successfully Completed', v: stats?.appointmentsCompleted },
  ];

  return (
    <>
      {/* ---------------- hero ---------------- */}
      <section className="hero" id="top">
        <span className="blob h1" /><span className="blob h2" /><span className="blob h3" />
        <div className="container hero-grid">
          <div className="page-enter">
            <span className="eyebrow"><ShieldCheck size={16} /> Official digital service platform</span>
            <h1>Your Government Services, <span>Simplified.</span></h1>
            <p className="lead">Book government appointments online, avoid unnecessary queues, and access public services conveniently and securely.</p>
            <div className="row" style={{ marginTop: 28, gap: 14 }}>
              <button className="btn btn-primary btn-lg" onClick={() => book()}>Book an Appointment <ArrowRight size={18} /></button>
              <a className="btn btn-outline btn-lg" href="#services" onClick={(e) => { e.preventDefault(); document.getElementById('services')?.scrollIntoView({ behavior: 'smooth' }); }}>Explore Services</a>
            </div>
            <div className="hero-trust">
              <span><BadgeCheck size={18} /> No double bookings</span><span><Clock size={18} /> Confirmed instantly</span><span><Lock size={18} /> Secure &amp; private</span>
            </div>
          </div>
          <div className="hero-art"><HeroArt /></div>
        </div>
        <svg className="hero-wave" viewBox="0 0 1440 70" preserveAspectRatio="none" aria-hidden="true"><path fill="currentColor" d="M0 40C240 80 480 0 720 20s480 60 720 10V70H0z" /></svg>
      </section>

      {/* ---------------- statistics (live database numbers) ---------------- */}
      <section className="stats-strip" aria-label="Platform statistics">
        <div className="container">
          <div className="grid grid-4 keep2">
            {statCards.map((s) => (
              <div className="stat-big" key={s.label}>
                <div className="ico"><s.icon size={26} /></div>
                <div><div className="num">{ls ? <Spinner /> : es ? '-' : <CountUp value={s.v || 0} />}</div><div className="lbl">{s.label}</div></div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- services ---------------- */}
      <section className="section" id="services">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Available services</span>
            <h2>Everything you need, in one place</h2>
            <p>Choose a service, pick a time that suits you and arrive to a confirmed appointment.</p>
          </div>
          {cats.length > 2 && (
            <div className="row" style={{ justifyContent: 'center', marginBottom: 26 }}>
              <div className="tabs" role="tablist" aria-label="Service categories">
                {cats.map((c) => <button key={c} role="tab" aria-selected={cat === c} className="tab" onClick={() => setCat(c)}>{c}</button>)}
              </div>
            </div>
          )}
          {lsv ? <div className="page-loading"><Spinner /></div> : esv ? <Alert>{esv.message}</Alert> : (
            <div className="grid grid-3">
              {shown.map((s) => (
                <article className="card hover service-card" key={s.id}>
                  <div className="ico"><ServiceIcon name={s.icon} size={26} /></div>
                  <h3>{s.name}</h3>
                  <p>{s.description}</p>
                  <div className="meta-line"><Hourglass size={15} /> {s.processing_info || 'Processing time confirmed at the office'}</div>
                  <div className="meta-line"><Timer size={15} /> About {s.duration_minutes} minutes - {s.office_count} office{s.office_count === 1 ? '' : 's'}</div>
                  <button className="btn btn-primary btn-sm" onClick={() => book(s.id)}>Book Appointment <ArrowRight size={16} /></button>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- how it works ---------------- */}
      <section className="section alt" id="how-it-works">
        <div className="container">
          <div className="section-head"><span className="kicker">How it works</span><h2>Four simple steps</h2><p>From account to confirmation in a few minutes - and your booking is saved permanently.</p></div>
          <div className="steps">
            {[
              ['Create an account', 'Register once with your National ID and contact details.'],
              ['Select a government service', 'Pick the office and the exact service you need.'],
              ['Choose a date and time', 'See live availability and reserve a slot that fits your day.'],
              ['Receive confirmation and attend', 'Keep your reference number, check in on arrival and get served.'],
            ].map(([t, d], i) => <div className="step" key={t}><div className="num">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>)}
          </div>
        </div>
      </section>

      {/* ---------------- why choose ---------------- */}
      <section className="section" id="why">
        <div className="container">
          <div className="section-head"><span className="kicker">Why choose our platform</span><h2>Built to restore confidence in public services</h2><p>We designed GovBook around the problems citizens told us about.</p></div>
          <div className="grid grid-3">
            {[
              [BadgeCheck, 'No double bookings', 'Every time slot has a fixed capacity that is checked in the database at the moment you confirm.'],
              [CalendarCheck, 'Reliable confirmations', 'A booking is only shown as confirmed after it has been saved. Find it again any time in your dashboard.'],
              [Clock, 'Reduced waiting times', 'Staggered appointments and a live queue number mean less time standing in line.'],
              [Smartphone, 'Convenient online booking', 'Book from your phone, tablet or computer, day or night.'],
              [Zap, 'Improved service delivery', 'Staff see their day at a glance, so citizens are served faster and more consistently.'],
              [Lock, 'Secure citizen information', 'Encrypted passwords, role-based access and a full audit trail protect your data.'],
            ].map(([I, t, d]) => <div className="card hover why-card" key={t}><div className="ico"><I size={22} /></div><div><h3>{t}</h3><p>{d}</p></div></div>)}
          </div>
        </div>
      </section>

      {/* ---------------- about ---------------- */}
      <section className="section alt" id="about">
        <div className="container grid" style={{ gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', alignItems: 'center', gap: 40 }}>
          <div className="stack" style={{ gap: 18 }}>
            <span className="section-head" style={{ margin: 0, textAlign: 'left' }}><span className="kicker">About us</span></span>
            <h2 style={{ fontSize: 'clamp(26px,3.2vw,36px)' }}>A modern front door to public services</h2>
            <p className="muted" style={{ fontSize: 16 }}>GovBook replaces paper registers and phone calls with one transparent system. Citizens book online, offices see exactly who is coming, and everyone works from the same trusted record.</p>
            <p className="muted" style={{ fontSize: 16 }}>Our goal is simple: no one should travel to an office only to discover that their appointment is missing.</p>
            <div><Link to="/register" className="btn btn-primary">Create your free account</Link></div>
          </div>
          <div className="grid grid-2">
            {[[Building2, 'Offices connected', stats?.offices ?? '-'], [Accessibility, 'Accessible design', 'Keyboard and screen-reader friendly'], [Globe, 'Works on any device', 'Phone, tablet and desktop'], [ShieldCheck, 'Audited & secure', 'Every action is logged']].map(([I, t, v]) => (
              <div className="card" key={t}><I size={24} style={{ color: 'var(--teal)' }} /><div className="strong" style={{ marginTop: 10 }}>{t}</div><div className="muted small">{v}</div></div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- contact ---------------- */}
      <section className="section" id="contact">
        <div className="container">
          <div className="section-head"><span className="kicker">Contact</span><h2>We are here to help</h2><p>Questions about a service or your booking? Send us a message and we will reply by email.</p></div>
          <div className="contact-grid">
            <div className="stack" style={{ gap: 22 }}>
              {[[MapPin, 'Visit us', '12 Independence Avenue, Metro City'], [Phone, 'Call us', '+254 20 555 0100 (Mon-Fri, 08:00-17:00)'], [Mail, 'Email', 'support@govbook.demo']].map(([I, t, v]) => (
                <div className="contact-item" key={t}><div className="ico"><I size={20} /></div><div><div className="strong">{t}</div><div className="muted">{v}</div></div></div>
              ))}
            </div>
            <ContactForm />
          </div>
        </div>
      </section>

      {/* ---------------- call to action ---------------- */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="container">
          <div className="cta-band">
            <div style={{ position: 'relative', zIndex: 1 }}><h2>Ready to skip the queue?</h2><p>Create an account and book your first appointment in under two minutes.</p></div>
            <div className="row" style={{ position: 'relative', zIndex: 1 }}>
              {user ? <button className="btn btn-primary btn-lg" onClick={() => book()}>Book an Appointment</button> : <Link to="/register" className="btn btn-primary btn-lg">Get started</Link>}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function ContactForm() {
  const toast = useToast();
  const [f, setF] = useState({ name: '', email: '', subject: '', message: '' });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [done, setDone] = useState(false);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr('');
    try { const r = await api.post('/public/contact', f); toast.success(r.message); setDone(true); setF({ name: '', email: '', subject: '', message: '' }); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <form className="card stack" onSubmit={submit} noValidate>
      {done && <Alert type="success">Thank you - your message has been received.</Alert>}
      {err && <Alert>{err}</Alert>}
      <div className="form-grid">
        <div className="field"><label htmlFor="c-name">Your name</label><input id="c-name" className="input" value={f.name} onChange={set('name')} required autoComplete="name" /></div>
        <div className="field"><label htmlFor="c-email">Email</label><input id="c-email" type="email" className="input" value={f.email} onChange={set('email')} required autoComplete="email" /></div>
        <div className="field full"><label htmlFor="c-subject">Subject</label><input id="c-subject" className="input" value={f.subject} onChange={set('subject')} required /></div>
        <div className="field full"><label htmlFor="c-msg">Message</label><textarea id="c-msg" className="textarea" value={f.message} onChange={set('message')} required minLength={10} /></div>
      </div>
      <div><button className="btn btn-primary" disabled={busy}>{busy ? 'Sending...' : <>Send message <Send size={16} /></>}</button></div>
    </form>
  );
}
