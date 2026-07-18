/**
 * Intelligent Receipt Parsing Engine
 * Implements rule-based OCR/text analysis for:
 * - Emails (Forwarded text or simulated HTML)
 * - SMS (Short texts from POS merchants)
 * - Photo OCR (Scanned paper receipt text)
 */

/**
 * Calculates warranty expiration date based on the purchase date and category.
 * Rules:
 * - Electronics / Appliances: 1 Year (365 days)
 * - Clothing / Apparel / Footwear: 90 Days
 * - Others: 30 Days
 */
function calculateWarrantyExpiry(purchaseDateStr, lineItems) {
  const purchaseDate = new Date(purchaseDateStr);
  if (isNaN(purchaseDate.getTime())) {
    return null;
  }

  let warrantyDays = 30; // Default: 30 days
  let hasElectronics = false;
  let hasApparel = false;

  const electronicsKeywords = [
    'tv', 'television', 'phone', 'iphone', 'samsung', 'pixel', 'android', 'computer', 'laptop', 'desktop',
    'macbook', 'ipad', 'tablet', 'electronics', 'camera', 'headphone', 'earbud', 'audio', 'device', 'speaker',
    'appliance', 'microwave', 'fridge', 'refrigerator', 'oven', 'washer', 'dryer', 'console', 'nintendo', 'playstation', 'xbox'
  ];

  const apparelKeywords = [
    'clothing', 'shirt', 'shoe', 'pant', 'jacket', 'jeans', 'apparel', 'wear', 'dress', 'tshirt', 'sneaker', 'boots', 'socks'
  ];

  for (const item of lineItems) {
    const nameLower = item.name.toLowerCase();
    const categoryLower = (item.category || '').toLowerCase();

    if (
      electronicsKeywords.some(kw => nameLower.includes(kw)) ||
      categoryLower === 'electronics' || categoryLower === 'appliances'
    ) {
      hasElectronics = true;
    } else if (
      apparelKeywords.some(kw => nameLower.includes(kw)) ||
      categoryLower === 'apparel' || categoryLower === 'clothing'
    ) {
      hasApparel = true;
    }
  }

  if (hasElectronics) {
    warrantyDays = 365; // 1 Year
  } else if (hasApparel) {
    warrantyDays = 90; // 90 days
  }

  const expiryDate = new Date(purchaseDate);
  expiryDate.setDate(expiryDate.getDate() + warrantyDays);

  return expiryDate.toISOString().split('T')[0];
}

/**
 * Normalizes dates from text
 */
function extractDate(text) {
  // Regex to match YYYY-MM-DD, MM/DD/YYYY, DD/MM/YYYY, or Month DD, YYYY
  const datePatterns = [
    /\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/, // YYYY-MM-DD
    /\b(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})\b/, // MM/DD/YYYY
    /\b([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})\b/ // Month DD, YYYY
  ];

  for (const pattern of datePatterns) {
    const match = text.match(pattern);
    if (match) {
      const parsed = Date.parse(match[0]);
      if (!isNaN(parsed)) {
        return new Date(parsed).toISOString().split('T')[0];
      }
    }
  }

  // Fallback to today
  return new Date().toISOString().split('T')[0];
}

/**
 * Parses raw text or html into structural receipt representation
 */
