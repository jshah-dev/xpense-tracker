/**
 * Main Application Orchestrator
 * Connects UI, Storage, SheetsAPI, Currency, Offline Sync, and Family Share Links.
 */

// Category icon map and color accents
const CATEGORY_META = {
  'Food & Dining': { icon: '🍛', color: '#f97316', bg: 'bg-orange-500/10', text: 'text-orange-400', label: 'Food' },
  'Travel Tickets': { icon: '✈️', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Tickets' },
  'Fuel & Tolls': { icon: '⛽', color: '#06b6d4', bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'Fuel/Toll' },
  'Stay & Hotel': { icon: '🏨', color: '#8b5cf6', bg: 'bg-purple-500/10', text: 'text-purple-400', label: 'Stay' },
  'Tickets & Activities': { icon: '🎟️', color: '#10b981', bg: 'bg-emerald-500/10', text: 'text-emerald-400', label: 'Activities' },
  'Shopping': { icon: '🛍️', color: '#ec4899', bg: 'bg-pink-500/10', text: 'text-pink-400', label: 'Shopping' },
  'Local Transport / Cabs': { icon: '🚕', color: '#f59e0b', bg: 'bg-amber-500/10', text: 'text-amber-400', label: 'Cabs/Taxi' },
  'Public Transport': { icon: '🚇', color: '#0ea5e9', bg: 'bg-sky-500/10', text: 'text-sky-400', label: 'Transit' },
  'Souvenirs': { icon: '🎁', color: '#d946ef', bg: 'bg-fuchsia-500/10', text: 'text-fuchsia-400', label: 'Souvenirs' },
  'Groceries & Supplies': { icon: '🛒', color: '#84cc16', bg: 'bg-lime-500/10', text: 'text-lime-400', label: 'Groceries' },
  'Drinks & Cafe': { icon: '☕', color: '#eab308', bg: 'bg-yellow-500/10', text: 'text-yellow-400', label: 'Drinks/Cafe' },
  'Pharmacy / Medical': { icon: '💊', color: '#f43f5e', bg: 'bg-rose-500/10', text: 'text-rose-400', label: 'Pharmacy' },
  'Rentals & Gear': { icon: '🚗', color: '#6366f1', bg: 'bg-indigo-500/10', text: 'text-indigo-400', label: 'Rentals' },
  'SIM & Internet': { icon: '📱', color: '#0284c7', bg: 'bg-cyan-500/10', text: 'text-cyan-400', label: 'SIM/Data' },
  'Visa & Fees': { icon: '🛂', color: '#14b8a6', bg: 'bg-teal-500/10', text: 'text-teal-400', label: 'Visa/Fees' },
  'General / Other': { icon: '📦', color: '#64748b', bg: 'bg-slate-500/10', text: 'text-slate-400', label: 'General' },
  // Legacy aliases for backwards compatibility with existing or cached data
  'Transport / Fuel': { icon: '✈️', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Travel Tickets' },
  'Travel': { icon: '✈️', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Travel Tickets' },
  'Transport': { icon: '✈️', color: '#3b82f6', bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'Travel Tickets' }
};

const ALL_CATEGORY_PRESETS = [
  'Food & Dining',
  'Travel Tickets',
  'Fuel & Tolls',
  'Stay & Hotel',
  'Tickets & Activities',
  'Shopping',
  'Local Transport / Cabs',
  'Public Transport',
  'Souvenirs',
  'Groceries & Supplies',
  'Drinks & Cafe',
  'Pharmacy / Medical',
  'Rentals & Gear',
  'SIM & Internet',
  'Visa & Fees',
  'General / Other'
];

const PAYMENT_MODE_PRESETS = [
  { mode: 'Cash', icon: '💵', label: 'Cash' },
  { mode: 'UPI / GPay', icon: '📱', label: 'UPI / GPay' },
  { mode: 'Credit Card', icon: '💳', label: 'Credit Card' },
  { mode: 'Debit Card', icon: '💳', label: 'Debit Card' },
  { mode: 'Forex Card', icon: '🌐', label: 'Forex Card' },
  { mode: 'Apple Pay / Google Pay', icon: '📲', label: 'Apple/G-Pay' },
  { mode: 'Net Banking / Wire', icon: '🏦', label: 'Net Banking' },
  { mode: 'Transit Card', icon: '🎫', label: 'Transit Card' },
  { mode: 'Other', icon: '📝', label: 'Other' }
];

let currentCategory = '';
let currentPaidBy = '';
let currentPaymentMode = '';
let optimisticTransactions = [];
let settingsActiveCategories = [];
let settingsActivePaymentModes = [];

function getActiveBaseCurrency() {
  const trip = Storage.getActiveTrip();
  return (trip && trip.baseCurrency) ? trip.baseCurrency : 'INR';
}

function formatTripSpend(amount) {
  const currencyCode = getActiveBaseCurrency();
  return formatCurrency(amount, currencyCode);
}

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // 1. Check for family share link in URL (?sheet=...&trip=...&key=...&script=...)
  parseUrlTripParameters();

  // 2. Set default date to today (YYYY-MM-DD)
  const dateInput = document.getElementById('date-input');
  if (dateInput) {
    dateInput.value = new Date().toISOString().substring(0, 10);
  }

  // 3. Register Service Worker for offline PWA
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('Service Worker registration skipped:', err);
    });
  }

  // 4. Setup Event Listeners
  setupEventListeners();

  // 4b. Initialize Category Breakdown & Transactions Preferences (Collapsible & hidden by default)
  initBreakdownPreferences();
  initTxnsPreferences();

  // 5. Render Active Trip
  renderActiveTrip();

  // 6. Check Offline Queue Status
  updateSyncBanner();

  // 7. Auto sync on network reconnection
  window.addEventListener('online', () => {
    showToast('Back online! Syncing queued expenses...');
    handleSyncOfflineQueue();
  });
}

/**
 * 1. Family Share Link URL Parameter Parser
 * Crucial: Trips imported via shareable link get isOwner: false (Member role)
 * Supports both new obscured Base64 tokens (?join=...) and legacy plain params (?sheet=...)
 */
function parseUrlTripParameters() {
  const params = new URLSearchParams(window.location.search);
  const joinParam = params.get('join') || params.get('share');
  const sheetParam = params.get('sheet');

  let tripToImport = null;

  // 1. Try decoding obscured Base64 share payload
  if (joinParam) {
    const decoded = Storage.decodeSharePayload(joinParam);
    if (decoded && decoded.sheetId) {
      tripToImport = decoded;
    }
  }

  // 2. Fallback to legacy plain URL parameters (?sheet=...&key=...&trip=...)
  if (!tripToImport && sheetParam) {
    const tripParam = params.get('trip');
    const keyParam = params.get('key');
    const scriptParam = params.get('script');

    tripToImport = {
      sheetId: Storage.extractSheetId(sheetParam),
      name: tripParam ? decodeURIComponent(tripParam) : 'Shared Vacation',
      secret: keyParam ? decodeURIComponent(keyParam) : '',
      scriptUrl: scriptParam ? decodeURIComponent(scriptParam) : ''
    };
  }

  // 3. Save imported trip as Member Mode (isOwner: false)
  if (tripToImport && tripToImport.sheetId) {
    const newTrip = Storage.saveTrip({
      name: tripToImport.name,
      sheetId: tripToImport.sheetId,
      scriptUrl: tripToImport.scriptUrl,
      secret: tripToImport.secret,
      baseCurrency: tripToImport.baseCurrency || 'INR',
      categories: tripToImport.categories || null,
      paymentModes: tripToImport.paymentModes || null,
      isOwner: false // Member role: settings are protected from accidental edits!
    });

    // Remove query parameters from address bar cleanly without reloading
    window.history.replaceState({}, document.title, window.location.pathname);
    showToast(`Joined "${newTrip.name}" via share link!`);
  }
}

/**
 * 2. Setup Form & UI Event Listeners
 */
