const { test } = require('node:test');
const assert = require('node:assert');
const { initDatabase } = require('../src/db/connection');
const models = require('../src/db/models');

test('Integration: user lifecycle, receipt creation, fuzzy bank matching, and audit logging', async () => {
  // 1. Initialize SQLite Database Tables
  await initDatabase();

  const testEmail = `testuser-${Date.now()}@test.com`;
  const proxyEmail = `proxy-${Date.now()}@vault.ourapp.com`;

  // 2. Create User
  const user = await models.createUser({
    real_email: testEmail,
    proxy_email: proxyEmail,
    proxy_phone: `+1-555-${Math.floor(1000 + Math.random() * 9000)}`,
    plan_tier: 'free',
    notification_preferences: { email_alerts: true }
  });

  assert.ok(user.id);
  assert.strictEqual(user.real_email, testEmail);
  assert.strictEqual(user.proxy_email, proxyEmail);

  // 3. Resolve user by proxy email (this triggers an audit resolution log!)
  const resolvedUser = await models.getUserByProxyEmail(proxyEmail, 'Test Ingest Service');
  assert.ok(resolvedUser);
  assert.strictEqual(resolvedUser.id, user.id);

  // Check audit logs
  const logs = await models.getAuditLogsForUser(user.id);
  assert.strictEqual(logs.length, 1);
  assert.strictEqual(logs[0].resolved_field, 'real_email');
  assert.strictEqual(logs[0].accessed_by, 'Test Ingest Service');

  // 4. Create Receipt with Line Items
  const receipt = await models.createReceipt({
    user_id: user.id,
    merchant: 'Best Buy',
    date: '2025-10-02',
    tax: 105.99,
    total: 1430.98,
    payment_method: 'VISA (*4321)',
    warranty_expiry: '2026-10-02',
    source_channel: 'email',
    raw_source: 'Sample Best Buy Invoice',
    line_items: [
      { name: 'Samsung 55" OLED TV', price: 1299.99, category: 'Electronics' },
      { name: 'HDMI Cable', price: 25.00, category: 'Electronics' }
    ]
  });

  assert.ok(receipt.id);
  assert.strictEqual(receipt.merchant, 'Best Buy');
  assert.strictEqual(receipt.total, 1430.98);
  assert.strictEqual(receipt.line_items.length, 2);

  // 5. Test Filters and Queries
  const filteredReceipts = await models.getReceiptsForUser(user.id, { search: 'Samsung' });
  assert.strictEqual(filteredReceipts.length, 1);
  assert.strictEqual(filteredReceipts[0].merchant, 'Best Buy');

  // 6. Test Bank Statement Upload and Fuzzy Matching
  const uploadedStatement = await models.createStatementUpload(user.id, {
    date: '2025-10-03', // 1 day after receipt
    merchant: 'Best Buy Electronics #442', // partial merchant name
    amount: 1430.98, // identical amount
    matched_receipt_id: receipt.id // matched!
  });

  assert.ok(uploadedStatement.id);
  assert.strictEqual(uploadedStatement.matched_receipt_id, receipt.id);

  // 7. Delete User (Cascade check)
  await models.deleteUser(user.id);

  // Confirm user is deleted
  const deletedUser = await models.getUserById(user.id);
  assert.strictEqual(deletedUser, undefined);

  // Confirm receipts are deleted
  const deletedReceipts = await models.getReceiptsForUser(user.id);
  assert.strictEqual(deletedReceipts.length, 0);
});
