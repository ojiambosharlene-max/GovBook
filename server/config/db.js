
'use strict';

const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const env = require('./env');

const caPath = path.join(__dirname, '../certificate/ca.pem');

const pool = mysql.createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,

  ssl: {
    ca: fs.readFileSync(caPath),
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  },

  waitForConnections: true,
  connectionLimit: 15,
  queueLimit: 0,
  dateStrings: true,
  decimalNumbers: true,
  charset: 'utf8mb4',
});

async function withTransaction(fn) {
  for (let attempt = 1; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      try {
        await conn.rollback();
      } catch (_) {}

      const retryable = err && (
        err.code === 'ER_LOCK_DEADLOCK' ||
        err.code === 'ER_LOCK_WAIT_TIMEOUT'
      );

      if (retryable && attempt < 3) {
        await new Promise((r) => setTimeout(r, 50 * attempt));
        continue;
      }

      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = { pool, withTransaction };