function setupEventListeners() {
  // Currency Selector change
  const currencySelect = document.getElementById('currency-select');
  const amountInput = document.getElementById('amount-input');
  const rateInput = document.getElementById('exchange-rate-input');

  currencySelect.addEventListener('change', handleCurrencyChange);
  amountInput.addEventListener('input', updateConvertedPreview);
  rateInput.addEventListener('input', () => {
    const code = currencySelect.value;
    const baseCode = getActiveBaseCurrency();
    if (code !== baseCode) {
      Storage.setCachedRate(code, rateInput.value);
    }
    updateConvertedPreview();
  });

  // Category Chips (Event Delegation)
  const categoryChipsContainer = document.getElementById('category-chips');
  if (categoryChipsContainer) {
    categoryChipsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.category-pill');
      if (!btn) return;
      categoryChipsContainer.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active', 'border-blue-500', 'bg-slate-700'));
      btn.classList.add('active', 'border-blue-500', 'bg-slate-700');
      currentCategory = btn.dataset.category;
    });
  }

  // Payment Mode Chips (Event Delegation)
  const paymentChipsContainer = document.getElementById('payment-mode-chips');
  if (paymentChipsContainer) {
    paymentChipsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.payment-pill');
      if (!btn) return;
      paymentChipsContainer.querySelectorAll('.payment-pill').forEach(b => b.classList.remove('active', 'border-blue-500', 'bg-slate-700'));
      btn.classList.add('active', 'border-blue-500', 'bg-slate-700');
      currentPaymentMode = btn.dataset.mode;
    });
  }

  // Quick Add Tag from Main Form
  const quickAddBtn = document.getElementById('quick-add-tag-btn');
  if (quickAddBtn) {
    quickAddBtn.addEventListener('click', handleQuickAddTag);
  }

  // Quick Customize Categories from Main Form
  const customizeCatsBtn = document.getElementById('customize-categories-btn');
  if (customizeCatsBtn) {
    customizeCatsBtn.addEventListener('click', () => {
      openSettingsModal(null, 'categories');
    });
  }

  // Quick Customize Payment Modes from Main Form
  const customizePaymentBtn = document.getElementById('customize-payment-modes-btn');
  if (customizePaymentBtn) {
    customizePaymentBtn.addEventListener('click', () => {
      openSettingsModal(null, 'payment');
    });
  }

  // Form Submission
  const form = document.getElementById('expense-form');
  form.addEventListener('submit', handleFormSubmit);

  // Refresh Button
  document.getElementById('refresh-btn').addEventListener('click', refreshTripData);

  // Settings Modal controls
  document.getElementById('settings-btn').addEventListener('click', () => openSettingsModal());
  const quickEditBtn = document.getElementById('quick-edit-trip-btn');
  if (quickEditBtn) {
    quickEditBtn.addEventListener('click', () => openSettingsModal());
  }
  document.getElementById('close-settings-btn').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-form').addEventListener('submit', handleSaveSettings);
  document.getElementById('copy-share-link-btn').addEventListener('click', handleCopyShareLink);
  document.getElementById('add-paid-by-btn').addEventListener('click', handleAddPaidByOption);
  document.getElementById('delete-trip-btn').addEventListener('click', handleDeleteActiveTrip);

  // Unlock Owner Mode Button (for creator opening link on another device)
  const unlockBtn = document.getElementById('unlock-owner-btn');
  if (unlockBtn) {
    unlockBtn.addEventListener('click', handleUnlockOwnerMode);
  }

  // Toggle Secret Passcode Visibility
  const toggleSecretBtn = document.getElementById('toggle-secret-visibility-btn');
  if (toggleSecretBtn) {
    toggleSecretBtn.addEventListener('click', () => {
      const input = document.getElementById('settings-secret');
      if (input.type === 'password') {
        input.type = 'text';
      } else {
        input.type = 'password';
      }
    });
  }

  // Trip Switcher controls
  document.getElementById('trip-selector-btn').addEventListener('click', openTripModal);
  document.getElementById('close-trip-modal-btn').addEventListener('click', closeTripModal);
  document.getElementById('add-new-trip-btn').addEventListener('click', () => {
    closeTripModal();
    openSettingsModal('NEW'); // Open settings in "create new trip" mode
  });

  // Offline Sync Button
  document.getElementById('sync-now-btn').addEventListener('click', handleSyncOfflineQueue);

  // Breakdown Collapsible Toggle
  const toggleBreakdownBtn = document.getElementById('toggle-breakdown-btn');
  if (toggleBreakdownBtn) {
    toggleBreakdownBtn.addEventListener('click', handleToggleBreakdown);
  }

  // Breakdown View Switcher (Bar vs Pie)
  const viewBarBtn = document.getElementById('view-bar-btn');
  const viewPieBtn = document.getElementById('view-pie-btn');
  if (viewBarBtn) {
    viewBarBtn.addEventListener('click', () => setBreakdownView('bar'));
  }
  if (viewPieBtn) {
    viewPieBtn.addEventListener('click', () => setBreakdownView('pie'));
  }

  // Transactions Collapsible Toggle
  const toggleTxnsBtn = document.getElementById('toggle-txns-btn');
  if (toggleTxnsBtn) {
    toggleTxnsBtn.addEventListener('click', handleToggleTxns);
  }
}

/**
 * Transactions Collapsible Preference Manager
 */
function initTxnsPreferences() {
  const savedState = localStorage.getItem('xpense_txns_collapsed');
  // Default to closed (true) unless explicitly opened by user
  const isCollapsed = savedState !== null ? savedState === 'true' : true;
  const container = document.getElementById('recent-transactions-container');
  const chevron = document.getElementById('txns-chevron');
  const toggleBtn = document.getElementById('toggle-txns-btn');

  if (container && chevron) {
    if (isCollapsed) {
      container.classList.add('hidden');
      chevron.classList.add('-rotate-90');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      container.classList.remove('hidden');
      chevron.classList.remove('-rotate-90');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }
}

function handleToggleTxns() {
  const container = document.getElementById('recent-transactions-container');
  const chevron = document.getElementById('txns-chevron');
  const toggleBtn = document.getElementById('toggle-txns-btn');
  if (!container || !chevron) return;

  const isHidden = container.classList.toggle('hidden');
  if (isHidden) {
    chevron.classList.add('-rotate-90');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    localStorage.setItem('xpense_txns_collapsed', 'true');
  } else {
    chevron.classList.remove('-rotate-90');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    localStorage.setItem('xpense_txns_collapsed', 'false');
  }
}

/**
 * Breakdown Collapsible & View Preference Manager
 */
function initBreakdownPreferences() {
  const savedState = localStorage.getItem('xpense_breakdown_collapsed');
  // Default to collapsed (hidden) for a cleaner view unless explicitly opened
  const isCollapsed = savedState !== null ? savedState === 'true' : true;
  const container = document.getElementById('breakdown-container');
  const chevron = document.getElementById('breakdown-chevron');
  const toggleBtn = document.getElementById('toggle-breakdown-btn');

  if (container && chevron) {
    if (isCollapsed) {
      container.classList.add('hidden');
      chevron.classList.add('-rotate-90');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    } else {
      container.classList.remove('hidden');
      chevron.classList.remove('-rotate-90');
      if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    }
  }

  const savedView = localStorage.getItem('xpense_breakdown_view') || 'bar';
  setBreakdownView(savedView);
}

function handleToggleBreakdown() {
  const container = document.getElementById('breakdown-container');
  const chevron = document.getElementById('breakdown-chevron');
  const toggleBtn = document.getElementById('toggle-breakdown-btn');
  if (!container || !chevron) return;

  const isHidden = container.classList.toggle('hidden');
  if (isHidden) {
    chevron.classList.add('-rotate-90');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'false');
    localStorage.setItem('xpense_breakdown_collapsed', 'true');
  } else {
    chevron.classList.remove('-rotate-90');
    if (toggleBtn) toggleBtn.setAttribute('aria-expanded', 'true');
    localStorage.setItem('xpense_breakdown_collapsed', 'false');
  }
}

function setBreakdownView(view) {
  const barView = document.getElementById('breakdown-bar-view');
  const pieView = document.getElementById('breakdown-pie-view');
  const barBtn = document.getElementById('view-bar-btn');
  const pieBtn = document.getElementById('view-pie-btn');

  if (!barView || !pieView) return;

  if (view === 'pie') {
    barView.classList.add('hidden');
    pieView.classList.remove('hidden');
    if (barBtn) {
      barBtn.classList.remove('bg-blue-600', 'text-white');
      barBtn.classList.add('text-slate-400');
    }
    if (pieBtn) {
      pieBtn.classList.add('bg-blue-600', 'text-white');
      pieBtn.classList.remove('text-slate-400');
    }
    localStorage.setItem('xpense_breakdown_view', 'pie');
  } else {
    pieView.classList.add('hidden');
    barView.classList.remove('hidden');
    if (pieBtn) {
      pieBtn.classList.remove('bg-blue-600', 'text-white');
      pieBtn.classList.add('text-slate-400');
    }
    if (barBtn) {
      barBtn.classList.add('bg-blue-600', 'text-white');
      barBtn.classList.remove('text-slate-400');
    }
    localStorage.setItem('xpense_breakdown_view', 'bar');
  }
}

