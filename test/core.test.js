const assert = require('assert');
const { formatINR, calculateINR, formatCurrency, calculateConvertedAmount, getCurrency, CURRENCIES } = require('../public/js/currency.js');

// Mock localStorage for Node.js environment
const mockStorageData = {};
global.localStorage = {
  getItem: (key) => mockStorageData[key] || null,
  setItem: (key, val) => { mockStorageData[key] = String(val); },
  removeItem: (key) => { delete mockStorageData[key]; },
  clear: () => { for (const k in mockStorageData) delete mockStorageData[k]; }
};

const { Storage, StorageKeys, DEFAULT_PAID_BY, DEFAULT_CATEGORIES, DEFAULT_PAYMENT_MODES } = require('../public/js/storage.js');
global.Storage = Storage;

console.log('--- Running Core Unit & Integration Tests ---');

// 1. Currency Tests
console.log('1. Testing Currency Math & Formatters...');
assert.strictEqual(calculateINR(10, 86.5), 865.0);
assert.strictEqual(calculateINR(25.5, 93), 2371.5);
assert.strictEqual(calculateINR(100, 1), 100.0);
assert.strictEqual(calculateINR(0, 86.5), 0.0);

const formatted = formatINR(18450);
assert.ok(formatted.includes('18,450') || formatted.includes('18450'));
console.log('   formatINR(18450) ->', formatted);

// 2. Sheet ID Extraction Tests
console.log('2. Testing Sheet ID Regex Extractor...');
const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
const fullUrl = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';

assert.strictEqual(Storage.extractSheetId(rawId), rawId);
assert.strictEqual(Storage.extractSheetId(fullUrl), rawId);

// 3. Paid By Tags Tests (Default Self & Per-Trip Management)
console.log('3. Testing Paid By Tags & Per-Trip Sync...');
localStorage.clear();

const tripId = 'trip_test_123';
assert.deepStrictEqual(Storage.getPaidByOptions(tripId), ['Self']);

// Add tag for this trip
Storage.addPaidByOption(tripId, 'Dad');
Storage.addPaidByOption(tripId, 'Partner');
assert.deepStrictEqual(Storage.getPaidByOptions(tripId), ['Self', 'Dad', 'Partner']);

// Sync external tags from Google Sheets
Storage.setPaidByOptions(tripId, ['Self', 'Dad', 'Amit', 'Pooja']);
assert.deepStrictEqual(Storage.getPaidByOptions(tripId), ['Self', 'Dad', 'Amit', 'Pooja']);

// Remove tag
Storage.removePaidByOption(tripId, 'Dad');
assert.deepStrictEqual(Storage.getPaidByOptions(tripId), ['Self', 'Amit', 'Pooja']);

// 4. Role Permissions: Creator (Owner) vs Family Link (Member)
console.log('4. Testing Trip Permissions (Owner vs Member)...');
localStorage.clear();

// Trip created locally -> isOwner: true
const creatorTrip = Storage.saveTrip({
  name: 'Goa 2026',
  sheetId: rawId,
  scriptUrl: 'https://script.google.com/macros/s/TEST/exec',
  secret: 'MySecret123',
  isOwner: true
});
assert.strictEqual(creatorTrip.isOwner, true);

// Trip imported via Family Share link -> isOwner: false
const memberTrip = Storage.saveTrip({
  name: 'Family Goa 2026',
  sheetId: rawId,
  scriptUrl: 'https://script.google.com/macros/s/TEST/exec',
  secret: 'MySecret123',
  isOwner: false
});
assert.strictEqual(memberTrip.isOwner, false);

// Member cannot unlock with wrong secret
assert.strictEqual(Storage.unlockTripOwner(memberTrip.id, 'WrongPasscode'), false);
assert.strictEqual(Storage.getTripById(memberTrip.id).isOwner, false);

// Member unlocks with correct master passcode
assert.strictEqual(Storage.unlockTripOwner(memberTrip.id, 'MySecret123'), true);
assert.strictEqual(Storage.getTripById(memberTrip.id).isOwner, true);

// 5. Category Breakdown & Pie / Donut Chart Geometry Tests
console.log('5. Testing Category Breakdown & Donut Chart Geometry...');
const sampleBreakdown = {
  'Food & Dining': 3000,
  'Travel Tickets': 2000,
  'Fuel & Tolls': 1000,
  'Stay & Hotel': 4000
};
const totalSpend = 10000;
const r = 38;
const circumference = 2 * Math.PI * r;

