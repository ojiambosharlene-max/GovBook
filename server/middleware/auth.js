'use strict';
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const { pool } = require('../config/db');
const { unauthorized, forbidden } = require('../utils/errors');

const STAFF_PERMISSIONS = ['appointments.manage', 'schedules.manage', 'reports.view', 'citizens.view'];

const signToken = (user) => jwt.sign({ sub: user.id, tv: user.token_version }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });

function parsePerms(p) {
  if (!p) return [];
  if (Array.isArray(p)) return p;
  try { return JSON.parse(p); } catch (_) { return []; }
}

/** Loads the signed-in user from the database on every request, so deactivation / role changes apply immediately. */
async function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw unauthorized();
  let payload;
  try { payload = jwt.verify(token, env.jwtSecret); } catch (_) { throw unauthorized('Your session has expired. Please sign in again.'); }
  const [[u]] = await pool.query(
    `SELECT u.id, u.full_name, u.email, u.phone, u.national_id, u.office_id, u.permissions, u.is_active, u.token_version,
            u.notify_email, u.notify_sms, r.name AS role, o.name AS office_name
       FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN government_offices o ON o.id = u.office_id WHERE u.id = ?`, [payload.sub]);
  if (!u || !u.is_active || u.token_version !== payload.tv) throw unauthorized('Your session is no longer valid. Please sign in again.');
  u.permissions = parsePerms(u.permissions);
  req.user = u;
  next();
}

const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) throw forbidden();
  next();
};

/** Admins pass; staff need the named permission (and are then limited to their own office via req.scopeOfficeId). */
const requirePermission = (perm) => (req, res, next) => {
  const u = req.user;
  if (u.role === 'admin') { req.scopeOfficeId = null; return next(); }
  if (u.role === 'staff' && u.permissions.includes(perm) && u.office_id) { req.scopeOfficeId = u.office_id; return next(); }
  throw forbidden();
};

const publicUser = (u) => ({
  id: u.id, fullName: u.full_name, email: u.email, phone: u.phone, nationalId: u.national_id, role: u.role,
  officeId: u.office_id || null, officeName: u.office_name || null, permissions: u.role === 'admin' ? STAFF_PERMISSIONS : (u.permissions || []),
  notifyEmail: !!u.notify_email, notifySms: !!u.notify_sms,
});

module.exports = { authenticate, requireRole, requirePermission, signToken, publicUser, parsePerms, STAFF_PERMISSIONS };