/**
 * 3. Render Active Trip
 */
function renderActiveTrip() {
  const activeTrip = Storage.getActiveTrip();
  const tripNameEl = document.getElementById('current-trip-name');
  const openSheetLink = document.getElementById('open-sheet-link');
  const quickEditBtn = document.getElementById('quick-edit-trip-btn');
  const currencySelect = document.getElementById('currency-select');
  const exchangeBaseCode = document.getElementById('exchange-rate-base-code');

  const baseCurrency = getActiveBaseCurrency();
  if (currencySelect) {
    currencySelect.value = baseCurrency;
  }
  if (exchangeBaseCode) {
    exchangeBaseCode.textContent = baseCurrency;
  }

  renderPaidByChips();
  renderCategoryChips();
  renderPaymentModeChips();

  if (!activeTrip) {
    tripNameEl.textContent = 'Configure Trip';
    document.getElementById('hero-total-amount').textContent = formatTripSpend(0);
    document.getElementById('hero-total-count').textContent = '0 expenses';
    const pieCenter = document.getElementById('pie-center-amount');
    if (pieCenter) pieCenter.textContent = formatTripSpend(0);
    renderCategoryBreakdown({}, 0);
    openSheetLink.classList.add('hidden');
    if (quickEditBtn) quickEditBtn.classList.remove('hidden');
    // If no trip exists, prompt user with settings modal
    setTimeout(() => openSettingsModal('NEW'), 300);
    return;
  }

  tripNameEl.textContent = activeTrip.name;

  // If member role, hide quick edit pencil
  if (quickEditBtn) {
    if (activeTrip.isOwner === false) {
      quickEditBtn.classList.add('hidden');
    } else {
      quickEditBtn.classList.remove('hidden');
    }
  }

  const isOwner = activeTrip && activeTrip.isOwner !== false;

  // Quick customize buttons on main form are Creator-Only
  const customizeCatsBtn = document.getElementById('customize-categories-btn');
  const customizePaymentBtn = document.getElementById('customize-payment-modes-btn');
  if (customizeCatsBtn) {
    if (isOwner) {
      customizeCatsBtn.classList.remove('hidden');
    } else {
      customizeCatsBtn.classList.add('hidden');
    }
  }
  if (customizePaymentBtn) {
    if (isOwner) {
      customizePaymentBtn.classList.remove('hidden');
    } else {
      customizePaymentBtn.classList.add('hidden');
    }
  }

  if (activeTrip.sheetId && isOwner) {
    openSheetLink.href = `https://docs.google.com/spreadsheets/d/${activeTrip.sheetId}/edit`;
    openSheetLink.classList.remove('hidden');
  } else {
    openSheetLink.classList.add('hidden');
  }

  // 1. Render Cached Summary first for instant UX
  const cached = Storage.getCachedSummary(activeTrip.id);
  if (cached) {
    renderSummaryData(cached);
  }

  // 2. Fetch fresh live data from Google Sheets in background
  if (activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
    refreshTripData();
  }
}

/**
 * Render Paid By Chips dynamically in Expense Form (no default pre-selection)
 */
function renderPaidByChips() {
  const container = document.getElementById('paid-by-chips');
  if (!container) return;
  const activeTrip = Storage.getActiveTrip();
  const options = Storage.getPaidByOptions(activeTrip ? activeTrip.id : null);
  container.innerHTML = '';

  options.forEach((name) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `chip-btn px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 ${
      currentPaidBy === name ? 'active border-blue-500 bg-slate-700' : ''
    }`;
    btn.textContent = name;
    btn.addEventListener('click', () => {
      container.querySelectorAll('button').forEach(b => b.classList.remove('active', 'border-blue-500', 'bg-slate-700'));
      btn.classList.add('active', 'border-blue-500', 'bg-slate-700');
      currentPaidBy = name;
    });
    container.appendChild(btn);
  });
}

/**
 * Render Category Chips dynamically in Expense Form
 */
function renderCategoryChips() {
  const container = document.getElementById('category-chips');
  if (!container) return;
  const activeTrip = Storage.getActiveTrip();
  const tripId = activeTrip ? activeTrip.id : null;
  const categories = Storage.getTripCategories(tripId);
  container.innerHTML = '';

  categories.forEach((cat, idx) => {
    const meta = CATEGORY_META[cat] || { icon: '📦', label: cat };
    const btn = document.createElement('button');
    btn.type = 'button';
    const isLastSingle = (idx === categories.length - 1 && categories.length % 3 === 1);
    btn.className = `category-pill px-2 rounded-xl bg-slate-800 border border-slate-700 flex ${
      isLastSingle ? 'col-span-3 flex-row space-x-1.5 py-2' : 'flex-col space-y-0.5 py-1.5'
    } items-center justify-center transition text-center ${
      currentCategory === cat ? 'active border-blue-500 bg-slate-700' : ''
    }`;
    btn.dataset.category = cat;
    btn.innerHTML = `
      <span class="text-sm leading-none">${meta.icon}</span>
      <span class="text-[10px] font-semibold text-slate-200 leading-tight truncate max-w-full">${meta.label || cat}</span>
    `;
    container.appendChild(btn);
  });
}

/**
 * Render Payment Mode Chips dynamically in Expense Form
 */
function renderPaymentModeChips() {
  const container = document.getElementById('payment-mode-chips');
  if (!container) return;
  const activeTrip = Storage.getActiveTrip();
  const tripId = activeTrip ? activeTrip.id : null;
  const modes = Storage.getTripPaymentModes(tripId);
  container.innerHTML = '';

  modes.forEach(mode => {
    const preset = PAYMENT_MODE_PRESETS.find(p => p.mode === mode);
    const icon = preset ? preset.icon : '💳';
    const label = preset ? preset.label : mode;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `payment-pill px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-200 transition ${
      currentPaymentMode === mode ? 'active border-blue-500 bg-slate-700' : ''
    }`;
    btn.dataset.mode = mode;
    btn.innerHTML = `<span>${icon} ${label}</span>`;
    container.appendChild(btn);
  });
}

/**
 * Render Category Presets Toggle Grid in Settings Modal
 */
function renderCategoryPresetsInSettings(isOwner = true) {
  const grid = document.getElementById('settings-category-preset-grid');
  const countBadge = document.getElementById('active-category-count');
  if (!grid) return;

  if (countBadge) {
    countBadge.textContent = `${settingsActiveCategories.length} Active`;
  }
  grid.innerHTML = '';

  ALL_CATEGORY_PRESETS.forEach(cat => {
    const meta = CATEGORY_META[cat] || { icon: '📦', label: cat };
    const isActive = settingsActiveCategories.includes(cat);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `p-2 rounded-xl border flex items-center justify-between transition text-left text-xs ${
      isActive
        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
        : 'bg-slate-800 border-slate-700 text-slate-400 opacity-60 hover:opacity-100 hover:border-slate-600'
    } ${!isOwner ? 'cursor-not-allowed opacity-80' : ''}`;

    card.innerHTML = `
      <div class="flex items-center space-x-1.5 min-w-0 pr-1">
        <span class="text-base flex-shrink-0">${meta.icon}</span>
        <span class="font-medium truncate">${meta.label || cat}</span>
      </div>
      <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        isActive ? 'bg-blue-500 text-white' : 'border border-slate-600 text-transparent'
      }">✓</span>
    `;

    card.addEventListener('click', () => {
      if (!isOwner) {
        showToast('Only the trip creator can modify categories. Tap "Unlock Creator Settings" above.', true);
        return;
      }
      if (settingsActiveCategories.includes(cat)) {
        if (settingsActiveCategories.length <= 1) {
          showToast('At least one category must remain active.', true);
          return;
        }
        settingsActiveCategories = settingsActiveCategories.filter(c => c !== cat);
      } else {
        settingsActiveCategories.push(cat);
      }
      renderCategoryPresetsInSettings(true);

      // Auto-save immediately for the active trip
      const activeTrip = Storage.getActiveTrip();
      if (activeTrip && activeTrip.id) {
        Storage.setTripCategories(activeTrip.id, settingsActiveCategories);
        renderCategoryChips();
        if (activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
          SheetsAPI.updateTripConfig(activeTrip, {
            categories: settingsActiveCategories,
            paymentModes: settingsActivePaymentModes,
            baseCurrency: activeTrip.baseCurrency || 'INR'
          });
        }
      }
    });

    grid.appendChild(card);
  });
}

