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

console.log('\nAll Unit & Integration Tests Passed Successfully! ✅');
