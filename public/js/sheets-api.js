/**
 * Sheets API Bridge
 * Communicates with Google Apps Script Web App for reading summaries and logging expenses.
 * Handles CORS simple requests (text/plain) and offline fallback.
 */

const SheetsAPI = {
  /**
   * Fetches live trip summary, category breakdown, and recent transactions
   */
  async fetchTripSummary(trip) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) {
      throw new Error("Trip settings are incomplete. Please configure your Sheet ID, Apps Script URL, and Passcode in Settings.");
    }

    const query = new URLSearchParams({
      action: 'getSummary',
      sheetId: trip.sheetId,
      secret: trip.secret
    });

    const url = `${trip.scriptUrl}?${query.toString()}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
      });

      const data = await response.json();

      // Check for application-level error (Google Apps Script always returns HTTP 200)
      if (data.status === 'error') {
        throw new Error(data.message || "Failed to fetch trip summary from Google Sheets.");
      }

      // Cache successful summary
      if (data.data) {
        Storage.setCachedSummary(trip.id, data.data);
      }

      return data.data;

    } catch (err) {
      // If network error, try to return cached summary if available
      const cached = Storage.getCachedSummary(trip.id);
      if (cached) {
        cached.isCached = true;
        cached.networkError = err.message;
        return cached;
      }
      throw err;
    }
  },

  /**
   * Fetches all transactions for export from Google Apps Script.
   * If Apps Script has been updated, returns allTransactions.
   * If Apps Script is an older deployment, falls back gracefully to recentTransactions.
   * Merges any pending offline queue transactions so export is 100% complete.
   */
  async fetchAllTransactions(trip) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) {
      throw new Error("Trip settings are incomplete. Please configure your Sheet ID, Apps Script URL, and Passcode in Settings.");
    }

    const query = new URLSearchParams({
      action: 'getAllTransactions',
      sheetId: trip.sheetId,
      secret: trip.secret
    });

    const url = `${trip.scriptUrl}?${query.toString()}`;

    let serverData = null;
    let isPartial = false;

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'follow'
      });

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || "Failed to fetch transactions from Google Sheets.");
      }

      serverData = data.data;
      if (serverData && typeof Storage !== 'undefined' && Storage.setCachedSummary) {
        Storage.setCachedSummary(trip.id, serverData);
      }
    } catch (err) {
      // Offline fallback: check cached summary
      const cached = (typeof Storage !== 'undefined' && Storage.getCachedSummary) ? Storage.getCachedSummary(trip.id) : null;
      if (cached) {
        serverData = { ...cached, isCached: true, networkError: err.message };
        isPartial = true;
      } else {
        throw err;
      }
    }

    let transactions = [];
    if (serverData && Array.isArray(serverData.allTransactions)) {
      transactions = [...serverData.allTransactions];
      isPartial = false;
    } else if (serverData && Array.isArray(serverData.recentTransactions)) {
      transactions = [...serverData.recentTransactions];
      isPartial = (serverData.totalCount || 0) > transactions.length;
    }

    // Merge offline queued items for this trip not yet in the sheet
    const offlineQueue = (typeof Storage !== 'undefined' && Storage.getOfflineQueue) ? Storage.getOfflineQueue() : [];
    const pendingItems = offlineQueue
      .filter(item => item && item.tripId === trip.id && item.transaction)
      .map(item => ({
        id: item.transaction.id,
        date: item.transaction.date,
        paidBy: item.transaction.paidBy,
        category: item.transaction.category,
        description: item.transaction.description,
        originalAmount: item.transaction.originalAmount,
        currency: item.transaction.currency,
        exchangeRate: item.transaction.exchangeRate || 1,
        amountINR: item.transaction.amountInINR,
        paymentMode: item.transaction.paymentMode,
        loggedAt: item.transaction.loggedAt || new Date().toISOString(),
        isOfflinePending: true
      }));

    // Deduplicate by ID
    const seenIds = new Set(transactions.map(t => String(t.id || '')));
    pendingItems.forEach(item => {
      if (item.id && !seenIds.has(String(item.id))) {
        transactions.push(item);
        seenIds.add(String(item.id));
      }
    });

    return {
      transactions,
      summaryData: serverData,
      isPartial,
      totalCount: serverData ? (serverData.totalCount || transactions.length) : transactions.length
    };
  },

  /**
   * Sends a new expense entry to Google Sheets via Apps Script POST
   * If network is down, automatically queues the item in localStorage.
   */
  async logExpense(trip, transaction) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) {
      throw new Error("Trip configuration is missing. Please check your settings.");
    }

    const payload = {
      secret: trip.secret,
      sheetId: trip.sheetId,
      transaction: transaction
    };

    try {
      // Use text/plain;charset=utf-8 to prevent CORS preflight OPTIONS requests
      const response = await fetch(trip.scriptUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (data.status === 'error') {
        throw new Error(data.message || "Failed to log expense in Google Sheets.");
      }

      // Cache updated summary returned from server
      if (data.data) {
        Storage.setCachedSummary(trip.id, data.data);
      }

      return {
        success: true,
        offline: false,
        duplicate: !!data.duplicate,
        message: data.message,
        row: data.row,
        data: data.data
      };

    } catch (networkOrScriptError) {
      // If it is a network failure, queue offline
      const isNetworkError = networkOrScriptError.name === 'TypeError' ||
                             networkOrScriptError.message.includes('Failed to fetch') ||
                             !navigator.onLine;

      if (isNetworkError) {
        Storage.enqueueOffline(trip.id, transaction);
        return {
          success: true,
          offline: true,
          message: "You are offline. Expense saved to offline queue and will sync automatically."
        };
      }

      // If it was an actual server error (e.g. invalid secret), propagate it
      throw networkOrScriptError;
    }
  },

  /**
   * Processes all offline queued items sequentially
   */
  async syncOfflineQueue(trip, onProgress) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) {
      return { total: 0, synced: 0, failed: 0 };
    }

    const queue = Storage.getOfflineQueue();
    if (queue.length === 0) {
      return { total: 0, synced: 0, failed: 0 };
    }

    let syncedCount = 0;
    let failedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      if (item.tripId !== trip.id) continue;

      if (onProgress) {
        onProgress(i + 1, queue.length);
      }

      const payload = {
        secret: trip.secret,
        sheetId: trip.sheetId,
        transaction: item.transaction
      };

      try {
        const response = await fetch(trip.scriptUrl, {
          method: 'POST',
          mode: 'cors',
          redirect: 'follow',
          headers: {
            'Content-Type': 'text/plain;charset=utf-8'
          },
          body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (data.status === 'success' || data.duplicate) {
          Storage.dequeueOffline(item.transaction.id);
          syncedCount++;
        } else {
          failedCount++;
          console.error("Offline sync item failed:", data.message);
        }
      } catch (err) {
        failedCount++;
        console.warn("Offline sync interrupted by network:", err);
        break; // Stop loop if still offline
      }
    }

    return {
      total: queue.length,
      synced: syncedCount,
      failed: failedCount,
      remaining: Storage.getOfflineQueue().length
    };
  },

  /**
   * Synchronizes participant tags list to Google Sheets "Participants" sheet tab
   */
  async updateParticipants(trip, tags) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) return;

    const payload = {
      action: 'updateTags',
      secret: trip.secret,
      sheetId: trip.sheetId,
      tags: tags
    };

    try {
      const response = await fetch(trip.scriptUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.warn('Could not sync participants to Google Sheets:', err);
    }
  },

  /**
   * Synchronizes trip configuration (categories, payment modes, base currency) to Google Sheets "Config" tab
   */
  async updateTripConfig(trip, config) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) return;

    const payload = {
      action: 'updateConfig',
      secret: trip.secret,
      sheetId: trip.sheetId,
      config: config
    };

    try {
      const response = await fetch(trip.scriptUrl, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      return data;
    } catch (err) {
      console.warn('Could not sync trip config to Google Sheets:', err);
    }
  },

  /**
   * Deletes an expense row from Google Sheets by transaction ID
   */
  async deleteExpense(trip, transactionId) {
    if (!trip || !trip.scriptUrl || !trip.sheetId || !trip.secret) {
      throw new Error("Trip configuration missing.");
    }

    const payload = {
      action: 'deleteExpense',
      secret: trip.secret,
      sheetId: trip.sheetId,
      transactionId: transactionId
    };

    const response = await fetch(trip.scriptUrl, {
      method: 'POST',
      mode: 'cors',
      redirect: 'follow',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.status === 'error') {
      throw new Error(data.message || "Failed to delete transaction from Google Sheets.");
    }

    if (data.data) {
      Storage.setCachedSummary(trip.id, data.data);
    }

    return data;
  }
};

// Export for module/browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { SheetsAPI };
}