/**
 * Render Payment Mode Presets Toggle Grid in Settings Modal
 */
function renderPaymentModePresetsInSettings(isOwner = true) {
  const grid = document.getElementById('settings-payment-preset-grid');
  const countBadge = document.getElementById('active-payment-count');
  if (!grid) return;

  if (countBadge) {
    countBadge.textContent = `${settingsActivePaymentModes.length} Active`;
  }
  grid.innerHTML = '';

  PAYMENT_MODE_PRESETS.forEach(item => {
    const isActive = settingsActivePaymentModes.includes(item.mode);
    const card = document.createElement('button');
    card.type = 'button';
    card.className = `p-2 rounded-xl border flex items-center justify-between transition text-left text-xs ${
      isActive
        ? 'bg-blue-600/20 border-blue-500 text-white shadow-sm'
        : 'bg-slate-800 border-slate-700 text-slate-400 opacity-60 hover:opacity-100 hover:border-slate-600'
    } ${!isOwner ? 'cursor-not-allowed opacity-80' : ''}`;

    card.innerHTML = `
      <div class="flex items-center space-x-1.5 min-w-0 pr-1">
        <span class="text-base flex-shrink-0">${item.icon}</span>
        <span class="font-medium truncate">${item.label}</span>
      </div>
      <span class="w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
        isActive ? 'bg-blue-500 text-white' : 'border border-slate-600 text-transparent'
      }">✓</span>
    `;

    card.addEventListener('click', () => {
      if (!isOwner) {
        showToast('Only the trip creator can modify payment modes. Tap "Unlock Creator Settings" above.', true);
        return;
      }
      if (settingsActivePaymentModes.includes(item.mode)) {
        if (settingsActivePaymentModes.length <= 1) {
          showToast('At least one payment mode must remain active.', true);
          return;
        }
        settingsActivePaymentModes = settingsActivePaymentModes.filter(m => m !== item.mode);
      } else {
        settingsActivePaymentModes.push(item.mode);
      }
      renderPaymentModePresetsInSettings(true);

      // Auto-save immediately for the active trip
      const activeTrip = Storage.getActiveTrip();
      if (activeTrip && activeTrip.id) {
        Storage.setTripPaymentModes(activeTrip.id, settingsActivePaymentModes);
        renderPaymentModeChips();
        if (activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
          SheetsAPI.updateTripConfig(activeTrip, {
            categories: settingsActiveCategories,
            paymentModes: settingsActivePaymentModes,
            baseCurrency: activeTrip.baseCurrency || 'INR'
          });
        }
      }
    });

    grid.appendChild(card);
  });
}

/**
 * Render Paid By Tags inside Settings Modal with ✕ delete buttons
 */
function renderSettingsPaidByList() {
  const container = document.getElementById('settings-paid-by-list');
  if (!container) return;
  const activeTrip = Storage.getActiveTrip();
  const options = Storage.getPaidByOptions(activeTrip ? activeTrip.id : null);
  container.innerHTML = '';

  options.forEach((name) => {
    const pill = document.createElement('div');
    pill.className = 'inline-flex items-center space-x-1.5 px-3 py-1 bg-slate-750 border border-slate-700 rounded-lg text-xs font-medium text-slate-200';
    pill.innerHTML = `
      <span>${name}</span>
      <button type="button" class="text-slate-400 hover:text-red-400 font-bold ml-1 transition" title="Remove tag">✕</button>
    `;

    const deleteBtn = pill.querySelector('button');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      handleRemovePaidByOption(name);
    });

    container.appendChild(pill);
  });
}

async function handleAddPaidByOption() {
  const activeTrip = Storage.getActiveTrip();
  const input = document.getElementById('new-paid-by-input');
  const name = input.value.trim();
  if (!name) return;

  const tripId = activeTrip ? activeTrip.id : null;
  const updatedTags = Storage.addPaidByOption(tripId, name);
  input.value = '';
  renderPaidByChips();
  renderSettingsPaidByList();
  showToast(`Added "${name}" tag!`);

  // Persist to Google Sheets Participants sheet in background
  if (activeTrip && activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
    await SheetsAPI.updateParticipants(activeTrip, updatedTags);
  }
}

async function handleQuickAddTag() {
  const activeTrip = Storage.getActiveTrip();
  const name = prompt('Enter name of person who paid:');
  if (!name || !name.trim()) return;

  const trimmed = name.trim();
  const tripId = activeTrip ? activeTrip.id : null;
  const updatedTags = Storage.addPaidByOption(tripId, trimmed);
  currentPaidBy = trimmed;
  renderPaidByChips();
  showToast(`Added and selected "${trimmed}" tag!`);

  // Persist to Google Sheets Participants sheet in background
  if (activeTrip && activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
    await SheetsAPI.updateParticipants(activeTrip, updatedTags);
  }
}

async function handleRemovePaidByOption(name) {
  const activeTrip = Storage.getActiveTrip();
  const tripId = activeTrip ? activeTrip.id : null;
  const updatedTags = Storage.removePaidByOption(tripId, name);
  renderPaidByChips();
  renderSettingsPaidByList();
  showToast(`Removed "${name}" tag`);

  // Persist to Google Sheets Participants sheet in background
  if (activeTrip && activeTrip.scriptUrl && activeTrip.sheetId && activeTrip.secret) {
    await SheetsAPI.updateParticipants(activeTrip, updatedTags);
  }
}

/**
 * 4. Currency Switcher Handler
 */
function handleCurrencyChange() {
  const currencySelect = document.getElementById('currency-select');
  const container = document.getElementById('exchange-rate-container');
  const label = document.getElementById('exchange-rate-label');
  const rateInput = document.getElementById('exchange-rate-input');
  const preview = document.getElementById('converted-preview');
  const baseCurrency = getActiveBaseCurrency();

  const code = currencySelect.value;
  if (code === baseCurrency) {
    container.classList.add('hidden');
    preview.classList.add('hidden');
    rateInput.value = '1.0';
  } else {
    const cur = getCurrency(code);
    const cachedRate = Storage.getCachedRate(code, cur.defaultRate);
    container.classList.remove('hidden');
    label.textContent = `1 ${code} =`;
    rateInput.value = cachedRate;
    preview.classList.remove('hidden');
  }
  updateConvertedPreview();
}

function updateConvertedPreview() {
  const currencyCode = document.getElementById('currency-select').value;
  const amountInput = document.getElementById('amount-input');
  const rateInput = document.getElementById('exchange-rate-input');
  const preview = document.getElementById('converted-preview');
  const baseCurrency = getActiveBaseCurrency();

  if (currencyCode === baseCurrency) {
    preview.classList.add('hidden');
    return;
  }

  const amount = Number(amountInput.value) || 0;
  const rate = Number(rateInput.value) || 1;
  const converted = calculateConvertedAmount(amount, rate);
  preview.textContent = `≈ ${formatTripSpend(converted)}`;
  preview.classList.remove('hidden');
}