let accumulatedRatio = 0;
const slices = Object.entries(sampleBreakdown).map(([cat, amount]) => {
  const ratio = amount / totalSpend;
  const dashLength = ratio * circumference;
  const offset = -(accumulatedRatio * circumference);
  accumulatedRatio += ratio;
  return { cat, ratio, dashLength, offset };
});

assert.strictEqual(slices.length, 4);
assert.strictEqual(Math.round(accumulatedRatio * 100), 100);
// Sum of slice dash lengths must equal circle circumference
const totalDashLength = slices.reduce((sum, s) => sum + s.dashLength, 0);
assert.ok(Math.abs(totalDashLength - circumference) < 0.0001);
// First slice offset must be 0
assert.ok(Math.abs(slices[0].offset) === 0);
// Second slice offset must equal -dashLength of first slice
assert.ok(Math.abs(slices[1].offset - (-slices[0].dashLength)) < 0.0001);
assert.ok(Math.abs(slices[1].offset - (-slices[0].dashLength)) < 0.0001);

// 6. Collapsible Preferences (Defaults to Closed/Hidden)
console.log('6. Testing Collapsible Preferences (Defaults to Closed)...');
localStorage.clear();
const getTxnsDefault = () => {
  const saved = localStorage.getItem('xpense_txns_collapsed');
  return saved !== null ? saved === 'true' : true;
};
const getBreakdownDefault = () => {
  const saved = localStorage.getItem('xpense_breakdown_collapsed');
  return saved !== null ? saved === 'true' : true;
};
assert.strictEqual(getTxnsDefault(), true, 'Transactions list must default to collapsed (closed)');
assert.strictEqual(getBreakdownDefault(), true, 'Breakdown bar/chart must default to collapsed (closed)');

localStorage.setItem('xpense_txns_collapsed', 'false');
assert.strictEqual(getTxnsDefault(), false, 'Transactions list should reflect user expanded state');

// 7. Family Share Link Obfuscation (URL-safe Base64)
console.log('7. Testing Family Share Link Encoding & Obfuscation (URL-safe Base64)...');
const tripToShare = {
  sheetId: 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit',
  name: 'Goa 🏝️ Vacation 2026',
  secret: '#P@ssw0rd!&=+',
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxyz123/exec'
};

const encodedToken = Storage.encodeSharePayload(tripToShare);
assert.ok(encodedToken && encodedToken.length > 20, 'Encoded token should be a non-empty string');
// Must be URL-safe: no '+', no '/', no trailing '='
assert.strictEqual(encodedToken.includes('+'), false, 'Token must not contain +');
assert.strictEqual(encodedToken.includes('/'), false, 'Token must not contain /');
assert.strictEqual(encodedToken.includes('='), false, 'Token must not contain trailing =');
// Plain text secrets and sheet IDs must NOT be directly visible
assert.strictEqual(encodedToken.includes('#P@ssw0rd!&=+'), false, 'Raw secret must not appear in plain text');
assert.strictEqual(encodedToken.includes('1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms'), false, 'Raw sheet ID must not appear in plain text');

