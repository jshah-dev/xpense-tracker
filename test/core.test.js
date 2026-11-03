const assert = require('assert');
const { formatINR, calculateINR, getCurrency, CURRENCIES } = require('../public/js/currency.js');

// Mock localStorage for Node.js environment
const mockStorageData = {};
global.localStorage = {
  getItem: (key) => mockStorageData[key] || null,
  setItem: (key, val) => { mockStorageData[key] = String(val); },
  removeItem: (key) => { delete mockStorageData[key]; },
  clear: () => { for (const k in mockStorageData) delete mockStorageData[k]; }
};

const { Storage, StorageKeys, DEFAULT_PAID_BY } = require('../public/js/storage.js');

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

console.log('\nAll Unit & Integration Tests Passed Successfully! ✅');
