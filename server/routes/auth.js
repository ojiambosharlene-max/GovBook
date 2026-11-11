'use strict';
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const { pool } = require('../config/db');
const env = require('../config/env');
const V = require('../utils/validate');
const { badRequest, unauthorized } = require('../utils/errors');
const { authenticate, signToken, publicUser } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { notify } = require('../services/notifications');

const router = express.Router();
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 40, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many attempts. Please wait a few minutes and try again.' } });

const USER_SQL = `SELECT u.id, u.full_name, u.email, u.phone, u.national_id, u.office_id, u.permissions, u.password_hash, u.is_active, u.token_version,
                         u.notify_email, u.notify_sms, r.name AS role, o.name AS office_name
                    FROM users u JOIN roles r ON r.id = u.role_id LEFT JOIN government_offices o ON o.id = u.office_id`;
const withPerms = (u) => { if (u && typeof u.permissions === 'string') { try { u.permissions = JSON.parse(u.permissions); } catch (_) { u.permissions = []; } } return u; };
const phoneOk = (p) => /^\+?[0-9][0-9 ()-]{6,19}$/.test(p);

router.post('/register', limiter, async (req, res) => {
  const b = req.body || {};
  const fullName = V.str(b.fullName, 'Full name', { required: true, min: 3, max: 120 });
  if (!/^[\p{L}][\p{L} .'-]+$/u.test(fullName)) throw badRequest('Full name may only contain letters, spaces and . \' -');
  const email = V.email(b.email, 'Email', { required: true });
  const phone = V.str(b.phone, 'Phone number', { required: true, max: 25 });
  if (!phoneOk(phone)) throw badRequest('Phone number is not valid (digits, spaces, + ( ) - only)');
  const nationalId = V.str(b.nationalId, 'National ID number', { required: true, min: 5, max: 20 });
  if (!/^[A-Za-z0-9-]+$/.test(nationalId)) throw badRequest('National ID number may only contain letters, digits and hyphens');
  const pw = V.password(b.password);
  if (b.confirmPassword !== pw) throw badRequest('Passwords do not match');

  const [[dupE]] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
  if (dupE) throw badRequest('An account with this email address already exists. Try signing in instead.', { field: 'email' });
  const [[dupN]] = await pool.query('SELECT id FROM users WHERE national_id = ?', [nationalId]);
  if (dupN) throw badRequest('An account with this National ID number already exists.', { field: 'nationalId' });

  const hash = await bcrypt.hash(pw, env.bcryptRounds);
  const [ins] = await pool.query(
    `INSERT INTO users (role_id, full_name, email, phone, national_id, password_hash) VALUES ((SELECT id FROM roles WHERE name = 'citizen'), ?,?,?,?,?)`,
    [fullName, email, phone, nationalId, hash]);
  const [[u]] = await pool.query(`${USER_SQL} WHERE u.id = ?`, [ins.insertId]);
  req.user = u;
  await notify(null, u.id, { type: 'announcement', title: 'Welcome to GovBook', message: 'Your account is ready. You can now book government appointments online.' });
  await audit(req, 'CITIZEN_REGISTERED', 'user', u.id, { email });
  res.status(201).json({ token: signToken(u), user: publicUser(withPerms(u)) });
});

router.post('/login', limiter, async (req, res) => {
  const email = V.email(req.body && req.body.email, 'Email', { required: true });
  const password = V.str(req.body && req.body.password, 'Password', { required: true, max: 100 });
  const [[u]] = await pool.query(`${USER_SQL} WHERE u.email = ?`, [email]);
  const ok = u ? await bcrypt.compare(password, u.password_hash) : await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidi');
  if (!u || !ok) throw unauthorized('Invalid email or password');
  if (!u.is_active) throw unauthorized('This account has been deactivated. Please contact the administrator.');
  await pool.query('UPDATE users SET last_login_at = NOW() WHERE id = ?', [u.id]);
  req.user = u;
  await audit(req, 'LOGIN', 'user', u.id, { role: u.role });
  res.json({ token: signToken(u), user: publicUser(withPerms(u)) });
});

router.get('/me', authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

router.post('/forgot-password', limiter, async (req, res) => {
  const email = V.email(req.body && req.body.email, 'Email', { required: true });
  const [[u]] = await pool.query('SELECT id, is_active FROM users WHERE email = ?', [email]);
  const out = { message: 'If an account exists for that email, a password reset link has been sent.' };
  if (u && u.is_active) {
    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query('INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?,?, NOW() + INTERVAL 1 HOUR)', [u.id, hash]);
    // No mail server is configured: outside production the link is returned so the flow can be tested.
    if (!env.isProd) out.devResetLink = `/reset-password?token=${token}`;
  }
  res.json(out);
});

router.post('/reset-password', limiter, async (req, res) => {
  const token = V.str(req.body && req.body.token, 'Reset token', { required: true, max: 200 });
  const pw = V.password(req.body && req.body.password, 'New password');
  if (req.body.confirmPassword !== pw) throw badRequest('Passwords do not match');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const [[r]] = await pool.query('SELECT id, user_id FROM password_resets WHERE token_hash = ? AND used_at IS NULL AND expires_at > NOW()', [hash]);
  if (!r) throw badRequest('This reset link is invalid or has expired. Please request a new one.');
  await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [await bcrypt.hash(pw, env.bcryptRounds), r.user_id]);
  await pool.query('UPDATE password_resets SET used_at = NOW() WHERE id = ?', [r.id]);
  req.user = { id: r.user_id };
  await audit(req, 'PASSWORD_RESET', 'user', r.user_id);
  res.json({ message: 'Your password has been reset. You can now sign in.' });
});

router.post('/change-password', authenticate, async (req, res) => {
  const current = V.str(req.body.currentPassword, 'Current password', { required: true, max: 100 });
  const pw = V.password(req.body.newPassword, 'New password');
  if (req.body.confirmPassword !== pw) throw badRequest('Passwords do not match');
  const [[u]] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [req.user.id]);
  if (!(await bcrypt.compare(current, u.password_hash))) throw badRequest('Your current password is incorrect');
  await pool.query('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?', [await bcrypt.hash(pw, env.bcryptRounds), req.user.id]);
  await audit(req, 'PASSWORD_CHANGED', 'user', req.user.id);
  const [[fresh]] = await pool.query(`${USER_SQL} WHERE u.id = ?`, [req.user.id]);
  res.json({ message: 'Password updated.', token: signToken(fresh) }); // fresh token: the old sessions are now invalid
});

router.patch('/profile', authenticate, async (req, res) => {
  const b = req.body || {};
  const fullName = V.str(b.fullName, 'Full name', { required: true, min: 3, max: 120 });
  const phone = V.str(b.phone, 'Phone number', { required: true, max: 25 });
  if (!phoneOk(phone)) throw badRequest('Phone number is not valid');
  await pool.query('UPDATE users SET full_name = ?, phone = ? WHERE id = ?', [fullName, phone, req.user.id]);
  await audit(req, 'PROFILE_UPDATED', 'user', req.user.id);
  const [[u]] = await pool.query(`${USER_SQL} WHERE u.id = ?`, [req.user.id]);
  res.json({ user: publicUser(withPerms(u)) });
});

router.patch('/settings', authenticate, async (req, res) => {
  await pool.query('UPDATE users SET notify_email = ?, notify_sms = ? WHERE id = ?', [V.bool(req.body.notifyEmail), V.bool(req.body.notifySms), req.user.id]);
  const [[u]] = await pool.query(`${USER_SQL} WHERE u.id = ?`, [req.user.id]);
  res.json({ user: publicUser(withPerms(u)) });
});

module.exports = router;
