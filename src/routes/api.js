const express = require('express');
const router = express.Router();
const models = require('../db/models');
const { parseReceiptText } = require('../services/parser');

// Helper to handle async route errors
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// --- USER ROUTES ---

// Register or log in a user
router.post('/users/register', asyncHandler(async (req, res) => {
  const { real_email } = req.body;
  if (!real_email) {
    return res.status(400).json({ error: 'real_email is required' });
  }

  // Check if user already exists
  let user = await models.getUserByRealEmail(real_email);
  if (user) {
    return res.json({ message: 'User logged in successfully', user });
  }

  // Create unique proxy handles
  const cleanPrefix = real_email.split('@')[0].replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const proxy_email = `${cleanPrefix}${randNum}@vault.ourapp.com`;
  const proxy_phone = `+1-555-${randNum}`;

  user = await models.createUser({
    real_email,
    proxy_email,
    proxy_phone,
    plan_tier: 'free',
    notification_preferences: {
      email_alerts: true,
      push_alerts: true,
      days_before_expiry: 7
    }
  });

  res.status(201).json({ message: 'User registered successfully', user });
}));

// Get user profile
router.get('/users/:id', asyncHandler(async (req, res) => {
  const user = await models.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json({ user });
}));

// Update notification preferences
router.put('/users/:id/preferences', asyncHandler(async (req, res) => {
  const { notification_preferences, plan_tier } = req.body;
  const user = await models.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (notification_preferences) {
    await models.updateNotificationPreferences(req.params.id, notification_preferences);
  }
  if (plan_tier) {
    await models.updatePlanTier(req.params.id, plan_tier);
  }

  const updatedUser = await models.getUserById(req.params.id);
  res.json({ message: 'Preferences updated successfully', user: updatedUser });
}));

// Delete user (cascade delete)
router.delete('/users/:id', asyncHandler(async (req, res) => {
  const user = await models.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  await models.deleteUser(req.params.id);
  res.json({ message: 'User and all associated data deleted successfully' });
}));

// --- RECEIPT ROUTES ---

// Get all receipts for a user with filters
router.get('/receipts', asyncHandler(async (req, res) => {
  const { user_id, merchant, category, date_start, date_end, has_warranty, search } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id query param is required' });
  }

  const receipts = await models.getReceiptsForUser(user_id, {
    merchant,
    category,
    date_start,
    date_end,
    has_warranty,
    search,
  });

  res.json({ receipts });
}));

// Add a receipt manually
router.post('/receipts', asyncHandler(async (req, res) => {
  const {
    user_id,
    merchant,
    date,
    tax,
    total,
    payment_method,
    warranty_expiry,
    source_channel,
    raw_source,
    line_items,
  } = req.body;

  if (!user_id || !merchant || !total || !date) {
    return res.status(400).json({ error: 'Missing required fields: user_id, merchant, date, total' });
  }

  const receipt = await models.createReceipt({
    user_id,
    merchant,
    date,
    tax: tax || 0.0,
    total,
    payment_method: payment_method || 'MANUAL',
    warranty_expiry,
    source_channel: source_channel || 'manual',
    raw_source: raw_source || 'Manual User Entry',
    line_items: line_items || [],
  });

  res.status(201).json({ message: 'Receipt created successfully', receipt });
}));

// Update a receipt's warranty expiry date
router.put('/receipts/:id/warranty', asyncHandler(async (req, res) => {
  const { warranty_expiry } = req.body;
  if (!warranty_expiry) {
    return res.status(400).json({ error: 'warranty_expiry is required' });
  }

  const receipt = await models.getReceiptById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }

  const updatedReceipt = await models.updateReceiptWarranty(req.params.id, warranty_expiry);
  res.json({ message: 'Warranty updated successfully', receipt: updatedReceipt });
}));

// Delete a receipt
router.delete('/receipts/:id', asyncHandler(async (req, res) => {
  const receipt = await models.getReceiptById(req.params.id);
  if (!receipt) {
    return res.status(404).json({ error: 'Receipt not found' });
  }
  await models.deleteReceipt(req.params.id);
  res.json({ message: 'Receipt deleted successfully' });
}));

// --- PROXY INGESTION SIMULATOR ROUTES ---

// Simulates incoming email forwarding to proxy_email
router.post('/ingest/email', asyncHandler(async (req, res) => {
  const { proxy_email, raw_email_body, from_email } = req.body;
  if (!proxy_email || !raw_email_body) {
    return res.status(400).json({ error: 'proxy_email and raw_email_body are required' });
  }

  // Look up user using proxy email (this automatically records an audit log entry!)
  const user = await models.getUserByProxyEmail(proxy_email, `Inbound Email Ingest (${from_email || 'unknown'})`);
  if (!user) {
    return res.status(404).json({ error: `Proxy email ${proxy_email} not matched to any active user` });
  }

  // Parse email body
  const parsed = parseReceiptText(raw_email_body, 'email');

  // Store in DB
  const receipt = await models.createReceipt({
    user_id: user.id,
    merchant: parsed.merchant,
    date: parsed.date,
    tax: parsed.tax,
    total: parsed.total,
    payment_method: parsed.payment_method,
    warranty_expiry: parsed.warranty_expiry,
    source_channel: 'email',
    raw_source: raw_email_body,
    line_items: parsed.line_items,
  });

  res.status(201).json({
    message: 'Email processed successfully',
    receipt,
    resolved_user: {
      real_email: user.real_email,
      proxy_email: user.proxy_email
    }
  });
}));

