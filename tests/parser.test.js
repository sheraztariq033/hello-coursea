const { test } = require('node:test');
const assert = require('node:assert');
const { parseReceiptText, calculateWarrantyExpiry } = require('../src/services/parser');

test('Parser Service: calculates warranty expiry correctly by category', () => {
  const purchaseDate = '2025-10-01';

  // Electronics category gets 1 year (365 days)
  const electronicsItems = [{ name: 'MacBook Pro', price: 1999.00, category: 'Electronics' }];
  const electronicsExpiry = calculateWarrantyExpiry(purchaseDate, electronicsItems);
  assert.strictEqual(electronicsExpiry, '2026-10-01');

  // Apparel category gets 90 days
  const apparelItems = [{ name: 'Nike Running Shoes', price: 120.00, category: 'Apparel' }];
  const apparelExpiry = calculateWarrantyExpiry(purchaseDate, apparelItems);
  assert.strictEqual(apparelExpiry, '2025-12-30'); // Oct has 31 days, Nov has 30 days -> 30 + 30 + 30 days later

  // Others get 30 days
  const generalItems = [{ name: 'Organic Milk', price: 4.50, category: 'Other' }];
  const generalExpiry = calculateWarrantyExpiry(purchaseDate, generalItems);
  assert.strictEqual(generalExpiry, '2025-10-31');
});

test('Parser Service: parses emailed receipts successfully', () => {
  const sampleEmail = `Subject: Your Apple Purchase Receipt
From: orders@apple.com
Date: 2025-10-05

Apple Store Receipt
-----------------------------------------
iPhone 15 Pro - $999.00
Apple Silicon Case - $49.00

Sales Tax: $82.31
Total Amount Charged: $1130.31
Charged to: VISA ending 9876`;

  const parsed = parseReceiptText(sampleEmail, 'email');

  assert.strictEqual(parsed.merchant, 'Apple');
  assert.strictEqual(parsed.date, '2025-10-05');
  assert.strictEqual(parsed.total, 1130.31);
  assert.strictEqual(parsed.tax, 82.31);
  assert.strictEqual(parsed.payment_method, 'VISA (*9876)');
  assert.strictEqual(parsed.source_channel, 'email');
  assert.strictEqual(parsed.line_items.length, 2);
  assert.strictEqual(parsed.line_items[0].name, 'iPhone 15 Pro');
  assert.strictEqual(parsed.line_items[0].price, 999.00);
  assert.strictEqual(parsed.line_items[0].category, 'Electronics');
  assert.strictEqual(parsed.line_items[1].name, 'Apple Silicon Case');
  assert.strictEqual(parsed.line_items[1].price, 49.00);
});

test('Parser Service: parses SMS receipts successfully', () => {
  const sampleSms = `Thanks for shopping at Starbucks Coffee. Total: $14.50 on 2025-10-04. Paid via Cash.`;
  const parsed = parseReceiptText(sampleSms, 'sms');

  assert.strictEqual(parsed.merchant, 'Starbucks');
  assert.strictEqual(parsed.date, '2025-10-04');
  assert.strictEqual(parsed.total, 14.50);
  assert.strictEqual(parsed.payment_method, 'CASH');
  assert.strictEqual(parsed.source_channel, 'sms');
});
