import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, homeFor } from './context/AuthContext.jsx';
import { PageLoading } from './components/ui.jsx';
import { PublicLayout } from './layouts/PublicLayout.jsx';
import { DashboardLayout } from './layouts/DashboardLayout.jsx';
import Home from './pages/Home.jsx';
import { ForgotPassword, LegalPage, Login, Register, ResetPassword } from './pages/Auth.jsx';
import CitizenDashboard from './pages/citizen/Dashboard.jsx';
import Book from './pages/citizen/Book.jsx';
import { AppointmentDetail, AppointmentList } from './pages/citizen/Appointments.jsx';
import { Notifications, Profile, SettingsPage } from './pages/Account.jsx';
import { StaffQueue, StaffSearch, StaffToday } from './pages/staff/Staff.jsx';
import AdminOverview from './pages/admin/Overview.jsx';
import { AdminCitizens, AdminOffices, AdminServices, AdminStaff } from './pages/admin/Manage.jsx';
import AdminSchedules from './pages/admin/Schedules.jsx';
import AdminAppointments from './pages/admin/AdminAppointments.jsx';
import AdminNotifications from './pages/admin/AdminNotifications.jsx';
import Reports from './pages/admin/Reports.jsx';
import AuditLog from './pages/admin/Audit.jsx';
import { EmptyState } from './components/ui.jsx';
import { ShieldAlert } from 'lucide-react';

/** Redirects to the login page when signed out, and shows "Access denied" when the role is wrong. */
function Guard({ roles, children }) {
  const { user, loading } = useAuth(); const loc = useLocation();
  if (loading) return <PageLoading text="Checking your session..." />;
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname + loc.search }} />;
  if (roles && !roles.includes(user.role)) {
    return <div className="card"><EmptyState icon={ShieldAlert} title="Access denied" text="You do not have permission to open this page." action={<a className="btn btn-primary btn-sm" href={homeFor(user.role)}>Go to my dashboard</a>} /></div>;
  }
  return children;
}

export default function App() {
  const g = (roles, el) => <Guard roles={roles}>{el}</Guard>;
  const C = ['citizen']; const S = ['staff', 'admin']; const A = ['admin']; const SA = ['staff', 'admin'];
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/privacy" element={<LegalPage kind="privacy" />} />
        <Route path="/terms" element={<LegalPage kind="terms" />} />
      </Route>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<Guard><DashboardLayout /></Guard>}>
        <Route path="/app" element={g(C, <CitizenDashboard />)} />
        <Route path="/app/book" element={g(C, <Book />)} />
        <Route path="/app/appointments" element={g(C, <AppointmentList mode="upcoming" />)} />
        <Route path="/app/history" element={g(C, <AppointmentList mode="history" />)} />
        <Route path="/app/appointments/:id" element={<AppointmentDetail />} />
        <Route path="/app/notifications" element={<Notifications />} />
        <Route path="/app/profile" element={<Profile />} />
        <Route path="/app/settings" element={<SettingsPage />} />

        <Route path="/staff" element={g(S, <StaffToday />)} />
        <Route path="/staff/queue" element={g(S, <StaffQueue />)} />
        <Route path="/staff/search" element={g(S, <StaffSearch />)} />

        <Route path="/admin" element={g(A, <AdminOverview />)} />
        <Route path="/admin/appointments" element={g(SA, <AdminAppointments />)} />
        <Route path="/admin/citizens" element={g(SA, <AdminCitizens />)} />
        <Route path="/admin/offices" element={g(A, <AdminOffices />)} />
        <Route path="/admin/services" element={g(A, <AdminServices />)} />
        <Route path="/admin/schedules" element={g(SA, <AdminSchedules />)} />
        <Route path="/admin/staff" element={g(A, <AdminStaff />)} />
        <Route path="/admin/notifications" element={g(A, <AdminNotifications />)} />
        <Route path="/admin/reports" element={g(SA, <Reports />)} />
        <Route path="/admin/audit" element={g(A, <AuditLog />)} />
      </Route>
      <Route path="*" element={<PublicLayout />}>
        <Route path="*" element={<div className="section"><div className="container"><div className="card"><EmptyState title="Page not found" text="The page you are looking for does not exist." action={<a href="/" className="btn btn-primary btn-sm">Back to home</a>} /></div></div></div>} />
      </Route>
    </Routes>
  );
}