/**
 * 5. Handle Expense Form Submission
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip || !activeTrip.sheetId || !activeTrip.scriptUrl || !activeTrip.secret) {
    showToast('Please configure Sheet ID & Apps Script in Settings first!', true);
    openSettingsModal();
    return;
  }

  const amountInput = document.getElementById('amount-input');
  const currencySelect = document.getElementById('currency-select');
  const rateInput = document.getElementById('exchange-rate-input');
  const descInput = document.getElementById('desc-input');
  const dateInput = document.getElementById('date-input');
  const submitBtn = document.getElementById('submit-expense-btn');

  const originalAmount = parseFloat(amountInput.value);
  if (isNaN(originalAmount) || originalAmount <= 0) {
    showToast('Please enter a valid amount', true);
    return;
  }

  // Ensure deliberate selection with no accidental defaults
  if (!currentCategory) {
    showToast('Please select a Category', true);
    return;
  }
  if (!currentPaidBy) {
    showToast('Please select who Paid By', true);
    return;
  }
  if (!currentPaymentMode) {
    showToast('Please select a Payment Mode', true);
    return;
  }

  const currency = currencySelect.value;
  const baseCurrency = getActiveBaseCurrency();
  const exchangeRate = currency === baseCurrency ? 1.0 : parseFloat(rateInput.value) || 1.0;
  const amountInINR = calculateConvertedAmount(originalAmount, exchangeRate);
  const description = descInput.value.trim();
  const date = dateInput.value || new Date().toISOString().substring(0, 10);

  // Generate unique transaction ID
  const txnId = `TXN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

  const transaction = {
    id: txnId,
    date: date,
    paidBy: currentPaidBy,
    category: currentCategory,
    description: description || currentCategory,
    originalAmount: originalAmount,
    currency: currency,
    exchangeRate: exchangeRate,
    amountInINR: amountInINR,
    paymentMode: currentPaymentMode,
    loggedAt: new Date().toISOString()
  };

  // 1. Optimistic UI Update: Prepend to recent transactions immediately
  optimisticTransactions.unshift({ ...transaction, status: 'pending' });
  renderRecentTransactionsList();
  incrementHeroSpend(amountInINR);

  // Cleanly reset form fields and selections
  resetExpenseForm();

  // 2. Dispatch to Google Apps Script in background
  submitBtn.disabled = true;
  submitBtn.classList.add('opacity-75');

  try {
    const result = await SheetsAPI.logExpense(activeTrip, transaction);

    // Update optimistic item status to synced
    const target = optimisticTransactions.find(t => t.id === txnId);
    if (target) {
      target.status = result.offline ? 'offline' : 'synced';
    }
    renderRecentTransactionsList();

    if (result.offline) {
      showToast('Offline: Saved to device queue.');
      updateSyncBanner();
    } else {
      showToast('Expense logged to Google Sheet! ✓');
    }

  } catch (err) {
    console.error('Failed to log expense:', err);
    const target = optimisticTransactions.find(t => t.id === txnId);
    if (target) target.status = 'error';
    renderRecentTransactionsList();
    showToast(`Error: ${err.message}`, true);
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-75');
  }
}

/**
 * Fully resets the expense form back to defaults after submission
 */
function resetExpenseForm() {
  const amountInput = document.getElementById('amount-input');
  const descInput = document.getElementById('desc-input');
  const dateInput = document.getElementById('date-input');
  const currencySelect = document.getElementById('currency-select');
  const exchangeContainer = document.getElementById('exchange-rate-container');
  const preview = document.getElementById('converted-preview');
  const baseCurrency = getActiveBaseCurrency();

  // 1. Clear text and numbers
  if (amountInput) amountInput.value = '';
  if (descInput) descInput.value = '';
  if (dateInput) dateInput.value = new Date().toISOString().substring(0, 10);

  // 2. Reset Currency to Trip Base Currency
  if (currencySelect) currencySelect.value = baseCurrency;
  if (exchangeContainer) exchangeContainer.classList.add('hidden');
  if (preview) preview.classList.add('hidden');

  // 3. Clear Category selection (no default)
  currentCategory = '';
  document.querySelectorAll('.category-pill').forEach((btn) => {
    btn.classList.remove('active', 'border-blue-500', 'bg-slate-700');
  });

  // 4. Clear Paid By selection (no default)
  currentPaidBy = '';
  const paidByChips = document.getElementById('paid-by-chips');
  if (paidByChips) {
    paidByChips.querySelectorAll('button').forEach((btn) => {
      btn.classList.remove('active', 'border-blue-500', 'bg-slate-700');
    });
  }

  // 5. Clear Payment Mode selection (no default)
  currentPaymentMode = '';
  document.querySelectorAll('.payment-pill').forEach((btn) => {
    btn.classList.remove('active', 'border-blue-500', 'bg-slate-700');
  });
}

function incrementHeroSpend(amount) {
  const heroTotalEl = document.getElementById('hero-total-amount');
  const heroCountEl = document.getElementById('hero-total-count');
  const pieCenterEl = document.getElementById('pie-center-amount');

  const currentSpend = parseFloat(heroTotalEl.textContent.replace(/[^0-9.-]+/g, '')) || 0;
  const currentCount = parseInt(heroCountEl.textContent) || 0;
  const newSpend = currentSpend + amount;

  heroTotalEl.textContent = formatTripSpend(newSpend);
  heroCountEl.textContent = `${currentCount + 1} expenses`;
  if (pieCenterEl) pieCenterEl.textContent = formatTripSpend(newSpend);
}

/**
 * 6. Refresh Data from Google Sheets & Synchronize Participant Tags
 */
async function refreshTripData() {
  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip || !activeTrip.scriptUrl || !activeTrip.sheetId || !activeTrip.secret) return;

  const refreshIcon = document.getElementById('refresh-icon');
  refreshIcon.classList.add('animate-spin-fast');

  try {
    const data = await SheetsAPI.fetchTripSummary(activeTrip);
    renderSummaryData(data);

    // Synchronize participants list fetched from Google Sheets!
    if (data && data.participants && Array.isArray(data.participants) && data.participants.length > 0) {
      Storage.setPaidByOptions(activeTrip.id, data.participants);
      renderPaidByChips();
      renderSettingsPaidByList();
    }

    // Synchronize trip configuration (categories, payment modes, base currency) from Google Sheets!
    if (data && data.config) {
      let configChanged = false;
      if (Array.isArray(data.config.categories) && data.config.categories.length > 0) {
        Storage.setTripCategories(activeTrip.id, data.config.categories);
        renderCategoryChips();
      }
      if (Array.isArray(data.config.paymentModes) && data.config.paymentModes.length > 0) {
        Storage.setTripPaymentModes(activeTrip.id, data.config.paymentModes);
        renderPaymentModeChips();
      }
      if (data.config.baseCurrency && activeTrip.baseCurrency !== data.config.baseCurrency) {
        activeTrip.baseCurrency = data.config.baseCurrency;
        Storage.saveTrip(activeTrip);
        configChanged = true;
      }
      if (configChanged) {
        renderActiveTrip();
      }
    }

    showToast('Ledger up to date! ✓');
  } catch (err) {
    console.warn('Could not refresh live data:', err.message);
    if (navigator.onLine) {
      showToast(err.message, true);
    }
  } finally {
    refreshIcon.classList.remove('animate-spin-fast');
  }
}

/**
 * 7. Render Summary Data (Spend Card, Progress Bar, Transactions)
 */
