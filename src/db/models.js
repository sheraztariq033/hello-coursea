const { run, get, all } = require('./connection');
const { v4: uuidv4 } = require('uuid');

// --- AUDIT LOG UTILITY ---
async function logAudit(userId, resolvedField, accessedBy) {
  const logId = uuidv4();
  await run(
    `INSERT INTO audit_logs (id, user_id, resolved_field, accessed_by, timestamp)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [logId, userId, resolvedField, accessedBy]
  );
}

// --- USER MODELS ---
async function createUser({ real_email, proxy_email, proxy_phone = null, plan_tier = 'free', notification_preferences = {} }) {
  const id = uuidv4();
  const prefsStr = JSON.stringify(notification_preferences);
  await run(
    `INSERT INTO users (id, real_email, proxy_email, proxy_phone, plan_tier, notification_preferences)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, real_email, proxy_email, proxy_phone, plan_tier, prefsStr]
  );
  return { id, real_email, proxy_email, proxy_phone, plan_tier, notification_preferences };
}

async function getUserById(id) {
  const user = await get('SELECT * FROM users WHERE id = ?', [id]);
  if (user && user.notification_preferences) {
    user.notification_preferences = JSON.parse(user.notification_preferences);
  }
  return user;
}

async function getUserByRealEmail(realEmail) {
  const user = await get('SELECT * FROM users WHERE real_email = ?', [realEmail]);
  if (user && user.notification_preferences) {
    user.notification_preferences = JSON.parse(user.notification_preferences);
  }
  return user;
}

/**
 * Resolves user from proxy email and logs access
 */
async function getUserByProxyEmail(proxyEmail, accessedBy = 'system') {
  const user = await get('SELECT * FROM users WHERE proxy_email = ?', [proxyEmail]);
  if (user) {
    user.notification_preferences = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
    await logAudit(user.id, 'real_email', accessedBy);
  }
  return user;
}

/**
 * Resolves user from proxy phone and logs access
 */
async function getUserByProxyPhone(proxyPhone, accessedBy = 'system') {
  const user = await get('SELECT * FROM users WHERE proxy_phone = ?', [proxyPhone]);
  if (user) {
    user.notification_preferences = user.notification_preferences ? JSON.parse(user.notification_preferences) : {};
    await logAudit(user.id, 'real_email', accessedBy);
  }
  return user;
}

async function updateNotificationPreferences(id, preferences) {
  const prefsStr = JSON.stringify(preferences);
  await run('UPDATE users SET notification_preferences = ? WHERE id = ?', [prefsStr, id]);
}

async function updatePlanTier(id, planTier) {
  await run('UPDATE users SET plan_tier = ? WHERE id = ?', [planTier, id]);
}

async function deleteUser(id) {
  // Cascading deletes will trigger on receipts, audit logs, line_items and statement uploads.
  await run('DELETE FROM users WHERE id = ?', [id]);
}

// --- RECEIPT MODELS ---
async function createReceipt({
  user_id,
  merchant,
  date,
  tax = 0.0,
  total,
  payment_method = null,
  warranty_expiry = null,
  source_channel,
  raw_source,
  line_items = [],
}) {
  const receiptId = uuidv4();
  await run(
    `INSERT INTO receipts (id, user_id, merchant, date, tax, total, payment_method, warranty_expiry, source_channel, raw_source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [receiptId, user_id, merchant, date, tax, total, payment_method, warranty_expiry, source_channel, raw_source]
  );

  for (const item of line_items) {
    const itemId = uuidv4();
    await run(
      `INSERT INTO line_items (id, receipt_id, name, price, category)
       VALUES (?, ?, ?, ?, ?)`,
      [itemId, receiptId, item.name, item.price, item.category || 'Other']
    );
  }

  return getReceiptById(receiptId);
}

async function getReceiptById(id) {
  const receipt = await get('SELECT * FROM receipts WHERE id = ?', [id]);
  if (!receipt) return null;

  const items = await all('SELECT * FROM line_items WHERE receipt_id = ?', [id]);
  receipt.line_items = items;
  return receipt;
}

async function getReceiptsForUser(userId, { merchant, category, date_start, date_end, has_warranty, search } = {}) {
  let query = `
    SELECT DISTINCT r.* FROM receipts r
    LEFT JOIN line_items li ON r.id = li.receipt_id
    WHERE r.user_id = ?
  `;
  const params = [userId];

  if (merchant) {
    query += ' AND r.merchant LIKE ?';
    params.push(`%${merchant}%`);
  }

  if (category) {
    query += ' AND li.category = ?';
    params.push(category);
  }

  if (date_start) {
    query += ' AND r.date >= ?';
    params.push(date_start);
  }

  if (date_end) {
    query += ' AND r.date <= ?';
    params.push(date_end);
  }

  if (has_warranty === 'true' || has_warranty === true) {
    query += " AND r.warranty_expiry IS NOT NULL AND r.warranty_expiry != ''";
  }

  if (search) {
    query += ' AND (r.merchant LIKE ? OR li.name LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  query += ' ORDER BY r.date DESC';

  const receipts = await all(query, params);

  // Attach line items to each receipt
  for (const r of receipts) {
    r.line_items = await all('SELECT * FROM line_items WHERE receipt_id = ?', [r.id]);
  }

  return receipts;
}

async function updateReceiptWarranty(id, warrantyExpiry) {
  await run('UPDATE receipts SET warranty_expiry = ? WHERE id = ?', [warrantyExpiry, id]);
  return getReceiptById(id);
}

async function deleteReceipt(id) {
  await run('DELETE FROM receipts WHERE id = ?', [id]);
}

// --- STATEMENTS MODELS ---
async function createStatementUpload(userId, { date, merchant, amount, matched_receipt_id = null }) {
  const id = uuidv4();
  await run(
    `INSERT INTO statement_uploads (id, user_id, date, merchant, amount, matched_receipt_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, userId, date, merchant, amount, matched_receipt_id]
  );
  return { id, user_id: userId, date, merchant, amount, matched_receipt_id };
}

async function getStatementUploadsForUser(userId) {
  return all('SELECT * FROM statement_uploads WHERE user_id = ? ORDER BY date DESC', [userId]);
}

async function matchStatementToReceipt(statementId, receiptId) {
  await run('UPDATE statement_uploads SET matched_receipt_id = ? WHERE id = ?', [statementId, receiptId]);
}

async function clearStatementMatchesForUser(userId) {
  await run('UPDATE statement_uploads SET matched_receipt_id = NULL WHERE user_id = ?', [userId]);
}

// --- AUDIT LOG MODELS ---
async function getAuditLogsForUser(userId) {
  return all('SELECT * FROM audit_logs WHERE user_id = ? ORDER BY timestamp DESC', [userId]);
}

module.exports = {
  createUser,
  getUserById,
  getUserByRealEmail,
  getUserByProxyEmail,
  getUserByProxyPhone,
  updateNotificationPreferences,
  updatePlanTier,
  deleteUser,
  createReceipt,
  getReceiptById,
  getReceiptsForUser,
  updateReceiptWarranty,
  deleteReceipt,
  createStatementUpload,
  getStatementUploadsForUser,
  matchStatementToReceipt,
  clearStatementMatchesForUser,
  getAuditLogsForUser,
  logAudit,
};
