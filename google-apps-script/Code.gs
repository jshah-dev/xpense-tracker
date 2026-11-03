/**
 * Travel Expense Tracker — Google Apps Script Web App Bridge
 *
 * Provides a secure serverless REST API connecting the mobile PWA
 * directly to your private Google Sheet (one sheet per trip).
 *
 * Features:
 * - Concurrency control with LockService
 * - Passcode authentication (API_SECRET)
 * - Multi-tab support: "Expenses" tab for ledger, "Participants" tab for synced tags
 * - Idempotency protection against duplicate writes
 */

// Helper to authenticate request secret against Script Properties
function isAuthorized(providedSecret) {
  var expectedSecret = PropertiesService.getScriptProperties().getProperty("API_SECRET");
  if (!expectedSecret) {
    return {
      authorized: false,
      error: "API_SECRET is not configured in Script Properties. Please add it under Project Settings."
    };
  }
  if (!providedSecret || typeof providedSecret !== "string") {
    return {
      authorized: false,
      error: "Missing or invalid secret passcode."
    };
  }
  if (expectedSecret.trim() !== providedSecret.trim()) {
    return {
      authorized: false,
      error: "Unauthorized: Invalid Secret Passcode."
    };
  }
  return { authorized: true };
}

// Format JSON response helper
function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// Resolves the expense ledger sheet tab (avoids 'Participants' tab)
function getExpenseSheet(spreadsheet, requestedSheetName) {
  if (requestedSheetName) {
    var named = spreadsheet.getSheetByName(requestedSheetName);
    if (named) return named;
  }
  var expenseSheet = spreadsheet.getSheetByName("Expenses");
  if (expenseSheet) return expenseSheet;

  var allSheets = spreadsheet.getSheets();
  for (var i = 0; i < allSheets.length; i++) {
    var sName = allSheets[i].getName();
    if (sName !== "Participants" && sName !== "Config") {
      return allSheets[i];
    }
  }
  return spreadsheet.insertSheet("Expenses", 0);
}

// Resolves or creates the Participants sheet tab
function getParticipantsSheet(spreadsheet) {
  var partSheet = spreadsheet.getSheetByName("Participants");
  if (!partSheet) {
    partSheet = spreadsheet.insertSheet("Participants");
    partSheet.appendRow(["Participant Name"]);
    partSheet.appendRow(["Self"]);
  }
  return partSheet;
}

// Reads all participant tags from Participants sheet
function getParticipantsList(spreadsheet) {
  var partSheet = getParticipantsSheet(spreadsheet);
  var data = partSheet.getDataRange().getValues();
  var tags = [];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || "").trim();
    if (name && tags.indexOf(name) === -1) {
      tags.push(name);
    }
  }
  if (tags.length === 0) {
    tags = ["Self"];
    partSheet.appendRow(["Self"]);
  }
  return tags;
}

// Resolves or creates the Config sheet tab for categories, payment modes, and base currency
function getConfigSheet(spreadsheet) {
  var configSheet = spreadsheet.getSheetByName("Config");
  if (!configSheet) {
    configSheet = spreadsheet.insertSheet("Config");
    configSheet.appendRow(["Setting Key", "Setting Value", "Updated At"]);
  }
  return configSheet;
}

// Reads trip configuration from Config sheet
function getTripConfig(spreadsheet) {
  var configSheet = spreadsheet.getSheetByName("Config");
  var config = {
    baseCurrency: "INR",
    categories: [],
    paymentModes: []
  };
  if (!configSheet) {
    return config;
  }

  var data = configSheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || "").trim();
    var val = String(data[i][1] || "").trim();
    if (key === "baseCurrency" && val) {
      config.baseCurrency = val;
    } else if (key === "categories" && val) {
      try {
        config.categories = JSON.parse(val);
      } catch (e) {
        config.categories = val.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      }
    } else if (key === "paymentModes" && val) {
      try {
        config.paymentModes = JSON.parse(val);
      } catch (e) {
        config.paymentModes = val.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      }
    }
  }
  return config;
}

// Updates trip configuration in Config sheet
function setTripConfig(spreadsheet, newConfig) {
  var configSheet = getConfigSheet(spreadsheet);
  var currentConfig = getTripConfig(spreadsheet);

  if (newConfig.baseCurrency) currentConfig.baseCurrency = String(newConfig.baseCurrency).trim().toUpperCase();
  if (Array.isArray(newConfig.categories) && newConfig.categories.length > 0) currentConfig.categories = newConfig.categories;
  if (Array.isArray(newConfig.paymentModes) && newConfig.paymentModes.length > 0) currentConfig.paymentModes = newConfig.paymentModes;

  configSheet.clear();
  configSheet.appendRow(["Setting Key", "Setting Value", "Updated At"]);
  var now = new Date().toISOString();
  configSheet.appendRow(["baseCurrency", currentConfig.baseCurrency || "INR", now]);
  configSheet.appendRow(["categories", JSON.stringify(currentConfig.categories || []), now]);
  configSheet.appendRow(["paymentModes", JSON.stringify(currentConfig.paymentModes || []), now]);

  return currentConfig;
}