function renderSummaryData(data) {
  if (!data) return;

  // Hero Card
  document.getElementById('hero-total-amount').textContent = formatTripSpend(data.totalSpendINR || 0);
  document.getElementById('hero-total-count').textContent = `${data.totalCount || 0} expenses`;

  // Category Progress Bar & Legend
  renderCategoryBreakdown(data.categoryBreakdown || {}, data.totalSpendINR || 0);

  // Recent Transactions: Combine server items with any still-pending local items
  const serverItems = (data.recentTransactions || []).map(t => ({
    id: t.id,
    date: t.date,
    paidBy: t.paidBy,
    category: t.category,
    description: t.description,
    originalAmount: t.originalAmount,
    currency: t.currency,
    amountInINR: t.amountINR || t.amountInINR,
    paymentMode: t.paymentMode,
    status: 'synced'
  }));

  // Keep any optimistic pending items at the very top
  const pendingItems = optimisticTransactions.filter(t => t.status !== 'synced');
  optimisticTransactions = [...pendingItems, ...serverItems];

  // Remove duplicates by ID
  const seen = new Set();
  optimisticTransactions = optimisticTransactions.filter(t => {
    if (!t.id || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });

  renderRecentTransactionsList();
}

function renderCategoryBreakdown(breakdown = {}, totalSpend = 0) {
  const bar = document.getElementById('category-progress-bar');
  const barLegend = document.getElementById('category-legend');
  const pieSvg = document.getElementById('category-pie-svg');
  const pieLegend = document.getElementById('category-pie-legend');
  const pieCenterAmount = document.getElementById('pie-center-amount');

  if (bar) bar.innerHTML = '';
  if (barLegend) barLegend.innerHTML = '';
  if (pieSvg) pieSvg.innerHTML = '';
  if (pieLegend) pieLegend.innerHTML = '';
  if (pieCenterAmount) pieCenterAmount.textContent = formatTripSpend(totalSpend || 0);

  const categories = Object.keys(breakdown).filter(cat => breakdown[cat] > 0);
  if (categories.length === 0 || totalSpend <= 0) {
    if (bar) bar.innerHTML = '<div class="w-full bg-slate-700"></div>';
    if (barLegend) barLegend.innerHTML = '<span class="text-slate-500 italic text-[11px]">No expenses recorded yet.</span>';
    if (pieSvg) {
      pieSvg.innerHTML = `
        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#334155" stroke-width="14"></circle>
      `;
    }
    if (pieLegend) {
      pieLegend.innerHTML = `
        <div class="text-center py-3 text-slate-500 text-xs italic">
          No expenses recorded yet.
        </div>
      `;
    }
    return;
  }

  // Sort descending by amount
  categories.sort((a, b) => breakdown[b] - breakdown[a]);

  // Circumference for r=38
  const C = 2 * Math.PI * 38; // approx 238.761
  let accumulatedRatio = 0;

  // Render background track for Pie SVG
  if (pieSvg) {
    const track = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    track.setAttribute('cx', '50');
    track.setAttribute('cy', '50');
    track.setAttribute('r', '38');
    track.setAttribute('fill', 'transparent');
    track.setAttribute('stroke', '#1e293b');
    track.setAttribute('stroke-width', '14');
    pieSvg.appendChild(track);
  }

  categories.forEach(cat => {
    const amount = breakdown[cat] || 0;
    const ratio = amount / totalSpend;
    const pct = Math.round(ratio * 100);
    const pctDisplay = pct === 0 ? '<1%' : `${pct}%`;
    const meta = CATEGORY_META[cat] || CATEGORY_META['General / Other'];

    // 1. Progress bar segment
    if (bar) {
      const seg = document.createElement('div');
      seg.style.width = `${Math.max(2, pct)}%`;
      seg.style.backgroundColor = meta.color;
      seg.title = `${cat}: ${formatTripSpend(amount)} (${pctDisplay})`;
      bar.appendChild(seg);
    }

    // 2. Bar Legend pill
    if (barLegend) {
      const leg = document.createElement('span');
      leg.className = 'flex items-center space-x-1';
      leg.innerHTML = `
        <span class="w-2 h-2 rounded-full" style="background-color: ${meta.color}"></span>
        <span>${meta.icon} ${cat.split(' ')[0]}: ${pctDisplay}</span>
      `;
      barLegend.appendChild(leg);
    }

    // 3. Pie SVG slice
    if (pieSvg) {
      const dashLength = ratio * C;
      const offset = -(accumulatedRatio * C);

      const slice = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      slice.setAttribute('cx', '50');
      slice.setAttribute('cy', '50');
      slice.setAttribute('r', '38');
      slice.setAttribute('fill', 'transparent');
      slice.setAttribute('stroke', meta.color);
      slice.setAttribute('stroke-width', '14');
      slice.setAttribute('stroke-dasharray', `${dashLength.toFixed(2)} ${C.toFixed(2)}`);
      slice.setAttribute('stroke-dashoffset', offset.toFixed(2));
      slice.innerHTML = `<title>${cat}: ${formatTripSpend(amount)} (${pctDisplay})</title>`;
      pieSvg.appendChild(slice);

      accumulatedRatio += ratio;
    }

    // 4. Pie Legend list row
    if (pieLegend) {
      const row = document.createElement('div');
      row.className = 'flex justify-between items-center py-1 border-b border-slate-750/40 last:border-0';
      row.innerHTML = `
        <div class="flex items-center space-x-1.5 min-w-0 pr-2">
          <span class="w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: ${meta.color}"></span>
          <span class="truncate text-slate-300 font-medium">${meta.icon} ${cat}</span>
        </div>
        <div class="flex items-center space-x-2 flex-shrink-0">
          <span class="font-semibold text-white">${formatTripSpend(amount)}</span>
          <span class="text-[10px] text-slate-400 font-mono w-8 text-right">${pctDisplay}</span>
        </div>
      `;
      pieLegend.appendChild(row);
    }
  });
}

function renderRecentTransactionsList() {
  const container = document.getElementById('recent-transactions-list');
  container.innerHTML = '';

  const activeTrip = Storage.getActiveTrip();
  const isOwner = activeTrip && activeTrip.isOwner !== false;

  if (optimisticTransactions.length === 0) {
    container.innerHTML = `
      <div class="p-6 text-center text-slate-500 text-xs bg-slate-800/40 rounded-xl border border-slate-800">
        No expenses recorded yet.
      </div>
    `;
    return;
  }

  optimisticTransactions.forEach(item => {
    const meta = CATEGORY_META[item.category] || CATEGORY_META['General / Other'];

    let syncBadge = '';
    if (item.status === 'pending' || item.status === 'offline') {
      syncBadge = `
        <span class="inline-flex items-center text-amber-400 text-[10px] space-x-0.5 animate-sync-pulse" title="Pending Sync">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke-width="2"></circle><path stroke-width="2" d="M12 6v6l4 2"></path></svg>
        </span>
      `;
    } else if (item.status === 'error') {
      syncBadge = `<span class="text-red-400 text-[11px] font-bold" title="Sync Failed">✕</span>`;
    } else {
      syncBadge = `
        <span class="inline-flex items-center text-emerald-400 text-[10px]" title="Synced to Sheet">
          <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path></svg>
        </span>
      `;
    }

    const card = document.createElement('div');
    card.className = 'p-3 bg-slate-800/70 border border-slate-750 rounded-xl flex items-center justify-between space-x-3 shadow-sm';
    card.innerHTML = `
      <div class="flex items-center space-x-3 min-w-0">
        <div class="w-10 h-10 rounded-xl ${meta.bg} flex items-center justify-center text-lg flex-shrink-0">
          ${meta.icon}
        </div>
        <div class="min-w-0">
          <div class="text-xs font-bold text-slate-100 truncate">${item.description || item.category}</div>
          <div class="flex items-center space-x-1.5 text-[11px] text-slate-400 mt-0.5">
            <span>${item.date || ''}</span>
            <span>·</span>
            <span class="px-1.5 py-0.2 rounded bg-slate-700/60 text-slate-300 font-medium">${item.paidBy || 'Self'}</span>
            ${item.paymentMode ? `<span>·</span><span>${item.paymentMode}</span>` : ''}
          </div>
        </div>
      </div>

      <div class="text-right flex-shrink-0 flex flex-col items-end">
        <div class="text-sm font-extrabold text-white flex items-center space-x-1.5">
          <span>${formatTripSpend(item.amountInINR)}</span>
          ${syncBadge}
          ${(isOwner && item.status !== 'pending' && item.status !== 'offline') ? `
            <button type="button" class="del-txn-btn ml-1 p-1 text-slate-500 hover:text-red-400 active:scale-95 transition rounded" title="Delete expense from Sheet">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          ` : ''}
        </div>
        ${(item.currency && item.currency !== getActiveBaseCurrency() && item.originalAmount) ? `
          <div class="text-[10px] text-slate-400 mt-0.5">
            ${formatOriginalCurrency(item.originalAmount, item.currency)}
          </div>
        ` : ''}
      </div>
    `;

    const delBtn = card.querySelector('.del-txn-btn');
    if (delBtn) {
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteTransaction(item.id, item.amountInINR);
      });
    }

    container.appendChild(card);
  });
}

/**
 * Handle deleting a transaction (Creator only)
 */
async function handleDeleteTransaction(txnId, amountInINR) {
  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip || activeTrip.isOwner === false) return;

  if (!confirm('Are you sure you want to delete this expense from Google Sheets?')) {
    return;
  }

  // Optimistically remove from list
  optimisticTransactions = optimisticTransactions.filter(t => t.id !== txnId);
  renderRecentTransactionsList();
  decrementHeroSpend(amountInINR);

  try {
    await SheetsAPI.deleteExpense(activeTrip, txnId);
    showToast('Expense deleted from Google Sheet! ✓');
    refreshTripData();
  } catch (err) {
    console.error('Failed to delete transaction:', err);
    showToast(`Error deleting: ${err.message}`, true);
    refreshTripData();
  }
}

function decrementHeroSpend(amount) {
  const heroTotalEl = document.getElementById('hero-total-amount');
  const heroCountEl = document.getElementById('hero-total-count');
  const pieCenterEl = document.getElementById('pie-center-amount');

  const currentSpend = parseFloat(heroTotalEl.textContent.replace(/[^0-9.-]+/g, '')) || 0;
  const currentCount = parseInt(heroCountEl.textContent) || 0;
  const newSpend = Math.max(0, currentSpend - amount);

  heroTotalEl.textContent = formatTripSpend(newSpend);
  heroCountEl.textContent = `${Math.max(0, currentCount - 1)} expenses`;
  if (pieCenterEl) pieCenterEl.textContent = formatTripSpend(newSpend);
}

