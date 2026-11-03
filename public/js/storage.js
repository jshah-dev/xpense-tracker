/**
 * Storage Abstraction & Local State Manager
 * Handles trips, active selection, offline queue, and cached summaries in browser localStorage.
 */

const StorageKeys = {
  TRIPS: 'travel_trips',
  ACTIVE_TRIP_ID: 'travel_active_trip_id',
  OFFLINE_QUEUE: 'travel_offline_queue',
  EXCHANGE_RATES: 'travel_exchange_rates',
  PAID_BY_OPTIONS: 'travel_paid_by_options',
  SUMMARY_CACHE_PREFIX: 'travel_summary_',
  PAID_BY_TRIP_PREFIX: 'travel_paid_by_',
  CATEGORIES_TRIP_PREFIX: 'travel_categories_',
  PAYMENT_MODES_TRIP_PREFIX: 'travel_payment_modes_',
  THEME: 'travel_theme'
};

// By default, only 'Self' tag
const DEFAULT_PAID_BY = ['Self'];

// Default Categories for a trip (7 core presets)
const DEFAULT_CATEGORIES = [
  'Food & Dining',
  'Travel Tickets',
  'Fuel & Tolls',
  'Stay & Hotel',
  'Tickets & Activities',
  'Shopping',
  'General / Other'
];

// Default Payment Modes for a trip (5 core presets)
const DEFAULT_PAYMENT_MODES = [
  'Cash',
  'UPI / GPay',
  'Credit Card',
  'Debit Card',
  'Forex Card'
];