/**
 * GET Handler: Fetches live trip summary, category breakdown, recent ledger entries, and synced participant tags.
 */
function doGet(e) {
  try {
    var params = (e && e.parameter) ? e.parameter : {};

    // Health check / ping test
    if (params.action === "ping") {
      return jsonResponse({
        status: "success",
        message: "Travel Expense Tracker API is running."
      });
    }

    // Verify passcode
    var auth = isAuthorized(params.secret);
    if (!auth.authorized) {
      return jsonResponse({ status: "error", message: auth.error });
    }

    if (!params.sheetId) {
      return jsonResponse({ status: "error", message: "Missing sheetId parameter." });
    }

    var spreadsheet = SpreadsheetApp.openById(params.sheetId);
    var sheet = getExpenseSheet(spreadsheet, params.sheetName);
    var participants = getParticipantsList(spreadsheet);
    var config = getTripConfig(spreadsheet);

    var data = sheet.getDataRange().getValues();

    // If sheet has only header row or is blank
    if (data.length <= 1) {
      return jsonResponse({
        status: "success",
        data: {
          tripName: spreadsheet.getName(),
          totalSpendINR: 0,
          totalCount: 0,
          categoryBreakdown: {},
          paidByBreakdown: {},
          recentTransactions: [],
          participants: participants,
          config: config
        }
      });
    }

    var totalSpendINR = 0;
    var categoryBreakdown = {};
    var paidByBreakdown = {};
    var allTransactions = [];

    // Row 0 is headers; iterate from row 1 to the end
    for (var i = 1; i < data.length; i++) {
      var row = data[i];
      var txnId = String(row[0] || "");
      if (!txnId && !row[8]) continue; // Skip blank empty rows

      var rawDate = row[1];
      var formattedDate = "";
      if (rawDate instanceof Date) {
        formattedDate = Utilities.formatDate(rawDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      } else if (rawDate) {
        formattedDate = String(rawDate).substring(0, 10);
      }

      var paidBy = String(row[2] || "Self").trim();
      var category = String(row[3] || "General").trim();
      var description = String(row[4] || "").trim();
      var originalAmount = Number(row[5]) || 0;
      var currency = String(row[6] || "INR").trim();
      var exchangeRate = Number(row[7]) || 1;
      var amountINR = Number(row[8]) || 0;
      var paymentMode = String(row[9] || "Cash").trim();
      var loggedAt = String(row[10] || "");

      totalSpendINR += amountINR;
      categoryBreakdown[category] = (categoryBreakdown[category] || 0) + amountINR;
      paidByBreakdown[paidBy] = (paidByBreakdown[paidBy] || 0) + amountINR;

      allTransactions.push({
        id: txnId,
        date: formattedDate,
        paidBy: paidBy,
        category: category,
        description: description,
        originalAmount: originalAmount,
        currency: currency,
        exchangeRate: exchangeRate,
        amountINR: amountINR,
        paymentMode: paymentMode,
        loggedAt: loggedAt
      });
    }

    // Sort recent in reverse chronological order and take latest 15
    allTransactions.reverse();
    var latestTransactions = allTransactions.slice(0, 15);

    return jsonResponse({
      status: "success",
      data: {
        tripName: spreadsheet.getName(),
        totalSpendINR: Math.round(totalSpendINR * 100) / 100,
        totalCount: allTransactions.length,
        categoryBreakdown: categoryBreakdown,
        paidByBreakdown: paidByBreakdown,
        recentTransactions: latestTransactions,
        participants: participants,
        config: config
      }
    });

  } catch (err) {
    return jsonResponse({
      status: "error",
      message: err.toString()
    });
  }
}

/**
 * POST Handler: Appends expense rows or updates synced participants.
 * Includes concurrency control (LockService) and write idempotency.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonResponse({ status: "error", message: "Server busy, could not obtain lock. Please try again." });
  }

  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ status: "error", message: "Empty request payload." });
    }

    var payload = JSON.parse(e.postData.contents);

    // Verify passcode
    var auth = isAuthorized(payload.secret);
    if (!auth.authorized) {
      return jsonResponse({ status: "error", message: auth.error });
    }

    if (!payload.sheetId) {
      return jsonResponse({ status: "error", message: "Missing sheetId in payload." });
    }

    var spreadsheet = SpreadsheetApp.openById(payload.sheetId);

    // Action 1: Update Synced Participant Tags
    if (payload.action === "updateTags") {
      var partSheet = getParticipantsSheet(spreadsheet);
      var rawTags = Array.isArray(payload.tags) ? payload.tags : ["Self"];
      var uniqueTags = [];
      for (var t = 0; t < rawTags.length; t++) {
        var cleanTag = String(rawTags[t] || "").trim();
        if (cleanTag && uniqueTags.indexOf(cleanTag) === -1) {
          uniqueTags.push(cleanTag);
        }
      }
      if (uniqueTags.length === 0) uniqueTags = ["Self"];

      partSheet.clear();
      partSheet.appendRow(["Participant Name"]);
      for (var u = 0; u < uniqueTags.length; u++) {
        partSheet.appendRow([uniqueTags[u]]);
      }

      return jsonResponse({
        status: "success",
        message: "Participants updated successfully in Google Sheets",
        participants: uniqueTags
      });
    }

    // Action 2: Update Synced Trip Configuration (Categories, Payment Modes, Base Currency)
    if (payload.action === "updateConfig") {
      var savedConfig = setTripConfig(spreadsheet, payload.config || {});
      return jsonResponse({
        status: "success",
        message: "Trip configuration updated successfully in Google Sheets",
        config: savedConfig
      });
    }

    // Action 3: Delete Expense Transaction
    if (payload.action === "deleteExpense") {
      var txnIdToDelete = String(payload.transactionId || "").trim();
      if (!txnIdToDelete) {
        return jsonResponse({ status: "error", message: "Missing transactionId parameter." });
      }

      var sheet = getExpenseSheet(spreadsheet, payload.sheetName);
      var lastRow = sheet.getLastRow();
      if (lastRow <= 1) {
        return jsonResponse({ status: "error", message: "No transactions found in sheet." });
      }

      var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      var foundRow = -1;
      for (var d = 0; d < ids.length; d++) {
        if (String(ids[d][0]).trim() === txnIdToDelete) {
          foundRow = d + 2; // 1-indexed, skipping header row 1
          break;
        }
      }

      if (foundRow === -1) {
        return jsonResponse({ status: "error", message: "Transaction ID not found in sheet." });
      }

      sheet.deleteRow(foundRow);

      return jsonResponse({
        status: "success",
        message: "Expense deleted successfully from Google Sheet."
      });
    }

    // Action 3: Log Expense Transaction
    var sheet = getExpenseSheet(spreadsheet, payload.sheetName);
    var txn = payload.transaction;
    if (!txn || !txn.id) {
      return jsonResponse({ status: "error", message: "Missing transaction details or transaction ID." });
    }

    var lastRow = sheet.getLastRow();

    // Auto-create headers if sheet is brand new
    if (lastRow === 0) {
      sheet.appendRow([
        "Transaction ID", "Date", "Paid By", "Category", "Description",
        "Original Amount", "Currency", "Exchange Rate", "Amount (INR)",
        "Payment Mode", "Logged At"
      ]);
      lastRow = 1;
    }

    // Idempotency Protection: Check if txn.id already exists in the last 50 rows
    if (lastRow > 1) {
      var checkStartRow = Math.max(2, lastRow - 50);
      var numRowsToCheck = lastRow - checkStartRow + 1;
      var existingIds = sheet.getRange(checkStartRow, 1, numRowsToCheck, 1).getValues();

      for (var k = 0; k < existingIds.length; k++) {
        if (String(existingIds[k][0]).trim() === String(txn.id).trim()) {
          return jsonResponse({
            status: "success",
            message: "Expense already logged (idempotent duplicate skipped)",
            row: checkStartRow + k,
            duplicate: true
          });
        }
      }
    }

    var paidByClean = String(txn.paidBy || "Self").trim();

    // Append new expense row
    sheet.appendRow([
      String(txn.id).trim(),
      txn.date || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd"),
      paidByClean,
      String(txn.category || "General").trim(),
      String(txn.description || "").trim(),
      Number(txn.originalAmount) || 0,
      String(txn.currency || "INR").trim().toUpperCase(),
      Number(txn.exchangeRate) || 1,
      Number(txn.amountInINR) || 0,
      String(txn.paymentMode || "Cash").trim(),
      txn.loggedAt || new Date().toISOString()
    ]);

    // Ensure paidBy tag is in Participants sheet
    var existingParticipants = getParticipantsList(spreadsheet);
    if (existingParticipants.indexOf(paidByClean) === -1) {
      var pSheet = getParticipantsSheet(spreadsheet);
      pSheet.appendRow([paidByClean]);
    }

    return jsonResponse({
      status: "success",
      message: "Expense logged successfully",
      row: sheet.getLastRow(),
      duplicate: false
    });

  } catch (err) {
    return jsonResponse({
      status: "error",
      message: err.toString()
    });
  } finally {
    lock.releaseLock();
  }
}

// Helper to easily authorize from Apps Script editor
function authorizeScript() {
  SpreadsheetApp.getActiveSpreadsheet();
}