/**
 * 8. Offline Queue Syncing
 */
function updateSyncBanner() {
  const queue = Storage.getOfflineQueue();
  const banner = document.getElementById('sync-banner');
  const text = document.getElementById('sync-banner-text');

  if (queue.length > 0) {
    banner.classList.remove('hidden');
    text.textContent = `${queue.length} expense${queue.length > 1 ? 's' : ''} pending sync`;
  } else {
    banner.classList.add('hidden');
  }
}

async function handleSyncOfflineQueue() {
  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip) return;

  const btn = document.getElementById('sync-now-btn');
  btn.textContent = 'Syncing...';
  btn.disabled = true;

  try {
    const result = await SheetsAPI.syncOfflineQueue(activeTrip, (curr, total) => {
      btn.textContent = `Syncing ${curr}/${total}...`;
    });

    if (result.synced > 0) {
      showToast(`Synced ${result.synced} offline expense${result.synced > 1 ? 's' : ''}! ✓`);
      refreshTripData();
    }
  } catch (err) {
    console.error('Offline queue sync error:', err);
    showToast('Sync interrupted. Will retry automatically.', true);
  } finally {
    btn.textContent = 'Sync Now';
    btn.disabled = false;
    updateSyncBanner();
  }
}

/**
 * 9. Settings Modal Management, Permissions & Trip Editing
 */