const Storage = {
  /**
   * Helper to safely parse JSON from localStorage
   */
  _getJSON(key, defaultValue) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : defaultValue;
    } catch (e) {
      console.warn(`Error reading ${key} from localStorage:`, e);
      return defaultValue;
    }
  },

  /**
   * Helper to safely write JSON to localStorage
   */
  _setJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Error saving ${key} to localStorage:`, e);
    }
  },

  /**
   * Extract Sheet ID from a full Google Sheets URL or raw ID
   */
  extractSheetId(input) {
    if (!input || typeof input !== 'string') return '';
    const trimmed = input.trim();
    const urlPattern = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;
    const match = trimmed.match(urlPattern);
    return match ? match[1] : trimmed;
  },

  // --- Trips Management ---

  getTrips() {
    return this._getJSON(StorageKeys.TRIPS, []);
  },

  getTripById(tripId) {
    if (!tripId) return null;
    const trips = this.getTrips();
    return trips.find(t => t.id === tripId) || null;
  },

  getActiveTrip() {
    const trips = this.getTrips();
    const activeId = localStorage.getItem(StorageKeys.ACTIVE_TRIP_ID);
    if (activeId) {
      const found = trips.find(t => t.id === activeId);
      if (found) return found;
    }
    return trips.length > 0 ? trips[0] : null;
  },

  setActiveTripId(tripId) {
    if (tripId) {
      localStorage.setItem(StorageKeys.ACTIVE_TRIP_ID, tripId);
    } else {
      localStorage.removeItem(StorageKeys.ACTIVE_TRIP_ID);
    }
  },

  saveTrip(tripData) {
    const trips = this.getTrips();
    const cleanSheetId = this.extractSheetId(tripData.sheetId);
    const id = (tripData.id && String(tripData.id).trim()) ? String(tripData.id).trim() : `trip_${Date.now()}`;

    const existingTrip = trips.find(t => t.id === id);

    // Determine ownership (Creator = true, Shared Link = false unless unlocked)
    let isOwner = true;
    if (tripData.isOwner !== undefined) {
      isOwner = !!tripData.isOwner;
    } else if (existingTrip && existingTrip.isOwner !== undefined) {
      isOwner = !!existingTrip.isOwner;
    }

    // Base currency (defaults to INR if not specified)
    const baseCurrency = (tripData.baseCurrency || (existingTrip && existingTrip.baseCurrency) || 'INR').trim().toUpperCase();

    // Active categories
    let categories = DEFAULT_CATEGORIES;
    if (Array.isArray(tripData.categories) && tripData.categories.length > 0) {
      categories = [...new Set(tripData.categories.map(c => String(c).trim()).filter(Boolean))];
    } else if (existingTrip && Array.isArray(existingTrip.categories) && existingTrip.categories.length > 0) {
      categories = existingTrip.categories;
    }

    // Active payment modes
    let paymentModes = DEFAULT_PAYMENT_MODES;
    if (Array.isArray(tripData.paymentModes) && tripData.paymentModes.length > 0) {
      paymentModes = [...new Set(tripData.paymentModes.map(m => String(m).trim()).filter(Boolean))];
    } else if (existingTrip && Array.isArray(existingTrip.paymentModes) && existingTrip.paymentModes.length > 0) {
      paymentModes = existingTrip.paymentModes;
    }

    const updatedTrip = {
      id: id,
      name: (tripData.name || 'My Vacation').trim(),
      sheetId: cleanSheetId,
      scriptUrl: (tripData.scriptUrl || '').trim(),
      secret: (tripData.secret || '').trim(),
      baseCurrency: baseCurrency,
      categories: categories,
      paymentModes: paymentModes,
      isOwner: isOwner,
      updatedAt: new Date().toISOString()
    };

    const existingIndex = trips.findIndex(t => t.id === id);
    if (existingIndex >= 0) {
      trips[existingIndex] = updatedTrip;
    } else {
      trips.push(updatedTrip);
    }

    this._setJSON(StorageKeys.TRIPS, trips);
    this.setActiveTripId(id);
    return updatedTrip;
  },

  deleteTrip(tripId) {
    let trips = this.getTrips();
    trips = trips.filter(t => t.id !== tripId);
    this._setJSON(StorageKeys.TRIPS, trips);

    const activeId = localStorage.getItem(StorageKeys.ACTIVE_TRIP_ID);
    if (activeId === tripId) {
      this.setActiveTripId(trips.length > 0 ? trips[0].id : null);
    }
  },

  unlockTripOwner(tripId, enteredSecret) {
    const trip = this.getTripById(tripId);
    if (!trip || !trip.secret) return false;
    if (enteredSecret.trim() === trip.secret.trim()) {
      trip.isOwner = true;
      this.saveTrip(trip);
      return true;
    }
    return false;
  },

  // --- Cached Summary for Instant Offline UI ---

  getCachedSummary(tripId) {
    if (!tripId) return null;
    return this._getJSON(`${StorageKeys.SUMMARY_CACHE_PREFIX}${tripId}`, null);
  },

  setCachedSummary(tripId, data) {
    if (!tripId || !data) return;
    this._setJSON(`${StorageKeys.SUMMARY_CACHE_PREFIX}${tripId}`, {
      ...data,
      cachedAt: new Date().toISOString()
    });
  },

  // --- Exchange Rates Memory ---

  getCachedRate(currencyCode, defaultRate = 1.0) {
    if (!currencyCode || currencyCode === 'INR') return 1.0;
    const rates = this._getJSON(StorageKeys.EXCHANGE_RATES, {});
    return rates[currencyCode.toUpperCase()] || defaultRate;
  },

  setCachedRate(currencyCode, rate) {
    if (!currencyCode || currencyCode === 'INR') return;
    const rates = this._getJSON(StorageKeys.EXCHANGE_RATES, {});
    rates[currencyCode.toUpperCase()] = Number(rate) || 1.0;
    this._setJSON(StorageKeys.EXCHANGE_RATES, rates);
  },

  // --- Per-Trip Paid By Options ---

  getPaidByOptions(tripId = null) {
    if (tripId) {
      const tripSaved = this._getJSON(`${StorageKeys.PAID_BY_TRIP_PREFIX}${tripId}`, null);
      if (tripSaved && Array.isArray(tripSaved) && tripSaved.length > 0) {
        return tripSaved;
      }
    }

    const saved = this._getJSON(StorageKeys.PAID_BY_OPTIONS, null);
    if (!saved) {
      return DEFAULT_PAID_BY;
    }

    const oldDefaults = ['Self', 'Spouse', 'Cash', 'Family', 'Friend'];
    if (Array.isArray(saved) && saved.length === 5 && saved.every((val, i) => val === oldDefaults[i])) {
      this._setJSON(StorageKeys.PAID_BY_OPTIONS, ['Self']);
      return ['Self'];
    }

    return (Array.isArray(saved) && saved.length > 0) ? saved : ['Self'];
  },

  setPaidByOptions(tripId, tags) {
    if (!Array.isArray(tags) || tags.length === 0) return;
    const cleanTags = tags.map(t => String(t).trim()).filter(Boolean);
    const uniqueTags = [...new Set(cleanTags)];
    if (uniqueTags.length === 0) uniqueTags.push('Self');

    if (tripId) {
      this._setJSON(`${StorageKeys.PAID_BY_TRIP_PREFIX}${tripId}`, uniqueTags);
    }
    this._setJSON(StorageKeys.PAID_BY_OPTIONS, uniqueTags);
    return uniqueTags;
  },

  addPaidByOption(tripId, name) {
    if (!name || typeof name !== 'string') return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const list = this.getPaidByOptions(tripId);
    if (!list.includes(trimmed)) {
      list.push(trimmed);
      this.setPaidByOptions(tripId, list);
    }
    return list;
  },

  removePaidByOption(tripId, name) {
    if (!name) return;
    let list = this.getPaidByOptions(tripId);
    list = list.filter(item => item !== name);
    if (list.length === 0) {
      list = ['Self'];
    }
    this.setPaidByOptions(tripId, list);
    return list;
  },

  // --- Per-Trip Categories Management ---

  getTripCategories(tripId = null) {
    if (tripId) {
      const trip = this.getTripById(tripId);
      if (trip && Array.isArray(trip.categories) && trip.categories.length > 0) {
        return trip.categories;
      }
      const tripSaved = this._getJSON(`${StorageKeys.CATEGORIES_TRIP_PREFIX}${tripId}`, null);
      if (tripSaved && Array.isArray(tripSaved) && tripSaved.length > 0) {
        return tripSaved;
      }
    }
    return DEFAULT_CATEGORIES;
  },

  setTripCategories(tripId, categories) {
    if (!Array.isArray(categories) || categories.length === 0) return DEFAULT_CATEGORIES;
    const clean = [...new Set(categories.map(c => String(c).trim()).filter(Boolean))];
    const finalCategories = clean.length > 0 ? clean : DEFAULT_CATEGORIES;

    if (tripId) {
      this._setJSON(`${StorageKeys.CATEGORIES_TRIP_PREFIX}${tripId}`, finalCategories);
      const trip = this.getTripById(tripId);
      if (trip) {
        trip.categories = finalCategories;
        const trips = this.getTrips();
        const idx = trips.findIndex(t => t.id === tripId);
        if (idx >= 0) {
          trips[idx].categories = finalCategories;
          this._setJSON(StorageKeys.TRIPS, trips);
        }
      }
    }
    return finalCategories;
  },

  // --- Per-Trip Payment Modes Management ---

  getTripPaymentModes(tripId = null) {
    if (tripId) {
      const trip = this.getTripById(tripId);
      if (trip && Array.isArray(trip.paymentModes) && trip.paymentModes.length > 0) {
        return trip.paymentModes;
      }
      const tripSaved = this._getJSON(`${StorageKeys.PAYMENT_MODES_TRIP_PREFIX}${tripId}`, null);
      if (tripSaved && Array.isArray(tripSaved) && tripSaved.length > 0) {
        return tripSaved;
      }
    }
    return DEFAULT_PAYMENT_MODES;
  },

  setTripPaymentModes(tripId, paymentModes) {
    if (!Array.isArray(paymentModes) || paymentModes.length === 0) return DEFAULT_PAYMENT_MODES;
    const clean = [...new Set(paymentModes.map(m => String(m).trim()).filter(Boolean))];
    const finalModes = clean.length > 0 ? clean : DEFAULT_PAYMENT_MODES;

    if (tripId) {
      this._setJSON(`${StorageKeys.PAYMENT_MODES_TRIP_PREFIX}${tripId}`, finalModes);
      const trip = this.getTripById(tripId);
      if (trip) {
        trip.paymentModes = finalModes;
        const trips = this.getTrips();
        const idx = trips.findIndex(t => t.id === tripId);
        if (idx >= 0) {
          trips[idx].paymentModes = finalModes;
          this._setJSON(StorageKeys.TRIPS, trips);
        }
      }
    }
    return finalModes;
  },

  // --- Offline Queue ---

  getOfflineQueue() {
    return this._getJSON(StorageKeys.OFFLINE_QUEUE, []);
  },

  enqueueOffline(tripId, transaction) {
    const queue = this.getOfflineQueue();
    const exists = queue.some(item => item.transaction.id === transaction.id);
    if (!exists) {
      queue.push({
        tripId: tripId,
        transaction: transaction,
        queuedAt: new Date().toISOString()
      });
      this._setJSON(StorageKeys.OFFLINE_QUEUE, queue);
    }
  },

  dequeueOffline(txnId) {
    let queue = this.getOfflineQueue();
    queue = queue.filter(item => item.transaction.id !== txnId);
    this._setJSON(StorageKeys.OFFLINE_QUEUE, queue);
  },

  clearOfflineQueue() {
    this._setJSON(StorageKeys.OFFLINE_QUEUE, []);
  },

  // --- Family Share Link Obfuscation (URL-safe Base64) ---

  /**
   * Encodes trip parameters into an obscured, URL-safe Base64 token for Family Sharing
   */
  encodeSharePayload(trip) {
    if (!trip || !trip.sheetId || !trip.secret) return '';
    const payload = {
      s: this.extractSheetId(trip.sheetId),
      t: (trip.name || 'Shared Vacation').trim(),
      k: (trip.secret || '').trim(),
      c: (trip.baseCurrency || 'INR').trim().toUpperCase(),
      cat: Array.isArray(trip.categories) ? trip.categories : DEFAULT_CATEGORIES,
      m: Array.isArray(trip.paymentModes) ? trip.paymentModes : DEFAULT_PAYMENT_MODES
    };
    if (trip.scriptUrl) {
      payload.u = trip.scriptUrl.trim();
    }

    const jsonStr = JSON.stringify(payload);
    const utf8Bytes = new TextEncoder().encode(jsonStr);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }

    return btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  },

  /**
   * Decodes an obscured URL-safe Base64 share payload into trip parameters
   */
  decodeSharePayload(encodedStr) {
    if (!encodedStr || typeof encodedStr !== 'string') return null;
    try {
      let base64 = encodedStr.trim().replace(/-/g, '+').replace(/_/g, '/');
      while (base64.length % 4) {
        base64 += '=';
      }

      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }

      const jsonStr = new TextDecoder().decode(bytes);
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') return null;

      // Support compact keys (s, t, k, u, c, cat, m) and verbose keys
      const sheetId = data.s || data.sheet || data.sheetId;
      if (!sheetId) return null;

      const baseCurrency = (data.c || data.baseCurrency || 'INR').trim().toUpperCase();
      const categories = Array.isArray(data.cat) ? data.cat : (Array.isArray(data.categories) ? data.categories : DEFAULT_CATEGORIES);
      const paymentModes = Array.isArray(data.m) ? data.m : (Array.isArray(data.paymentModes) ? data.paymentModes : DEFAULT_PAYMENT_MODES);

      return {
        sheetId: this.extractSheetId(sheetId),
        name: data.t || data.trip || data.name || 'Shared Vacation',
        secret: data.k || data.key || data.secret || '',
        scriptUrl: data.u || data.script || data.scriptUrl || '',
        baseCurrency: baseCurrency,
        categories: categories,
        paymentModes: paymentModes
      };
    } catch (err) {
      console.debug('Failed to decode share payload:', err.message || err);
      return null;
    }
  },

  /**
   * Get preferred UI theme ('dark' | 'light'). Defaults to 'dark'.
   */
  getTheme() {
    try {
      return localStorage.getItem(StorageKeys.THEME) || 'dark';
    } catch (e) {
      return 'dark';
    }
  },

  /**
   * Save UI theme preference ('dark' | 'light').
   */
  setTheme(theme) {
    try {
      localStorage.setItem(StorageKeys.THEME, theme === 'light' ? 'light' : 'dark');
    } catch (e) {
      console.warn('Failed to persist theme:', e);
    }
  }
};

// Export for module/browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    Storage,
    StorageKeys,
    DEFAULT_PAID_BY,
    DEFAULT_CATEGORIES,
    DEFAULT_PAYMENT_MODES
  };
}