// Decoding back
const decodedTrip = Storage.decodeSharePayload(encodedToken);
assert.ok(decodedTrip, 'Decoded trip must not be null');
assert.strictEqual(decodedTrip.sheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
assert.strictEqual(decodedTrip.name, 'Goa 🏝️ Vacation 2026', 'Unicode emojis must be preserved intact');
assert.strictEqual(decodedTrip.secret, '#P@ssw0rd!&=+', 'Complex secret characters must be preserved intact');
assert.strictEqual(decodedTrip.scriptUrl, 'https://script.google.com/macros/s/AKfycbxyz123/exec');

// Graceful error handling on invalid / corrupt tokens
assert.strictEqual(Storage.decodeSharePayload('not-a-valid-base64-payload!!!'), null);
assert.strictEqual(Storage.decodeSharePayload(''), null);
assert.strictEqual(Storage.decodeSharePayload(null), null);

// Backward-compatibility with verbose/legacy JSON keys (sheet, trip, key, script)
const verboseBase64 = Buffer.from(JSON.stringify({
  sheet: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  trip: 'Legacy Vacation',
  key: 'OldPasscode',
  script: 'https://script.google.com/macros/s/old/exec'
})).toString('base64');
const decodedVerbose = Storage.decodeSharePayload(verboseBase64);
assert.ok(decodedVerbose);
assert.strictEqual(decodedVerbose.sheetId, '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
assert.strictEqual(decodedVerbose.name, 'Legacy Vacation');
assert.strictEqual(decodedVerbose.secret, 'OldPasscode');

// 8. Base Currency, Trip Categories & Payment Modes Customization
console.log('8. Testing Customizable Base Currency, Categories & Payment Modes...');
localStorage.clear();

// Currency formatting across world currencies
assert.ok(formatCurrency(1500, 'INR').includes('1,500') || formatCurrency(1500, 'INR').includes('1500'));
assert.ok(formatCurrency(125.5, 'USD').includes('125.50'));
assert.ok(formatCurrency(250, 'EUR').includes('€') && (formatCurrency(250, 'EUR').includes('250,00') || formatCurrency(250, 'EUR').includes('250.00')));
const jpyFormatted = formatCurrency(15000, 'JPY');
assert.ok(jpyFormatted.includes('15,000') || jpyFormatted.includes('15000'));
assert.ok(!jpyFormatted.includes('.00'), 'JPY should not have decimal places');
assert.strictEqual(calculateConvertedAmount(50, 83.5), 4175.0);

// Default categories and payment modes
const tripA = 'trip_cust_001';
assert.deepStrictEqual(Storage.getTripCategories(tripA), DEFAULT_CATEGORIES);
assert.deepStrictEqual(Storage.getTripPaymentModes(tripA), DEFAULT_PAYMENT_MODES);

// Customize categories for trip
const customCats = ['Food & Dining', 'Public Transport', 'Souvenirs', 'Drinks & Cafe'];
Storage.setTripCategories(tripA, customCats);
assert.deepStrictEqual(Storage.getTripCategories(tripA), customCats);

// Customize payment modes for trip
const customModes = ['Cash', 'Credit Card', 'Transit Card', 'Apple Pay / Google Pay'];
Storage.setTripPaymentModes(tripA, customModes);
assert.deepStrictEqual(Storage.getTripPaymentModes(tripA), customModes);

// Saving trip with baseCurrency, categories, and paymentModes
const fullConfigTrip = Storage.saveTrip({
  name: 'Japan Autumn 🍁 2026',
  sheetId: '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms',
  scriptUrl: 'https://script.google.com/macros/s/AKfycbxyz123/exec',
  secret: 'TokyoSecret2026',
  baseCurrency: 'JPY',
  categories: customCats,
  paymentModes: customModes,
  isOwner: true
});

assert.strictEqual(fullConfigTrip.baseCurrency, 'JPY');
assert.deepStrictEqual(Storage.getTripCategories(fullConfigTrip.id), customCats);
assert.deepStrictEqual(Storage.getTripPaymentModes(fullConfigTrip.id), customModes);

// Encode & decode share link payload with base currency, categories, and payment modes
const shareToken = Storage.encodeSharePayload(fullConfigTrip);
assert.ok(shareToken && shareToken.length > 20);

const decodedShared = Storage.decodeSharePayload(shareToken);
assert.ok(decodedShared);
assert.strictEqual(decodedShared.name, 'Japan Autumn 🍁 2026');
assert.strictEqual(decodedShared.baseCurrency, 'JPY');
assert.deepStrictEqual(decodedShared.categories, customCats);
assert.deepStrictEqual(decodedShared.paymentModes, customModes);

console.log('9. Testing UI Theme Preferences (Light & Dark Mode)...');
// Default theme should be dark
assert.strictEqual(Storage.getTheme(), 'dark');

// Toggle to light mode
Storage.setTheme('light');
assert.strictEqual(Storage.getTheme(), 'light');

// Switch back to dark mode
Storage.setTheme('dark');
assert.strictEqual(Storage.getTheme(), 'dark');

// Non-'light' input falls back to 'dark'
Storage.setTheme('other');
assert.strictEqual(Storage.getTheme(), 'dark');

console.log('10. Testing Multi-Basis Breakdown Calculations & Donut Geometry (Category, Payment Mode, User)...');
// Sample transactions set for multi-basis testing
const sampleTxns = [
  { id: 'TXN-1', category: 'Food & Dining', paidBy: 'Self', paymentMode: 'Cash', amountINR: 1200 },
  { id: 'TXN-2', category: 'Travel Tickets', paidBy: 'Partner', paymentMode: 'Credit Card', amountINR: 3500 },
  { id: 'TXN-3', category: 'Food & Dining', paidBy: 'Partner', paymentMode: 'UPI / GPay', amountINR: 800 },
  { id: 'TXN-4', category: 'Stay & Hotel', paidBy: 'Self', paymentMode: 'Credit Card', amountINR: 4500 }
];

const multiBasisTotalSpend = sampleTxns.reduce((sum, t) => sum + t.amountINR, 0); // 10000
assert.strictEqual(multiBasisTotalSpend, 10000);

// Basis 1: Category Breakdown
const catBreakdown = {};
sampleTxns.forEach(t => catBreakdown[t.category] = (catBreakdown[t.category] || 0) + t.amountINR);
assert.strictEqual(catBreakdown['Food & Dining'], 2000); // 20%
assert.strictEqual(catBreakdown['Travel Tickets'], 3500); // 35%
assert.strictEqual(catBreakdown['Stay & Hotel'], 4500); // 45%

// Basis 2: Payment Mode Breakdown
const paymentBreakdown = {};
sampleTxns.forEach(t => paymentBreakdown[t.paymentMode] = (paymentBreakdown[t.paymentMode] || 0) + t.amountINR);
assert.strictEqual(paymentBreakdown['Cash'], 1200); // 12%
assert.strictEqual(paymentBreakdown['Credit Card'], 8000); // 80%
assert.strictEqual(paymentBreakdown['UPI / GPay'], 800); // 8%

// Basis 3: Paid By / User Breakdown
const userBreakdown = {};
sampleTxns.forEach(t => userBreakdown[t.paidBy] = (userBreakdown[t.paidBy] || 0) + t.amountINR);
assert.strictEqual(userBreakdown['Self'], 5700); // 57%
assert.strictEqual(userBreakdown['Partner'], 4300); // 43%

// Donut geometry verification (C = 2 * PI * 38)
const C_geom = 2 * Math.PI * 38;
const cashDash = (paymentBreakdown['Cash'] / multiBasisTotalSpend) * C_geom;
const ccDash = (paymentBreakdown['Credit Card'] / multiBasisTotalSpend) * C_geom;
const upiDash = (paymentBreakdown['UPI / GPay'] / multiBasisTotalSpend) * C_geom;
assert.ok(Math.abs((cashDash + ccDash + upiDash) - C_geom) < 0.001);

console.log('11. Testing Concurrency Live Summary Payload Data Contract...');
const mockServerSummary = {
  tripName: 'Goa Trip 2026',
  totalSpendINR: 10000,
  totalCount: 4,
  categoryBreakdown: catBreakdown,
  paidByBreakdown: userBreakdown,
  paymentModeBreakdown: paymentBreakdown,
  recentTransactions: sampleTxns,
  participants: ['Self', 'Partner'],
  config: { baseCurrency: 'INR', categories: [], paymentModes: [] }
};

assert.ok(mockServerSummary.categoryBreakdown['Food & Dining'] > 0);
assert.ok(mockServerSummary.paidByBreakdown['Self'] > 0);
assert.ok(mockServerSummary.paymentModeBreakdown['Credit Card'] > 0);
assert.strictEqual(mockServerSummary.totalCount, 4);

// 12. PDF Export Report Engine & Multi-Basis Aggregation Tests
console.log('12. Testing PDF Export Engine & Multi-Basis Aggregations...');
const { ReportExport } = require('../public/js/report-export.js');
const { SheetsAPI } = require('../public/js/sheets-api.js');

const exportSampleTxns = [
  { id: 'tx_1', date: '2026-11-01', description: 'Flight Ticket', category: 'Travel Tickets', paidBy: 'Self', paymentMode: 'Credit Card', amountINR: 12000, originalAmount: 12000, currency: 'INR' },
  { id: 'tx_2', date: '2026-11-03', description: 'Beach Resort', category: 'Stay & Hotel', paidBy: 'Partner', paymentMode: 'Net Banking / Wire', amountINR: 15000, originalAmount: 15000, currency: 'INR' },
  { id: 'tx_3', date: '2026-11-05', description: 'Seafood Dinner', category: 'Food & Dining', paidBy: 'Self', paymentMode: 'UPI / GPay', amountINR: 3200, originalAmount: 3200, currency: 'INR' },
  { id: 'tx_4', date: '2026-11-08', description: 'Scooter Rental', category: 'Rentals & Gear', paidBy: 'Dad', paymentMode: 'Cash', amountINR: 1800, originalAmount: 1800, currency: 'INR' },
  { id: 'tx_5', date: '2026-11-10', description: 'Cafe & Drinks', category: 'Food & Dining', paidBy: 'Partner', paymentMode: 'Cash', amountINR: 850, originalAmount: 850, currency: 'INR' }
];

// Test Category Aggregation
const catAgg = ReportExport.aggregateBreakdown(exportSampleTxns, 'category');
assert.strictEqual(catAgg.total, 32850);
assert.strictEqual(catAgg.breakdown['Food & Dining'], 4050);
assert.strictEqual(catAgg.breakdown['Stay & Hotel'], 15000);
assert.strictEqual(catAgg.breakdown['Travel Tickets'], 12000);
assert.strictEqual(catAgg.breakdown['Rentals & Gear'], 1800);

// Test Payment Mode Aggregation
const payAgg = ReportExport.aggregateBreakdown(exportSampleTxns, 'payment');
assert.strictEqual(payAgg.total, 32850);
assert.strictEqual(payAgg.breakdown['Credit Card'], 12000);
assert.strictEqual(payAgg.breakdown['Net Banking / Wire'], 15000);
assert.strictEqual(payAgg.breakdown['Cash'], 2650);
assert.strictEqual(payAgg.breakdown['UPI / GPay'], 3200);

// Test Paid By Aggregation
const userAgg = ReportExport.aggregateBreakdown(exportSampleTxns, 'user');
assert.strictEqual(userAgg.total, 32850);
assert.strictEqual(userAgg.breakdown['Self'], 15200);
assert.strictEqual(userAgg.breakdown['Partner'], 15850);
assert.strictEqual(userAgg.breakdown['Dad'], 1800);

// 13. Testing Transaction Sorting (Default: Date Oldest First / Chronological)
console.log('13. Testing Transaction Sorting (Oldest First Default & Options)...');
const shuffled = [exportSampleTxns[3], exportSampleTxns[0], exportSampleTxns[4], exportSampleTxns[1], exportSampleTxns[2]];

// Chronological sort (oldest first - default as reviewed by user)
const sortedOldest = [...shuffled].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0));
assert.strictEqual(sortedOldest[0].id, 'tx_1'); // 2026-11-01
assert.strictEqual(sortedOldest[1].id, 'tx_2'); // 2026-11-03
assert.strictEqual(sortedOldest[2].id, 'tx_3'); // 2026-11-05
assert.strictEqual(sortedOldest[3].id, 'tx_4'); // 2026-11-08
assert.strictEqual(sortedOldest[4].id, 'tx_5'); // 2026-11-10

