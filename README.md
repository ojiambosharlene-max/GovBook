# GovBook - Digital Government Appointment Management System

Citizens book appointments with government offices online. Staff verify bookings, run the queue and serve citizens. Administrators manage offices, services, schedules, staff and reports.

**Stack:** React 19 + Vite - Node.js + Express 5 - MySQL 8.0 (`government_appointment_system`) - JWT + bcrypt

It solves the problems in the brief: double-booked slots, confirmations that disappear, citizens arriving to a missing appointment, appointments under the wrong service, and poor queue management.

---

## 1. Required software
- [Node.js](https://nodejs.org) 20 or newer (includes npm)
- [MySQL Server 8.0](https://dev.mysql.com/downloads/mysql/) and MySQL Workbench
- Visual Studio Code (recommended)

## 2. Quick start
```bash
# in the project folder (open it in VS Code, then Terminal > New Terminal)
npm run install:all                     # installs root, server and client dependencies

cp .env.example .env                    # Windows PowerShell: copy .env.example .env
#   edit .env -> set DB_PASSWORD (your MySQL password) and JWT_SECRET
#   a good secret:  node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"

npm run db:setup                        # creates the database, tables and sample data
npm run dev                             # API on :5000 + website on :5173
```
Open **http://localhost:5173**. The home page loads first.

### Import the SQL with MySQL Workbench instead
1. Open Workbench and connect to your server.
2. *File > Open SQL Script...* -> `database/schema.sql` -> run it (lightning icon).
3. *File > Open SQL Script...* -> `database/seed.sql` -> run it. (Schema first, seed second.)
4. Put the same connection details in `.env` and run `npm run dev`.

The seed's dates are relative to the Monday of the week in which you import it, so there is always history, a live queue for today and free slots ahead.

### Demo accounts (password for all: `Password@123`)
| Role | Email | Notes |
|---|---|---|
| Citizen | citizen@govbook.demo | has upcoming and past appointments |
| Staff | staff.central@govbook.demo | Central Civic Centre, extra permissions (appointments, schedules, reports, citizens) |
| Staff | staff.riverside@govbook.demo | can also reschedule / cancel |
| Staff | staff.northgate@govbook.demo (and harbour, westfield) | front desk only |
| Administrator | admin@govbook.demo | everything |

The login page shows these as one-click demo buttons. **Remove that box (`DEMO` in `client/src/pages/Auth.jsx`) and change or delete the demo accounts before real use.**

### Commands
| Command | Does |
|---|---|
| `npm run dev` | API + website with auto-reload |
| `npm run db:reset` | Drops and rebuilds the database with fresh sample data |
| `npm run build` then `npm start` | Production mode: Express serves the built site on http://localhost:5000 |
| `npm test` | End-to-end API tests (**server must be running**; they write data, so run `npm run db:reset` afterwards) |
| `npm run seed:generate --prefix server` | Regenerates `database/seed.sql` |

Troubleshooting: *"Could not connect to MySQL"* -> check MySQL is running and `DB_USER` / `DB_PASSWORD` in `.env`.

## 3. How to test the application
1. **Register** a new citizen (or use the demo citizen). Duplicate emails are rejected.
2. **Book:** *Book Appointment* -> office -> service -> calendar date -> time -> confirm. You land on a confirmation page with a reference such as `GOV-7K3M9Q2X`; it stays under *My Appointments*. Print it, download it, or add it to your calendar.
3. **Double booking:** log in as two citizens in two browsers, pick the last free place of a slot (admin: *Schedules & Slots* -> set a slot's capacity to 1) and confirm both - only one succeeds, the other is told the slot is full.
4. **Cancel** an appointment - the place is released immediately and appears as free again.
5. **Staff:** log in as staff -> *Find Appointment*, paste a reference -> verify -> *Check in* (only on the day) -> a queue number is issued -> *Queue* -> *Call next* -> *Complete*.
6. **Admin:** add a service, link it to an office, create schedules, reschedule/cancel with a reason, send an announcement, open *Reports*, view the audit log.
7. **Theme:** use the sun/moon button in any navigation bar; the choice is remembered.
8. **Automated:** with the server running, `npm test` runs 56 checks (auth, role access, booking, concurrency, queue, admin, integrity).

## 4. How double booking is prevented
1. Every slot has a **capacity** (`time_slots.capacity`) and a `booked_count`.
2. Booking runs in one **database transaction**: the slot row is locked (`SELECT ... FOR UPDATE`), availability is **checked again after the lock**, the appointment is inserted and `booked_count` is incremented. A second request waits, sees the slot full and is refused.
3. The database enforces it too: `CHECK (booked_count <= capacity)`, unique keys so one citizen cannot hold the same slot twice or have two live bookings for the same service, and composite foreign keys so a service must be offered by the office and a slot must belong to the office (**wrong-service bookings are impossible**).
4. Past dates, closed days and inactive services/offices are rejected by the server. Booking is blocked inside `BOOKING_LEAD_MINUTES` of the start time.
5. A **double click or retry** is harmless (idempotency key).
6. A booking is shown as confirmed only **after COMMIT**, read back from the database. The in-app notification is written in the same transaction.
7. Cancelling, or an admin rescheduling, releases/moves the capacity inside a transaction.

## 5. Roles and permissions
| Role | Can |
|---|---|
| Citizen | register, book, view/cancel own appointments, history, notifications, profile, settings |
| Staff | front desk for **their own office**: today's schedule, search by reference, verify, check in, queue, start/complete, no-show. Extra permissions granted by an admin: `appointments.manage`, `schedules.manage`, `reports.view`, `citizens.view` (all limited to their office) |
| Administrator | everything: citizens, offices, services, schedules and slot capacities, staff accounts and permissions, all appointments (search, reschedule, cancel with reason), notifications, reports, audit log |

Permissions are enforced on **every API request** by the server; the menus only hide what you cannot use.

## 6. Notifications (email / SMS ready)
Events (booked, pending, confirmed, rescheduled, cancelled, checked in, called, completed, missed) create an in-app notification. If the citizen opted in, an extra `email` / `sms` row is stored with `delivery_status = 'pending'`. To switch real delivery on, register a sender in `server/services/notifications.js` (`CHANNEL_SENDERS`) - nothing else changes.

## 7. Security
bcrypt password hashing - JWT sessions (password change/reset or deactivation invalidates old tokens) - role-based access control - parameterised SQL everywhere - input validation - rate limiting (global + stricter for login/register/reset/contact) - Helmet headers - CORS limited to `CLIENT_ORIGIN` - audit log of important actions - CSV exports neutralise spreadsheet formulas - secrets only in `.env`.

**Before production:** long random `JWT_SECRET`, `NODE_ENV=production`, HTTPS, remove demo accounts and the demo login box. *Forgot password* shows the reset link on screen in development because no mail server is configured; wire up email in `server/routes/auth.js` before production (the link is then no longer returned).

## 8. Project structure
```
government-appointment-system/
├── client/                 React app (Vite)
│   └── src/ assets/ components/ context/ hooks/ layouts/ pages/ services/ styles/ utils/  App.jsx main.jsx
├── server/
│   ├── config/ middleware/ routes/ services/ utils/ scripts/ tests/  server.js
├── database/               schema.sql  seed.sql
├── .env.example  .gitignore  package.json  README.md
```
Business logic lives in `server/services/booking.js` (booking, cancel, reschedule, queue); HTTP routes are thin.

## 9. Database tables
Required: `users`, `roles`, `government_offices`, `government_services`, `office_services`, `appointment_schedules`, `time_slots`, `appointments`, `notifications`, `queue_records`, `audit_logs`.
Extra: `password_resets`, `contact_messages`.

## 10. Notes and limitations
- Times use the MySQL server's clock/time zone (a single office time zone).
- Google Fonts are loaded from the internet; offline the system font is used.
- The JWT is kept in `localStorage`; use HTTPS in production.
- Slot capacity is shared by all services of an office at a given time.
