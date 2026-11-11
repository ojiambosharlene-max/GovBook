'use strict';
const { pool } = require('../config/db');

/** Writes an audit row. Pass a transaction connection as `conn` so the log commits (or rolls back) with the change. */
async function audit(req, action, entityType, entityId, details = null, conn = pool) {
  try {
    await conn.query(
      'INSERT INTO audit_logs (user_id, action, entity_type, entity_id, details, ip_address) VALUES (?,?,?,?,?,?)',
      [req && req.user ? req.user.id : null, action, entityType, entityId == null ? null : String(entityId),
        details ? JSON.stringify(details) : null, req ? (req.ip || '').slice(0, 45) : null]);
  } catch (err) {
    console.error('[audit] failed to write log:', err.message);
  }
}

module.exports = { audit };
