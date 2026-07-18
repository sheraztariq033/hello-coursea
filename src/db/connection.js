const path = require('path');
const fs = require('fs');

// Vercel Serverless environment only permits writing to /tmp
const dbPath = process.env.VERCEL
  ? '/tmp/database.json'
  : path.resolve(__dirname, '../../database.json');

// Initialize local memory store
const data = {
  users: [],
  receipts: [],
  line_items: [],
  audit_logs: [],
  statement_uploads: []
};

// Load data from disk if it exists
function loadDatabase() {
  try {
    if (fs.existsSync(dbPath)) {
      const content = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(content);

      // Use Object.assign to mutate the exported 'data' object without reassigning it,
      // guaranteeing all CJS imports maintain access to the same updated reference.
      Object.assign(data, {
        users: parsed.users || [],
        receipts: parsed.receipts || [],
        line_items: parsed.line_items || [],
        audit_logs: parsed.audit_logs || [],
        statement_uploads: parsed.statement_uploads || []
      });
    }
  } catch (err) {
    console.error('Failed to load database from disk', err);
  }
}

// Save data to disk
function saveDatabase() {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save database to disk', err);
  }
}

// Ensure database is loaded initially
loadDatabase();

async function initDatabase() {
  loadDatabase();
  saveDatabase();
}

module.exports = {
  data,
  loadDatabase,
  saveDatabase,
  initDatabase
};
