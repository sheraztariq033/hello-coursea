const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.resolve(__dirname, '../../database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not connect to SQLite database', err);
  } else {
    // Enable foreign keys for cascades
    db.run('PRAGMA foreign_keys = ON;', (pragmaErr) => {
      if (pragmaErr) console.error('Error enabling foreign keys', pragmaErr);
    });
  }
});

/**
 * Executes a query that doesn't return rows (e.g. INSERT, UPDATE, DELETE)
 */
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Executes a query that returns a single row
 */
function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

/**
 * Executes a query that returns multiple rows
 */
function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

/**
 * Initialize all database tables
 */
async function initDatabase() {
  await run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      real_email TEXT UNIQUE NOT NULL,
      proxy_email TEXT UNIQUE NOT NULL,
      proxy_phone TEXT UNIQUE,
      plan_tier TEXT DEFAULT 'free',
      notification_preferences TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS receipts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      merchant TEXT NOT NULL,
      date TEXT NOT NULL,
      tax REAL DEFAULT 0.0,
      total REAL NOT NULL,
      payment_method TEXT,
      warranty_expiry TEXT,
      source_channel TEXT NOT NULL,
      raw_source TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS line_items (
      id TEXT PRIMARY KEY,
      receipt_id TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      category TEXT,
      FOREIGN KEY (receipt_id) REFERENCES receipts(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      resolved_field TEXT NOT NULL,
      accessed_by TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);

  await run(`
    CREATE TABLE IF NOT EXISTS statement_uploads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      date TEXT NOT NULL,
      merchant TEXT NOT NULL,
      amount REAL NOT NULL,
      matched_receipt_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (matched_receipt_id) REFERENCES receipts(id) ON DELETE SET NULL
    )
  `);
}

module.exports = {
  db,
  run,
  get,
  all,
  initDatabase,
};
