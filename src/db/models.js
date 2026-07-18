const { data, loadDatabase, saveDatabase } = require('./connection');
const { v4: uuidv4 } = require('uuid');

// --- AUDIT LOG UTILITY ---
async function logAudit(userId, resolvedField, accessedBy) {
  loadDatabase();
  const logId = uuidv4();
  const log = {
    id: logId,
    user_id: userId,
    resolved_field: resolvedField,
    accessed_by: accessedBy,
    timestamp: new Date().toISOString()
  };
  data.audit_logs.push(log);
  saveDatabase();
}

// --- USER MODELS ---
async function createUser({ real_email, proxy_email, proxy_phone = null, plan_tier = 'free', notification_preferences = {} }) {
  loadDatabase();
  const id = uuidv4();
  const newUser = {
    id,
    real_email,
    proxy_email,
    proxy_phone,
    plan_tier,
    notification_preferences,
    created_at: new Date().toISOString()
  };
  data.users.push(newUser);
  saveDatabase();
  return newUser;
}

async function getUserById(id) {
  loadDatabase();
  return data.users.find(u => u.id === id);
}

async function getUserByRealEmail(realEmail) {
  loadDatabase();
  return data.users.find(u => u.real_email === realEmail);
}

/**
 * Resolves user from proxy email and logs access
 */
async function getUserByProxyEmail(proxyEmail, accessedBy = 'system') {
  loadDatabase();
  const user = data.users.find(u => u.proxy_email === proxyEmail);
  if (user) {
    await logAudit(user.id, 'real_email', accessedBy);
  }
  return user;
}

/**
 * Resolves user from proxy phone and logs access
 */
async function getUserByProxyPhone(proxyPhone, accessedBy = 'system') {
  loadDatabase();
  const user = data.users.find(u => u.proxy_phone === proxyPhone);
  if (user) {
    await logAudit(user.id, 'real_email', accessedBy);
  }
  return user;
}

async function updateNotificationPreferences(id, preferences) {
  loadDatabase();
  const user = data.users.find(u => u.id === id);
  if (user) {
    user.notification_preferences = preferences;
    saveDatabase();
  }
}

async function updatePlanTier(id, planTier) {
  loadDatabase();
  const user = data.users.find(u => u.id === id);
  if (user) {
    user.plan_tier = planTier;
    saveDatabase();
  }
}

async function deleteUser(id) {
  loadDatabase();

  // Cascade delete receipts and line items
  const userReceipts = data.receipts.filter(r => r.user_id === id);
  for (const r of userReceipts) {
    data.line_items = data.line_items.filter(li => li.receipt_id !== r.id);
  }

  data.receipts = data.receipts.filter(r => r.user_id !== id);
  data.audit_logs = data.audit_logs.filter(l => l.user_id !== id);
  data.statement_uploads = data.statement_uploads.filter(s => s.user_id !== id);
  data.users = data.users.filter(u => u.id !== id);

  saveDatabase();
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
  loadDatabase();
  const receiptId = uuidv4();

  const receipt = {
    id: receiptId,
    user_id,
    merchant,
    date,
    tax,
    total,
    payment_method,
    warranty_expiry,
    source_channel,
    raw_source,
    created_at: new Date().toISOString()
  };

  data.receipts.push(receipt);

  for (const item of line_items) {
    const itemId = uuidv4();
    data.line_items.push({
      id: itemId,
      receipt_id: receiptId,
      name: item.name,
      price: item.price,
      category: item.category || 'Other'
    });
  }

  saveDatabase();
  return getReceiptById(receiptId);
}

async function getReceiptById(id) {
  loadDatabase();
  const receipt = data.receipts.find(r => r.id === id);
  if (!receipt) return null;

  // Clone receipt and attach items
  const receiptCopy = { ...receipt };
  receiptCopy.line_items = data.line_items.filter(li => li.receipt_id === id);
  return receiptCopy;
}

async function getReceiptsForUser(userId, { merchant, category, date_start, date_end, has_warranty, search } = {}) {
  loadDatabase();

  let receipts = data.receipts.filter(r => r.user_id === userId);

  if (merchant) {
    const lowerMerch = merchant.toLowerCase();
    receipts = receipts.filter(r => r.merchant.toLowerCase().includes(lowerMerch));
  }

  if (date_start) {
    receipts = receipts.filter(r => r.date >= date_start);
  }

  if (date_end) {
    receipts = receipts.filter(r => r.date <= date_end);
  }

  if (has_warranty === 'true' || has_warranty === true) {
    receipts = receipts.filter(r => r.warranty_expiry && r.warranty_expiry !== '');
  }

  // Filter line items
  const expandedReceipts = receipts.map(r => {
    const items = data.line_items.filter(li => li.receipt_id === r.id);
    return { ...r, line_items: items };
  });

  let results = expandedReceipts;

  if (category) {
    results = results.filter(r => r.line_items.some(li => li.category === category));
  }

  if (search) {
    const lowerSearch = search.toLowerCase();
    results = results.filter(r =>
      r.merchant.toLowerCase().includes(lowerSearch) ||
      r.line_items.some(li => li.name.toLowerCase().includes(lowerSearch))
    );
  }

  // Sort by date DESC
  return results.sort((a, b) => b.date.localeCompare(a.date));
}

async function updateReceiptWarranty(id, warrantyExpiry) {
  loadDatabase();
  const receipt = data.receipts.find(r => r.id === id);
  if (receipt) {
    receipt.warranty_expiry = warrantyExpiry;
    saveDatabase();
  }
  return getReceiptById(id);
}

async function deleteReceipt(id) {
  loadDatabase();
  data.receipts = data.receipts.filter(r => r.id !== id);
  data.line_items = data.line_items.filter(li => li.receipt_id !== id);
  saveDatabase();
}

// --- STATEMENTS MODELS ---
async function createStatementUpload(userId, { date, merchant, amount, matched_receipt_id = null }) {
  loadDatabase();
  const id = uuidv4();
  const statement = {
    id,
    user_id: userId,
    date,
    merchant,
    amount,
    matched_receipt_id,
    created_at: new Date().toISOString()
  };
  data.statement_uploads.push(statement);
  saveDatabase();
  return statement;
}

async function getStatementUploadsForUser(userId) {
  loadDatabase();
  return data.statement_uploads
    .filter(s => s.user_id === userId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

async function matchStatementToReceipt(statementId, receiptId) {
  loadDatabase();
  const statement = data.statement_uploads.find(s => s.id === statementId);
  if (statement) {
    statement.matched_receipt_id = receiptId;
    saveDatabase();
  }
}

async function clearStatementMatchesForUser(userId) {
  loadDatabase();
  data.statement_uploads = data.statement_uploads.filter(s => s.user_id !== userId);
  saveDatabase();
}

// --- AUDIT LOG MODELS ---
async function getAuditLogsForUser(userId) {
  loadDatabase();
  return data.audit_logs
    .filter(l => l.user_id === userId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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