// Simulates incoming SMS to proxy_phone
router.post('/ingest/sms', asyncHandler(async (req, res) => {
  const { proxy_phone, raw_sms_body, from_phone } = req.body;
  if (!proxy_phone || !raw_sms_body) {
    return res.status(400).json({ error: 'proxy_phone and raw_sms_body are required' });
  }

  // Look up user by proxy phone (creates audit log)
  const user = await models.getUserByProxyPhone(proxy_phone, `Inbound SMS Ingest (${from_phone || 'unknown'})`);
  if (!user) {
    return res.status(404).json({ error: `Proxy phone ${proxy_phone} not matched to any active user` });
  }

  // Parse SMS text
  const parsed = parseReceiptText(raw_sms_body, 'sms');

  // Store in DB
  const receipt = await models.createReceipt({
    user_id: user.id,
    merchant: parsed.merchant,
    date: parsed.date,
    tax: parsed.tax,
    total: parsed.total,
    payment_method: parsed.payment_method,
    warranty_expiry: parsed.warranty_expiry,
    source_channel: 'sms',
    raw_source: raw_sms_body,
    line_items: parsed.line_items,
  });

  res.status(201).json({
    message: 'SMS processed successfully',
    receipt,
    resolved_user: {
      real_email: user.real_email,
      proxy_phone: user.proxy_phone
    }
  });
}));

// Simulates Photo-scan OCR
router.post('/ingest/photo', asyncHandler(async (req, res) => {
  const { user_id, raw_ocr_text } = req.body;
  if (!user_id || !raw_ocr_text) {
    return res.status(400).json({ error: 'user_id and raw_ocr_text are required' });
  }

  const user = await models.getUserById(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Parse OCR text
  const parsed = parseReceiptText(raw_ocr_text, 'photo');

  // Store in DB
  const receipt = await models.createReceipt({
    user_id: user.id,
    merchant: parsed.merchant,
    date: parsed.date,
    tax: parsed.tax,
    total: parsed.total,
    payment_method: parsed.payment_method,
    warranty_expiry: parsed.warranty_expiry,
    source_channel: 'photo',
    raw_source: raw_ocr_text,
    line_items: parsed.line_items,
  });

  res.status(201).json({ message: 'Photo processed successfully', receipt });
}));

// --- BANK STATEMENT ROUTES ---

// Upload and match statements
router.post('/statements/upload', asyncHandler(async (req, res) => {
  const { user_id, statements } = req.body;
  if (!user_id || !Array.isArray(statements)) {
    return res.status(400).json({ error: 'user_id and statements array are required' });
  }

  const user = await models.getUserById(user_id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get existing receipts for fuzzy matching
  const receipts = await models.getReceiptsForUser(user_id);
  const createdStatements = [];

  for (const stmt of statements) {
    const { date, merchant, amount } = stmt;
    if (!date || !merchant || amount === undefined) continue;

    // Fuzzy matcher: find an existing receipt that matches:
    // 1. Amount is within ±$1.00
    // 2. Date is within ±5 days
    // 3. Merchant has sub-string overlap
    let matched_receipt_id = null;
    const stmtDate = new Date(date);
    const stmtAmount = parseFloat(amount);

    if (!isNaN(stmtDate.getTime()) && !isNaN(stmtAmount)) {
      const match = receipts.find((rec) => {
        const recDate = new Date(rec.date);
        const recTotal = parseFloat(rec.total);

        const dateDiffDays = Math.abs(stmtDate - recDate) / (1000 * 60 * 60 * 24);
        const amountDiff = Math.abs(stmtAmount - recTotal);

        const merchantMatch = rec.merchant.toLowerCase().includes(merchant.toLowerCase()) ||
                              merchant.toLowerCase().includes(rec.merchant.toLowerCase());

        return dateDiffDays <= 5 && amountDiff <= 1.0 && merchantMatch;
      });

      if (match) {
        matched_receipt_id = match.id;
      }
    }

    const created = await models.createStatementUpload(user_id, {
      date,
      merchant,
      amount: stmtAmount,
      matched_receipt_id,
    });
    createdStatements.push(created);
  }

  res.status(201).json({
    message: `${createdStatements.length} statement transactions uploaded and analyzed`,
    statements: createdStatements,
  });
}));

// Get all statement uploads with matching info
router.get('/statements', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id query param is required' });
  }

  const statements = await models.getStatementUploadsForUser(user_id);
  res.json({ statements });
}));

// Clear all statement records for a user
router.delete('/statements', asyncHandler(async (req, res) => {
  const { user_id } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id query param is required' });
  }
  await models.clearStatementMatchesForUser(user_id);
  res.json({ message: 'Statement records reset' });
}));

// --- AUDIT TRAIL ROUTE ---

// Get security audit logs
router.get('/users/:id/audit-logs', asyncHandler(async (req, res) => {
  const user = await models.getUserById(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const logs = await models.getAuditLogsForUser(req.params.id);
  res.json({ audit_logs: logs });
}));

module.exports = { router };