// Newest first sort
const sortedNewest = [...shuffled].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
assert.strictEqual(sortedNewest[0].id, 'tx_5'); // 2026-11-10
assert.strictEqual(sortedNewest[4].id, 'tx_1'); // 2026-11-01

// Amount Highest First sort
const sortedAmount = [...shuffled].sort((a, b) => (Number(b.amountINR) || 0) - (Number(a.amountINR) || 0));
assert.strictEqual(sortedAmount[0].id, 'tx_2'); // 15,000
assert.strictEqual(sortedAmount[1].id, 'tx_1'); // 12,000
assert.strictEqual(sortedAmount[4].id, 'tx_5'); // 850

// 14. Testing SheetsAPI.fetchAllTransactions Backward Compatibility & Offline Merging
console.log('14. Testing SheetsAPI.fetchAllTransactions Backward Compatibility & Offline Merging...');

(async () => {
  const originalFetch = global.fetch;

  // Case A: Modern Apps Script returning allTransactions
  global.fetch = async () => ({
    json: async () => ({
      status: 'success',
      data: {
        tripName: 'Thailand 2026',
        totalSpendINR: 32850,
        totalCount: 5,
        allTransactions: exportSampleTxns,
        recentTransactions: exportSampleTxns.slice(-2)
      }
    })
  });

  const tripConfig = {
    id: 'trip_full_test',
    name: 'Thailand 2026',
    sheetId: 'test_sheet_123',
    scriptUrl: 'https://script.google.com/test',
    secret: 'test_passcode'
  };

  const resultFull = await SheetsAPI.fetchAllTransactions(tripConfig);
  assert.strictEqual(resultFull.isPartial, false);
  assert.strictEqual(resultFull.transactions.length, 5);
  assert.strictEqual(resultFull.transactions[0].id, 'tx_1');

  // Case B: Legacy Apps Script returning only recentTransactions (15 items) with higher totalCount
  global.fetch = async () => ({
    json: async () => ({
      status: 'success',
      data: {
        tripName: 'Thailand 2026',
        totalSpendINR: 100000,
        totalCount: 42,
        // allTransactions is undefined in legacy Apps Script!
        recentTransactions: exportSampleTxns.slice(0, 3)
      }
    })
  });

  const resultLegacy = await SheetsAPI.fetchAllTransactions(tripConfig);
  assert.strictEqual(resultLegacy.isPartial, true);
  assert.strictEqual(resultLegacy.transactions.length, 3);
  assert.strictEqual(resultLegacy.totalCount, 42);

  // Case C: Offline pending transactions merged seamlessly
  Storage.enqueueOffline(tripConfig.id, {
    id: 'tx_offline_pending',
    date: '2026-11-12',
    paidBy: 'Self',
    category: 'Shopping',
    description: 'Souvenir gifts',
    amountInINR: 950,
    originalAmount: 950,
    currency: 'INR',
    paymentMode: 'Cash'
  });

  const resultWithOffline = await SheetsAPI.fetchAllTransactions(tripConfig);
  const foundPending = resultWithOffline.transactions.find(t => t.id === 'tx_offline_pending');
  assert.ok(foundPending, 'Pending offline expense should be merged into export payload');
  assert.strictEqual(foundPending.amountINR, 950);

  // Restore fetch
  global.fetch = originalFetch;

  // 15. Testing Filename Sanitization & Color Conversion
  console.log('15. Testing Filename Sanitization & Color Conversion...');
  assert.strictEqual(ReportExport.sanitizeFilename('Goa & Bali Trip / 2026!'), 'Goa_Bali_Trip_2026_');
  assert.strictEqual(ReportExport.sanitizeFilename('Europe Trip 2026'), 'Europe_Trip_2026');
  assert.deepStrictEqual(ReportExport.hexToRgb('#2563eb'), { r: 37, g: 99, b: 235 });
  assert.deepStrictEqual(ReportExport.hexToRgb('#fff'), { r: 255, g: 255, b: 255 });

  // 16. Testing PDF-Safe Currency Formatting & Complete Category Retention
  console.log('16. Testing PDF-Safe Currency Formatting & Complete Category Retention...');
  const inrFormatted = ReportExport.formatPdfCurrency(18450.5, 'INR');
  assert.strictEqual(inrFormatted, '₹ 18,450.50');
  assert.ok(inrFormatted.startsWith('₹ '), 'INR formatted string must start with Rupee symbol ₹');

  // Verify Rupee icon generator produces non-empty data URL
  const rupeeIconUrl = ReportExport.getRupeeIconDataUrl('#2563eb');
  assert.ok(typeof rupeeIconUrl === 'string' && rupeeIconUrl.startsWith('data:image/png;base64,'), 'Rupee icon URL must be a valid base64 PNG');

  const usdFormatted = ReportExport.formatPdfCurrency(120.75, 'USD');
  assert.strictEqual(usdFormatted, '$ 120.75');
  for (let i = 0; i < usdFormatted.length; i++) {
    assert.ok(usdFormatted.charCodeAt(i) <= 255, `Character ${usdFormatted[i]} should be ASCII/WinAnsi`);
  }

  const eurFormatted = ReportExport.formatPdfCurrency(95, 'EUR');
  assert.strictEqual(eurFormatted, 'EUR 95.00');

  const jpyFormatted = ReportExport.formatPdfCurrency(5000, 'JPY');
  assert.strictEqual(jpyFormatted, 'JPY 5,000');

  // Verify that an extensive list of 10+ categories are all preserved in breakdown aggregation
  const multiCatTxns = [
    { category: 'Food & Dining', amountINR: 1000 },
    { category: 'Travel Tickets', amountINR: 2000 },
    { category: 'Fuel & Tolls', amountINR: 500 },
    { category: 'Stay & Hotel', amountINR: 4000 },
    { category: 'Tickets & Activities', amountINR: 1500 },
    { category: 'Shopping', amountINR: 3000 },
    { category: 'Local Transport / Cabs', amountINR: 800 },
    { category: 'Public Transport', amountINR: 300 },
    { category: 'Souvenirs', amountINR: 600 },
    { category: 'Groceries & Supplies', amountINR: 1200 },
    { category: 'Drinks & Cafe', amountINR: 450 }
  ];
  const fullCatAgg = ReportExport.aggregateBreakdown(multiCatTxns, 'category');
  const catKeys = Object.keys(fullCatAgg.breakdown).filter(k => fullCatAgg.breakdown[k] > 0);
  assert.strictEqual(catKeys.length, 11, 'All 11 categories must be retained and not capped');
  assert.strictEqual(fullCatAgg.total, 15350);

  console.log('\nAll Unit & Integration Tests Passed Successfully! ✅');
})();