function openSettingsModal(targetTripId = null, scrollToSection = null) {
  const modal = document.getElementById('settings-modal');
  const titleEl = document.getElementById('settings-modal-title');
  const idInput = document.getElementById('settings-trip-id');
  const nameInput = document.getElementById('settings-trip-name');
  const baseCurrencySelect = document.getElementById('settings-base-currency');
  const sheetInput = document.getElementById('settings-sheet-id');
  const scriptInput = document.getElementById('settings-script-url');
  const secretInput = document.getElementById('settings-secret');
  const deleteBtn = document.getElementById('delete-trip-btn');
  const saveBtn = document.getElementById('save-trip-settings-btn');
  const warningEl = document.getElementById('shared-trip-warning');
  const roleBadge = document.getElementById('settings-role-badge');
  const categoriesSection = document.getElementById('settings-categories-section');
  const paymentModesSection = document.getElementById('settings-payment-modes-section');

  // Ensure password field is dotted by default
  secretInput.type = 'password';

  let tripToEdit = null;

  if (targetTripId === 'NEW') {
    // Mode: Create New Trip (Always Owner)
    tripToEdit = null;
    titleEl.textContent = 'Create New Trip';
    idInput.value = '';
    nameInput.value = '';
    if (baseCurrencySelect) baseCurrencySelect.value = 'INR';
    sheetInput.value = '';
    scriptInput.value = '';
    secretInput.value = '';
    deleteBtn.classList.add('hidden');
    settingsActiveCategories = [...Storage.DEFAULT_CATEGORIES];
    settingsActivePaymentModes = [...Storage.DEFAULT_PAYMENT_MODES];
  } else if (typeof targetTripId === 'string' && targetTripId.trim()) {
    // Mode: Edit specific trip by ID
    tripToEdit = Storage.getTripById(targetTripId);
    titleEl.textContent = `Trip: ${tripToEdit ? tripToEdit.name : 'Settings'}`;
    idInput.value = tripToEdit ? tripToEdit.id : '';
    nameInput.value = tripToEdit ? tripToEdit.name : '';
    if (baseCurrencySelect) baseCurrencySelect.value = (tripToEdit && tripToEdit.baseCurrency) ? tripToEdit.baseCurrency : 'INR';
    sheetInput.value = tripToEdit ? tripToEdit.sheetId : '';
    scriptInput.value = tripToEdit ? tripToEdit.scriptUrl : '';
    secretInput.value = tripToEdit ? tripToEdit.secret : '';
    deleteBtn.classList.remove('hidden');
    settingsActiveCategories = tripToEdit ? [...Storage.getTripCategories(tripToEdit.id)] : [...Storage.DEFAULT_CATEGORIES];
    settingsActivePaymentModes = tripToEdit ? [...Storage.getTripPaymentModes(tripToEdit.id)] : [...Storage.DEFAULT_PAYMENT_MODES];
  } else {
    // Mode: Edit current active trip
    tripToEdit = Storage.getActiveTrip();
    if (tripToEdit) {
      titleEl.textContent = `Trip: ${tripToEdit.name}`;
      idInput.value = tripToEdit.id;
      nameInput.value = tripToEdit.name;
      if (baseCurrencySelect) baseCurrencySelect.value = tripToEdit.baseCurrency || 'INR';
      sheetInput.value = tripToEdit.sheetId;
      scriptInput.value = tripToEdit.scriptUrl;
      secretInput.value = tripToEdit.secret;
      deleteBtn.classList.remove('hidden');
      settingsActiveCategories = [...Storage.getTripCategories(tripToEdit.id)];
      settingsActivePaymentModes = [...Storage.getTripPaymentModes(tripToEdit.id)];
    } else {
      titleEl.textContent = 'Configure New Trip';
      idInput.value = '';
      nameInput.value = '';
      if (baseCurrencySelect) baseCurrencySelect.value = 'INR';
      sheetInput.value = '';
      scriptInput.value = '';
      secretInput.value = '';
      deleteBtn.classList.add('hidden');
      settingsActiveCategories = [...Storage.DEFAULT_CATEGORIES];
      settingsActivePaymentModes = [...Storage.DEFAULT_PAYMENT_MODES];
    }
  }

  // --- PERMISSION RESTRICTION: Creator vs Member ---
  const isOwner = tripToEdit ? (tripToEdit.isOwner !== false) : true;
  const creatorOnlyFields = document.getElementById('creator-only-fields');
  const shareCard = document.getElementById('settings-share-card');

  if (isOwner) {
    if (warningEl) warningEl.classList.add('hidden');
    if (roleBadge) {
      roleBadge.textContent = 'Creator';
      roleBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-blue-500/20 text-blue-300';
    }
    if (creatorOnlyFields) creatorOnlyFields.classList.remove('hidden');
    if (shareCard) shareCard.classList.remove('hidden');
    if (categoriesSection) categoriesSection.classList.remove('hidden');
    if (paymentModesSection) paymentModesSection.classList.remove('hidden');

    nameInput.disabled = false;
    sheetInput.disabled = false;
    scriptInput.disabled = false;
    secretInput.disabled = false;
    if (baseCurrencySelect) {
      baseCurrencySelect.disabled = false;
      baseCurrencySelect.classList.remove('opacity-60', 'cursor-not-allowed');
    }
    [nameInput, sheetInput, scriptInput, secretInput].forEach(inp => inp.classList.remove('opacity-60', 'cursor-not-allowed'));
    if (saveBtn) saveBtn.classList.remove('hidden');
    if (deleteBtn) deleteBtn.textContent = 'Delete This Trip from Device';

    renderCategoryPresetsInSettings(true);
    renderPaymentModePresetsInSettings(true);
  } else {
    // Member Mode: Restrict core settings from accidental tampering & hide Sheet ID / Script URL!
    if (warningEl) warningEl.classList.remove('hidden');
    if (roleBadge) {
      roleBadge.textContent = 'Member 🔒';
      roleBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300';
    }
    if (creatorOnlyFields) creatorOnlyFields.classList.add('hidden');
    if (shareCard) shareCard.classList.add('hidden');
    // Categories & payment modes customization is Creator-Only: completely hidden in Member Mode
    if (categoriesSection) categoriesSection.classList.add('hidden');
    if (paymentModesSection) paymentModesSection.classList.add('hidden');

    // Clear inputs to prevent DOM inspection from revealing IDs
    sheetInput.value = '';
    scriptInput.value = '';
    secretInput.value = '';

    nameInput.disabled = true;
    sheetInput.disabled = true;
    scriptInput.disabled = true;
    secretInput.disabled = true;
    if (baseCurrencySelect) {
      baseCurrencySelect.disabled = true;
      baseCurrencySelect.classList.add('opacity-60', 'cursor-not-allowed');
    }
    [nameInput, sheetInput, scriptInput, secretInput].forEach(inp => inp.classList.add('opacity-60', 'cursor-not-allowed'));
    if (saveBtn) saveBtn.classList.add('hidden');
    if (deleteBtn) deleteBtn.textContent = 'Leave / Remove Trip from Device';
  }

  // Render tag manager inside settings
  renderSettingsPaidByList();

  modal.classList.remove('hidden');

  // Smooth scroll to requested section if opened from quick customize button
  if (scrollToSection === 'categories' && categoriesSection) {
    setTimeout(() => {
      categoriesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  } else if (scrollToSection === 'payment' && paymentModesSection) {
    setTimeout(() => {
      paymentModesSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
  }
}

function handleUnlockOwnerMode() {
  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip) return;

  const entered = prompt('Enter your Master Passcode (API_SECRET) to unlock Creator Settings:');
  if (!entered) return;

  const success = Storage.unlockTripOwner(activeTrip.id, entered);
  if (success) {
    showToast('Creator mode unlocked! ✓');
    openSettingsModal(activeTrip.id);
    renderActiveTrip();
  } else {
    showToast('Incorrect passcode. Access denied.', true);
  }
}

function closeSettingsModal() {
  document.getElementById('settings-modal').classList.add('hidden');
}

function handleSaveSettings(e) {
  e.preventDefault();

  const id = document.getElementById('settings-trip-id').value.trim();
  const name = document.getElementById('settings-trip-name').value.trim();
  const baseCurrency = (document.getElementById('settings-base-currency')?.value || 'INR').trim();
  const sheetId = document.getElementById('settings-sheet-id').value.trim();
  const scriptUrl = document.getElementById('settings-script-url').value.trim();
  const secret = document.getElementById('settings-secret').value.trim();

  if (!name) {
    showToast('Please enter a trip name', true);
    return;
  }

  const existing = id ? Storage.getTripById(id) : null;
  const isOwner = existing ? existing.isOwner !== false : true;

  if (!isOwner) {
    showToast('Only the trip creator can modify core trip settings.', true);
    return;
  }

  const tripData = {
    id: id || undefined,
    name: name,
    baseCurrency: baseCurrency,
    categories: settingsActiveCategories,
    paymentModes: settingsActivePaymentModes,
    sheetId: sheetId,
    scriptUrl: scriptUrl,
    secret: secret,
    isOwner: true
  };

  const saved = Storage.saveTrip(tripData);
  closeSettingsModal();
  renderActiveTrip();
  showToast(`Trip "${saved.name}" saved! ✓`);

  // Persist configuration to Google Sheets so all companion/family members sync automatically
  if (saved.scriptUrl && saved.sheetId && saved.secret) {
    SheetsAPI.updateTripConfig(saved, {
      baseCurrency: saved.baseCurrency,
      categories: saved.categories,
      paymentModes: saved.paymentModes
    });
  }
}

function handleDeleteActiveTrip() {
  const idInput = document.getElementById('settings-trip-id').value.trim();
  const tripToDelete = idInput ? Storage.getTripById(idInput) : Storage.getActiveTrip();
  if (!tripToDelete) return;

  const isOwner = tripToDelete.isOwner !== false;
  const promptMsg = isOwner
    ? `Are you sure you want to remove "${tripToDelete.name}" from this device? (Your Google Sheet will NOT be deleted).`
    : `Leave "${tripToDelete.name}" and remove it from your device?`;

  if (confirm(promptMsg)) {
    Storage.deleteTrip(tripToDelete.id);
    closeSettingsModal();
    renderActiveTrip();
    showToast(`Removed "${tripToDelete.name}" from device.`);
  }
}

/**
 * 10. Copy Family Share Link
 * Obscures sensitive parameters (sheet, secret, script) in a URL-safe Base64 token (?join=...)
 */
function handleCopyShareLink() {
  const activeTrip = Storage.getActiveTrip();
  if (!activeTrip || !activeTrip.sheetId || !activeTrip.secret) {
    showToast('Please save your Sheet ID and Passcode first!', true);
    return;
  }

  const origin = window.location.origin;
  const path = window.location.pathname;

  const encodedPayload = Storage.encodeSharePayload(activeTrip);
  if (!encodedPayload) {
    showToast('Failed to generate share link.', true);
    return;
  }

  const shareUrl = `${origin}${path}?join=${encodedPayload}`;

  navigator.clipboard.writeText(shareUrl).then(() => {
    const textEl = document.getElementById('copy-share-btn-text');
    const originalText = textEl.textContent;
    textEl.textContent = '✓ Copied to Clipboard!';
    setTimeout(() => {
      textEl.textContent = originalText;
    }, 2500);
    showToast('Share link copied! Send it via WhatsApp.');
  }).catch(() => {
    prompt('Copy this link:', shareUrl);
  });
}

/**
 * 11. Trip Switcher & Management Modal
 */
function openTripModal() {
  const modal = document.getElementById('trip-modal');
  const container = document.getElementById('saved-trips-list');
  const trips = Storage.getTrips();
  const activeTrip = Storage.getActiveTrip();

  container.innerHTML = '';

  if (trips.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 text-center py-4">No saved trips. Click below to add one!</div>';
  } else {
    trips.forEach(trip => {
      const isActive = activeTrip && activeTrip.id === trip.id;
      const isOwner = trip.isOwner !== false;
      const card = document.createElement('div');
      card.className = `p-3 rounded-xl border flex items-center justify-between transition ${
        isActive ? 'bg-blue-600/20 border-blue-500 text-white' : 'bg-slate-750 border-slate-700 text-slate-300 hover:bg-slate-700'
      }`;

      card.innerHTML = `
        <div class="cursor-pointer flex-1 min-w-0 mr-2 trip-select-area">
          <div class="flex items-center space-x-1.5">
            <span class="text-sm font-bold truncate">${trip.name}</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded bg-slate-700/80 text-slate-300 font-mono font-semibold">${trip.baseCurrency || 'INR'}</span>
            ${isActive ? '<span class="text-xs text-blue-400 font-bold">● Active</span>' : ''}
            ${!isOwner ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-medium">Shared</span>' : ''}
          </div>
          <div class="text-[11px] text-slate-400 truncate mt-0.5">
            ${isOwner ? (trip.sheetId ? `Sheet ID: ${trip.sheetId.substring(0, 12)}...` : 'Sheet not set') : 'Shared via Family Link'}
          </div>
        </div>

        <div class="flex items-center space-x-1 flex-shrink-0">
          <button type="button" class="edit-trip-btn w-8 h-8 rounded-lg bg-slate-700 hover:bg-slate-600 flex items-center justify-center text-slate-300" title="${isOwner ? 'Edit Trip Settings' : 'View Trip Info'}">
            ${isOwner ? '✏️' : 'ℹ️'}
          </button>
          <button type="button" class="del-trip-btn w-8 h-8 rounded-lg bg-slate-700 hover:bg-red-500/20 text-slate-400 hover:text-red-400 flex items-center justify-center text-xs" title="${isOwner ? 'Delete Trip' : 'Leave Trip'}">
            🗑️
          </button>
        </div>
      `;

      // Select / switch trip
      card.querySelector('.trip-select-area').addEventListener('click', () => {
        Storage.setActiveTripId(trip.id);
        closeTripModal();
        renderActiveTrip();
        showToast(`Switched to "${trip.name}"`);
      });

      // Edit / View trip info
      card.querySelector('.edit-trip-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        closeTripModal();
        openSettingsModal(trip.id);
      });

      // Delete trip
      card.querySelector('.del-trip-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const msg = isOwner ? `Remove "${trip.name}" from this device?` : `Leave and remove "${trip.name}" from this device?`;
        if (confirm(msg)) {
          Storage.deleteTrip(trip.id);
          renderActiveTrip();
          openTripModal(); // Refresh modal list
        }
      });

      container.appendChild(card);
    });
  }

  modal.classList.remove('hidden');
}

function closeTripModal() {
  document.getElementById('trip-modal').classList.add('hidden');
}

/**
 * Toast Notification Utility
 */
let toastTimeout = null;
function showToast(message, isError = false) {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  const icon = document.getElementById('toast-icon');

  if (!toast || !text) return;

  clearTimeout(toastTimeout);
  text.textContent = message;
  icon.textContent = isError ? '⚠️' : '✓';
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-2xl border flex items-center space-x-2 transition-all duration-300 opacity-100 translate-y-0 ${
    isError ? 'bg-red-900 border-red-700' : 'bg-slate-800 border-slate-700'
  }`;

  toastTimeout = setTimeout(() => {
    toast.className = 'fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-semibold shadow-2xl border border-slate-700 flex items-center space-x-2 transition-all duration-300 opacity-0 pointer-events-none translate-y-2';
  }, 3000);
}