function parseReceiptText(text, channel = 'email') {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  let merchant = 'Unknown Merchant';
  let date = extractDate(normalized);
  let total = 0.0;
  let tax = 0.0;
  let payment_method = 'Unknown';
  let line_items = [];

  // 1. Merchant Detection
  // Check common receipt headers/merchants
  const knownMerchants = [
    'Apple', 'Best Buy', 'Amazon', 'Target', 'Walmart', 'Home Depot', 'Shopify', 'Nike', 'Starbucks', 'Costco', 'Nordstrom', 'Square', 'Clover', 'Toast'
  ];
  for (const m of knownMerchants) {
    if (new RegExp('\\b' + m + '\\b', 'i').test(normalized)) {
      merchant = m;
      break;
    }
  }

  // If no merchant found, assume first line is the merchant name if it's brief
  if (merchant === 'Unknown Merchant' && lines.length > 0) {
    const firstLine = lines[0].trim();
    if (firstLine.length > 0 && firstLine.length < 40 && !firstLine.includes(':') && !firstLine.includes('$')) {
      merchant = firstLine;
    }
  }

  // 2. Total and Tax Parsing
  const totalMatch = normalized.match(/(?:total|amount paid|grand total|charged|payment)\s*:\s*\$?([\d,]+\.\d{2})/i) ||
                     normalized.match(/(?:total|amount paid|grand total|charged|payment)\s+\$?([\d,]+\.\d{2})/i) ||
                     normalized.match(/\$?([\d,]+\.\d{2})\s+total/i);
  if (totalMatch) {
    total = parseFloat(totalMatch[1].replace(/,/g, ''));
  }

  const taxMatch = normalized.match(/(?:tax|sales tax|vat)\s*:\s*\$?([\d,]+\.\d{2})/i) ||
                   normalized.match(/(?:tax|sales tax|vat)\s+\$?([\d,]+\.\d{2})/i);
  if (taxMatch) {
    tax = parseFloat(taxMatch[1].replace(/,/g, ''));
  }

  // 3. Payment Method
  const paymentPatterns = [
    /visa\s*(?:\*\*\*\*|ending\s+in|ending|#)?\s*(\d{4})/i,
    /mastercard\s*(?:\*\*\*\*|ending\s+in|ending|#)?\s*(\d{4})/i,
    /amex\s*(?:\*\*\*\*|ending\s+in|ending|#)?\s*(\d{4})/i,
    /discover\s*(?:\*\*\*\*|ending\s+in|ending|#)?\s*(\d{4})/i,
    /card\s*(?:\*\*\*\*|ending\s+in|ending|#)?\s*(\d{4})/i,
    /apple\s*pay/i,
    /google\s*pay/i,
    /cash/i,
    /credit\s*card/i,
    /debit\s*card/i
  ];

  for (const pattern of paymentPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      if (match[1]) {
        payment_method = `${match[0].split(' ')[0].toUpperCase()} (*${match[1]})`;
      } else {
        payment_method = match[0].toUpperCase();
      }
      break;
    }
  }

  // 4. Line Items Ingestion
  // Scan lines for common item structures (e.g. "Item Name $Price" or "Item Name: $Price" or "Qty x Item Price")
  // Let's filter out total, tax, subtotal, discount, change, card lines
  const ignoreKeywords = ['total', 'tax', 'subtotal', 'discount', 'change', 'payment', 'balance', 'visa', 'mastercard', 'card', 'cash', 'date', 'merchant', 'receipt', 'order', 'invoice', 'auth', 'terminal', 'cust', 'trans', 'items', 'itemized', 'qty', 'quantity', 'price'];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Skip ignored lines
    if (ignoreKeywords.some(kw => new RegExp('^' + kw + '\\b|\\b' + kw + ':', 'i').test(trimmed))) {
      continue;
    }

    // Look for lines containing dollar amounts, like "iPhone 15 - $999.00" or "Nike Shoes: 120.00"
    const itemPriceMatch = trimmed.match(/(.*?)\s*[:\-\s]+\$?([\d,]+\.\d{2})\s*$/) || trimmed.match(/(.*?)\s+\$?([\d,]+\.\d{2})\s*$/);
    if (itemPriceMatch) {
      const itemName = itemPriceMatch[1].trim();
      const itemPrice = parseFloat(itemPriceMatch[2].replace(/,/g, ''));

      // Clean item name (remove punctuation, quantities)
      let cleanedName = itemName.replace(/^[\s\-\*\.\d+xX\(\)]+/, '').trim();

      if (cleanedName && cleanedName.length > 2 && cleanedName.length < 60 && itemPrice > 0 && itemPrice <= total) {
        // Categorization hook
        let category = 'Other';
        const nameLower = cleanedName.toLowerCase();

        const electronicsKeywords = ['tv', 'television', 'phone', 'iphone', 'samsung', 'pixel', 'computer', 'laptop', 'macbook', 'ipad', 'tablet', 'electronics', 'camera', 'headphone', 'audio', 'device', 'speaker', 'console', 'switch', 'game'];
        const apparelKeywords = ['clothing', 'shirt', 'shoe', 'pant', 'jacket', 'jeans', 'apparel', 'wear', 'dress', 'tshirt', 'sneaker', 'boots', 'socks'];
        const foodKeywords = ['coffee', 'latte', 'burger', 'pizza', 'food', 'starbucks', 'cafe', 'restaurant', 'meal', 'lunch', 'dinner', 'grocery', 'milk', 'bread'];
        const homeKeywords = ['furniture', 'rug', 'lamp', 'desk', 'chair', 'bed', 'sofa', 'decor', 'kitchen', 'home', 'depot'];

        if (electronicsKeywords.some(kw => nameLower.includes(kw))) {
          category = 'Electronics';
        } else if (apparelKeywords.some(kw => nameLower.includes(kw))) {
          category = 'Apparel';
        } else if (foodKeywords.some(kw => nameLower.includes(kw))) {
          category = 'Food & Dining';
        } else if (homeKeywords.some(kw => nameLower.includes(kw))) {
          category = 'Home Goods';
        }

        line_items.push({
          name: cleanedName,
          price: itemPrice,
          category,
        });
      }
    }
  }

  // If no line items parsed, but we got a total, let's create a placeholder line item
  if (line_items.length === 0 && total > 0) {
    line_items.push({
      name: `${merchant} General Purchase`,
      price: parseFloat((total - tax).toFixed(2)),
      category: 'General',
    });
  } else if (total === 0 && line_items.length > 0) {
    // If we have line items but total is 0, let's sum them up
    total = line_items.reduce((sum, item) => sum + item.price, 0) + tax;
    total = parseFloat(total.toFixed(2));
  }

  // Determine warranty expiry date
  const warranty_expiry = calculateWarrantyExpiry(date, line_items);

  return {
    merchant,
    date,
    tax,
    total,
    payment_method,
    warranty_expiry,
    source_channel: channel,
    raw_source: text,
    line_items,
  };
}

module.exports = {
  parseReceiptText,
  calculateWarrantyExpiry,
};
