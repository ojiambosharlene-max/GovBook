'use strict';
const path = require('path');
const fs = require('fs');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const env = require('./config/env');
const { pool } = require('./config/db');
const { authenticate, requireRole } = require('./middleware/auth');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));

// CORS applies to the API only: same-origin (production build) and the configured React dev origin are allowed.
app.use('/api', cors((req, cb) => {
  const origin = req.headers.origin; let sameOrigin = false;
  try { sameOrigin = !!origin && new URL(origin).host === req.headers.host; } catch (_) { /* ignore */ }
  cb(null, { origin: !origin || sameOrigin || env.clientOrigin.includes(origin), credentials: true });
}));
app.use(express.json({ limit: '100kb' }));
app.use('/api', rateLimit({ windowMs: 60 * 1000, limit: 600, standardHeaders: true, legacyHeaders: false, message: { message: 'Too many requests. Please slow down.' } }));

app.get('/api/health', async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', database: 'connected', time: new Date().toISOString() });
});
app.use('/api/public', require('./routes/public'));
app.use('/api/auth', require('./routes/auth'));

// Everything below needs a signed-in user.
const { appointments, notifications } = require('./routes/appointments');
app.use('/api/appointments', authenticate, appointments);
app.use('/api/notifications', authenticate, notifications);
app.use('/api/staff', authenticate, requireRole('staff', 'admin'), require('./routes/staff'));
app.use('/api/admin', authenticate, requireRole('staff', 'admin'), require('./routes/admin'));

app.use('/api', notFoundHandler);

// In production Express also serves the built React app.
const dist = path.resolve(__dirname, '../client/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('/{*splat}', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}
app.use(errorHandler);

if (require.main === module) {
  pool.query('SELECT 1').then(() => {
    app.listen(env.port, () => console.log(`GovBook API running on http://localhost:${env.port}  (database: ${env.db.database})`));
  }).catch((err) => {
    console.error(`\nCould not connect to MySQL (${err.message}).\nCheck that MySQL is running and DB_USER / DB_PASSWORD in your .env file are correct.\n`);
    process.exit(1);
  });
}
module.exports = app;
