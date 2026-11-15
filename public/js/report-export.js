/**
 * Travel Expense Tracker — PDF Report Generator & Export Engine
 * Generates lightweight, crisp vector PDFs with multi-basis charts and detailed ledger tables.
 * 100% Client-side execution, fully compatible with Firebase Hosting & Service Worker offline mode.
 */

const ReportExport = (function() {
  let activeTrip = null;
  let rawTransactions = [];
  let isPartialLedger = false;
  let totalServerCount = 0;
  let currentFilteredTransactions = [];

  // Theme colors matching app palette
  const BRAND_DARK = '#0f172a';      // slate-900
  const BRAND_HEADER = '#1e293b';    // slate-800
  const BRAND_PRIMARY = '#2563eb';   // blue-600
  const BRAND_TEXT = '#334155';      // slate-700
  const BRAND_MUTED = '#64748b';     // slate-500
  const BRAND_LIGHT_BG = '#f8fafc';  // slate-50

  /**
   * Initializes event listeners for the export modal and controls
   */
  function init() {
    const exportBtn = document.getElementById('export-report-btn');
    const closeBtn = document.getElementById('close-export-modal-btn');
    const modal = document.getElementById('export-modal');
    const downloadBtn = document.getElementById('download-pdf-btn');
    const printBtn = document.getElementById('print-report-btn');
    const dateFilter = document.getElementById('export-date-filter');
    const sortBy = document.getElementById('export-sort-by');
    const startDateInput = document.getElementById('export-start-date');
    const endDateInput = document.getElementById('export-end-date');

    const catToggle = document.getElementById('export-include-category');
    const payToggle = document.getElementById('export-include-payment');
    const userToggle = document.getElementById('export-include-paidby');
    const txnsToggle = document.getElementById('export-include-txns');

    if (exportBtn) {
      exportBtn.addEventListener('click', () => openModal());
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => closeModal());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
      });
    }

    if (dateFilter) {
      dateFilter.addEventListener('change', () => {
        const customDiv = document.getElementById('export-custom-dates');
        if (customDiv) {
          if (dateFilter.value === 'custom') {
            customDiv.classList.remove('hidden');
          } else {
            customDiv.classList.add('hidden');
          }
        }
        applyFiltersAndRenderPreview();
      });
    }

    [sortBy, startDateInput, endDateInput, catToggle, payToggle, userToggle, txnsToggle].forEach(el => {
      if (el) {
        el.addEventListener('change', () => applyFiltersAndRenderPreview());
      }
    });

    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => generateAndDownloadPDF());
    }

    if (printBtn) {
      printBtn.addEventListener('click', () => triggerPrint());
    }
  }

  /**
   * Opens the Export Modal and loads trip transactions
   */
  async function openModal() {
    const modal = document.getElementById('export-modal');
    if (!modal) return;

    activeTrip = (typeof Storage !== 'undefined' && Storage.getActiveTrip) ? Storage.getActiveTrip() : null;
    if (!activeTrip) {
      if (typeof showToast === 'function') showToast('Please select or configure a trip first.', '⚠️');
      return;
    }

    const titleBadge = document.getElementById('export-trip-name-badge');
    if (titleBadge) {
      titleBadge.textContent = activeTrip.name || 'Trip Report';
    }

    const currencyBadge = document.getElementById('export-metric-currency');
    if (currencyBadge) {
      const curCode = activeTrip.baseCurrency || 'INR';
      currencyBadge.textContent = `${curCode} (${(typeof getCurrency === 'function' ? getCurrency(curCode).symbol : '₹')})`;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.classList.add('overflow-hidden');

    // Show loading state in preview
    const previewContainer = document.getElementById('export-preview-sections');
    if (previewContainer) {
      previewContainer.innerHTML = `
        <div class="py-6 text-center text-slate-400 space-y-2">
          <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <span class="text-xs">Loading trip ledger from Google Sheets...</span>
        </div>
      `;
    }

    try {
      let result = null;
      if (typeof SheetsAPI !== 'undefined' && SheetsAPI.fetchAllTransactions) {
        result = await SheetsAPI.fetchAllTransactions(activeTrip);
      } else {
        // Fallback to cached summary
        const cached = Storage.getCachedSummary(activeTrip.id) || {};
        result = {
          transactions: cached.recentTransactions || [],
          summaryData: cached,
          isPartial: true,
          totalCount: cached.totalCount || 0
        };
      }

      rawTransactions = (result && result.transactions) ? result.transactions : [];
      isPartialLedger = !!(result && result.isPartial);
      totalServerCount = result ? (result.totalCount || rawTransactions.length) : rawTransactions.length;

      // Handle notice banner
      const noticeDiv = document.getElementById('export-script-notice');
      const ledgerBadge = document.getElementById('export-ledger-badge');

      if (isPartialLedger && totalServerCount > rawTransactions.length) {
        if (noticeDiv) noticeDiv.classList.remove('hidden');
        if (ledgerBadge) {
          ledgerBadge.textContent = `Partial (${rawTransactions.length} of ${totalServerCount} txns)`;
          ledgerBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-300';
        }
      } else {
        if (noticeDiv) noticeDiv.classList.add('hidden');
        if (ledgerBadge) {
          ledgerBadge.textContent = `Full Ledger (${rawTransactions.length} txns)`;
          ledgerBadge.className = 'text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-300';
        }
      }

      applyFiltersAndRenderPreview();

    } catch (err) {
      console.error('Error fetching transactions for export:', err);
      // Attempt local fallback
      const cached = (typeof Storage !== 'undefined' && Storage.getCachedSummary) ? Storage.getCachedSummary(activeTrip.id) : null;
      rawTransactions = (cached && cached.recentTransactions) ? cached.recentTransactions : [];
      isPartialLedger = true;
      totalServerCount = rawTransactions.length;

      const noticeDiv = document.getElementById('export-script-notice');
      if (noticeDiv) noticeDiv.classList.remove('hidden');

      applyFiltersAndRenderPreview();
    }
  }

  /**
   * Closes the export modal
   */
  function closeModal() {
    const modal = document.getElementById('export-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.classList.remove('overflow-hidden');
  }

  /**
   * Filters and sorts transactions according to modal controls
   */
  function getFilteredAndSortedTransactions() {
    const dateFilter = document.getElementById('export-date-filter');
    const sortBy = document.getElementById('export-sort-by');
    const startDateInput = document.getElementById('export-start-date');
    const endDateInput = document.getElementById('export-end-date');

    const filterVal = dateFilter ? dateFilter.value : 'all';
    const sortVal = sortBy ? sortBy.value : 'date-asc'; // Default: oldest first (chronological)

    let list = [...rawTransactions];

    // Date filtering
    const now = new Date();
    if (filterVal === 'last7') {
      const cut = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter(t => new Date(t.date || 0) >= cut);
    } else if (filterVal === 'last30') {
      const cut = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      list = list.filter(t => new Date(t.date || 0) >= cut);
    } else if (filterVal === 'custom') {
      const start = startDateInput && startDateInput.value ? new Date(startDateInput.value) : null;
      const end = endDateInput && endDateInput.value ? new Date(endDateInput.value + 'T23:59:59') : null;
      if (start) list = list.filter(t => new Date(t.date || 0) >= start);
      if (end) list = list.filter(t => new Date(t.date || 0) <= end);
    }

    // Sorting
    list.sort((a, b) => {
      if (sortVal === 'date-desc') {
        return new Date(b.date || 0) - new Date(a.date || 0);
      } else if (sortVal === 'amount-desc') {
        const amtA = Number(a.amountINR || a.amountInINR) || 0;
        const amtB = Number(b.amountINR || b.amountInINR) || 0;
        return amtB - amtA;
      } else {
        // 'date-asc' (default): oldest first (chronological)
        return new Date(a.date || 0) - new Date(b.date || 0);
      }
    });

    return list;
  }

  /**
   * Aggregates breakdown stats for a given basis (category, payment, user)
   */
  function aggregateBreakdown(transactions, basis) {
    const breakdown = {};
    let total = 0;

    transactions.forEach(t => {
      const amt = Number(t.amountINR || t.amountInINR) || 0;
      total += amt;

      let key = 'General';
      if (basis === 'payment') {
        key = String(t.paymentMode || 'Cash').trim();
      } else if (basis === 'user') {
        key = String(t.paidBy || 'Self').trim();
      } else {
        key = String(t.category || 'General / Other').trim();
      }

      breakdown[key] = (breakdown[key] || 0) + amt;
    });

    return { breakdown, total };
  }

  /**
   * Refreshes the in-modal interactive report preview
   */
  function applyFiltersAndRenderPreview() {
    currentFilteredTransactions = getFilteredAndSortedTransactions();

    const curCode = (activeTrip && activeTrip.baseCurrency) ? activeTrip.baseCurrency : 'INR';
    let totalSpend = 0;
    currentFilteredTransactions.forEach(t => {
      totalSpend += (Number(t.amountINR || t.amountInINR) || 0);
    });

    // Update metric cards
    const totalEl = document.getElementById('export-metric-total');
    if (totalEl) totalEl.textContent = formatPdfCurrency(totalSpend, curCode);

    const countEl = document.getElementById('export-metric-count');
    if (countEl) countEl.textContent = `${currentFilteredTransactions.length} expenses`;

    const datesEl = document.getElementById('export-metric-dates');
    if (datesEl) {
      if (currentFilteredTransactions.length === 0) {
        datesEl.textContent = 'No expenses in range';
      } else {
        // Get date span
        const dates = currentFilteredTransactions
          .map(t => t.date)
          .filter(Boolean)
          .sort();
        if (dates.length > 0) {
          const earliest = dates[0];
          const latest = dates[dates.length - 1];
          datesEl.textContent = (earliest === latest) ? earliest : `${earliest} → ${latest}`;
        } else {
          datesEl.textContent = 'All recorded dates';
        }
      }
    }

    // Render interactive preview sections
    const previewContainer = document.getElementById('export-preview-sections');
    if (!previewContainer) return;

    if (currentFilteredTransactions.length === 0) {
      previewContainer.innerHTML = `
        <div class="py-6 text-center text-slate-500 text-xs italic">
          No expenses match the selected date filters.
        </div>
      `;
      return;
    }

    const catEnabled = document.getElementById('export-include-category')?.checked ?? true;
    const payEnabled = document.getElementById('export-include-payment')?.checked ?? true;
    const userEnabled = document.getElementById('export-include-paidby')?.checked ?? true;

    let html = '';

    if (catEnabled) {
      const catData = aggregateBreakdown(currentFilteredTransactions, 'category');
      html += renderPreviewSectionHTML('Spending by Category', catData.breakdown, totalSpend, 'category');
    }

    if (payEnabled) {
      const payData = aggregateBreakdown(currentFilteredTransactions, 'payment');
      html += renderPreviewSectionHTML('Spending by Payment Mode', payData.breakdown, totalSpend, 'payment');
    }

    if (userEnabled) {
      const userData = aggregateBreakdown(currentFilteredTransactions, 'user');
      html += renderPreviewSectionHTML('Spending by Paid By', userData.breakdown, totalSpend, 'user');
    }

    if (!catEnabled && !payEnabled && !userEnabled) {
      html = `
        <div class="py-3 text-center text-slate-400 text-xs">
          No breakdown charts selected for Page 1.
        </div>
      `;
    }

    previewContainer.innerHTML = html;
  }

  /**
   * Helper to build HTML for an in-modal preview section
   */
  function renderPreviewSectionHTML(title, breakdown, totalSpend, basis) {
    const keys = Object.keys(breakdown).filter(k => breakdown[k] > 0);
    keys.sort((a, b) => breakdown[b] - breakdown[a]);

    const curCode = (activeTrip && activeTrip.baseCurrency) ? activeTrip.baseCurrency : 'INR';

    let barsHTML = '';
    let listHTML = '';

    keys.forEach((key, idx) => {
      const amt = breakdown[key];
      const ratio = totalSpend > 0 ? (amt / totalSpend) : 0;
      const pct = Math.round(ratio * 100);
      const meta = (typeof getBreakdownItemMeta === 'function')
        ? getBreakdownItemMeta(key, basis, idx)
        : { icon: '•', color: '#3b82f6', label: key };

      barsHTML += `<div style="width: ${Math.max(3, pct)}%; background-color: ${meta.color}" title="${meta.label}: ${pct}%"></div>`;

      listHTML += `
        <div class="flex items-center justify-between py-0.5 text-[11px]">
          <div class="flex items-center space-x-1.5 min-w-0 pr-2 truncate">
            <span class="w-2 h-2 rounded-full flex-shrink-0" style="background-color: ${meta.color}"></span>
            <span class="text-slate-300 truncate">${meta.label || key}</span>
          </div>
          <div class="flex items-center space-x-2 flex-shrink-0">
            <span class="font-semibold text-white">${formatPdfCurrency(amt, curCode)}</span>
            <span class="text-slate-400 font-mono text-[10px] w-7 text-right">${pct}%</span>
          </div>
        </div>
      `;
    });

    return `
      <div class="p-2.5 rounded-lg bg-slate-800/60 border border-slate-750/70 space-y-1.5">
        <div class="flex items-center justify-between text-slate-300 font-semibold text-xs">
          <span>${title}</span>
          <span class="text-[10px] text-slate-400 font-normal">${keys.length} items</span>
        </div>
        <div class="w-full h-1.5 rounded-full bg-slate-700/80 overflow-hidden flex">
          ${barsHTML}
        </div>
        <div class="divide-y divide-slate-750/40 pt-1">
          ${listHTML}
        </div>
      </div>
    `;
  }

  /**
   * Renders a smooth, high-resolution Donut Chart onto an offscreen canvas.
   * Returns a PNG data URL suitable for embedding in jsPDF at crisp retina DPI.
   */
  function renderOffscreenDonutChart(breakdown, totalSpend, basis, diameterPx = 280) {
    const canvas = document.createElement('canvas');
    const scale = 3; // 3x retina scaling for razor-sharp vector clarity in PDF
    canvas.width = diameterPx * scale;
    canvas.height = diameterPx * scale;

    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    const centerX = diameterPx / 2;
    const centerY = diameterPx / 2;
    const radius = (diameterPx / 2) - 16;
    const ringWidth = 28;

    // Draw background track
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    ctx.strokeStyle = '#e2e8f0'; // Clean slate-200 track for PDF light page
    ctx.lineWidth = ringWidth;
    ctx.stroke();

    const keys = Object.keys(breakdown).filter(k => breakdown[k] > 0);
    if (keys.length === 0 || totalSpend <= 0) {
      // Empty state
      return canvas.toDataURL('image/png');
    }

    keys.sort((a, b) => breakdown[b] - breakdown[a]);

    let startAngle = -Math.PI / 2; // Start from top 12 o'clock

    keys.forEach((key, idx) => {
      const amt = breakdown[key];
      const ratio = amt / totalSpend;
      const sliceAngle = ratio * 2 * Math.PI;
      const endAngle = startAngle + sliceAngle;

      const meta = (typeof getBreakdownItemMeta === 'function')
        ? getBreakdownItemMeta(key, basis, idx)
        : { color: '#3b82f6' };

      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, startAngle, endAngle);
      ctx.strokeStyle = meta.color || '#3b82f6';
      ctx.lineWidth = ringWidth;
      ctx.lineCap = 'butt';
      ctx.stroke();

      startAngle = endAngle;
    });

    // Center Text: "Total" & Amount
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#64748b';
    ctx.font = '600 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText('TOTAL', centerX, centerY - 8);

    const curCode = (activeTrip && activeTrip.baseCurrency) ? activeTrip.baseCurrency : 'INR';
    const totalDisplay = formatPdfCurrency(totalSpend, curCode);

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(totalDisplay, centerX, centerY + 10);

    return canvas.toDataURL('image/png');
  }

  const rupeeIconsCache = {};

  /**
   * Generates a high-resolution, transparent PNG data URL of the official Rupee symbol ₹.
   * Leverages the browser's native text typography engine to render the exact official glyph.
   */
  function getRupeeIconDataUrl(color = '#1e293b', size = 96) {
    const cacheKey = `${color}_${size}`;
    if (rupeeIconsCache[cacheKey]) return rupeeIconsCache[cacheKey];

    if (typeof document === 'undefined' || !document.createElement) {
      return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = color;
      ctx.font = `bold ${Math.round(size * 0.82)}px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('₹', size / 2, size / 2);

      const dataUrl = canvas.toDataURL('image/png');
      rupeeIconsCache[cacheKey] = dataUrl;
      return dataUrl;
    } catch (e) {
      return '';
    }
  }

  /**
   * Draws the official Rupee logo ₹ at the specified millimeter coordinates in jsPDF.
   */
  function drawRupeeLogo(doc, x, y, sizeMm = 2.4, color = '#1e293b') {
    const iconUrl = getRupeeIconDataUrl(color, 96);
    if (iconUrl && doc.addImage) {
      try {
        doc.addImage(iconUrl, 'PNG', x, y, sizeMm, sizeMm);
      } catch (e) {}
    }
  }

  /**
   * PDF-safe currency formatter.
   * Standard PDF core fonts (Helvetica) only support WinAnsi (ASCII 0-255).
   * For INR, displays formatted Rupee amounts with the ₹ symbol.
   */
  function formatPdfCurrency(amount, currencyCode = 'INR') {
    const code = (currencyCode || 'INR').toUpperCase();
    const num = Number(amount) || 0;

    const zeroDecimalCurrencies = ['JPY', 'VND', 'IDR'];
    const decimals = zeroDecimalCurrencies.includes(code) ? 0 : 2;

    const numStr = num.toLocaleString('en-IN', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    });

    if (code === 'INR') {
      return `₹ ${numStr}`;
    } else if (code === 'USD') {
      return `$ ${numStr}`;
    } else if (code === 'EUR') {
      return `EUR ${numStr}`;
    } else if (code === 'GBP') {
      return `GBP ${numStr}`;
    } else {
      return `${code} ${numStr}`;
    }
  }

  /**
   * Helper to draw breakdown table rows in PDF
   */
  function drawBreakdownItems(doc, items, startX, startY, width, curCode, basis, offsetIdx = 0) {
    let rY = startY;

    // Header row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('ITEM', startX, rY);

    if (curCode === 'INR') {
      doc.text('AMOUNT (', startX + width - 18, rY, { align: 'right' });
      drawRupeeLogo(doc, startX + width - 17.5, rY - 2.0, 2.2, 2.2, '#64748b');
      doc.text(')', startX + width - 15.0, rY);
    } else {
      doc.text(`AMOUNT (${curCode})`, startX + width - 18, rY, { align: 'right' });
    }
    doc.text('%', startX + width - 1, rY, { align: 'right' });

    doc.setDrawColor(226, 232, 240);
    doc.line(startX, rY + 1.2, startX + width, rY + 1.2);
    rY += 3.8;

    items.forEach((item, idx) => {
      const meta = (typeof getBreakdownItemMeta === 'function')
        ? getBreakdownItemMeta(item.key, basis, offsetIdx + idx)
        : { color: '#3b82f6', label: item.key };

      // Swatch
      const rgb = hexToRgb(meta.color || '#3b82f6');
      doc.setFillColor(rgb.r, rgb.g, rgb.b);
      doc.rect(startX, rY - 2.0, 2.2, 2.2, 'F');

      // Label
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor(30, 41, 59);

      const maxLabelW = width - 26;
      const truncatedLabel = doc.splitTextToSize(meta.label || item.key, maxLabelW)[0] || item.key;
      doc.text(truncatedLabel, startX + 3.2, rY);

      // Amount with Rupee logo if INR, or text currency if other
      doc.setFont('helvetica', 'bold');
      const numStr = (Number(item.amt) || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });

      if (curCode === 'INR') {
        const textW = (doc.getStringUnitWidth(numStr) * 6.5) / doc.internal.scaleFactor;
        const rupeeX = startX + width - 18 - textW - 2.4;
        drawRupeeLogo(doc, rupeeX, rY - 2.0, 2.1, 2.1, '#1e293b');
        doc.text(numStr, startX + width - 18, rY, { align: 'right' });
      } else {
        doc.text(formatPdfCurrency(item.amt, curCode), startX + width - 18, rY, { align: 'right' });
      }

      // Percentage
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      doc.text(`${item.pct}%`, startX + width - 1, rY, { align: 'right' });

      rY += 3.8;
    });

    return rY;
  }
  function sanitizeFilename(str) {
    return String(str || 'Trip')
      .replace(/[^a-zA-Z0-9_\-]/g, '_')
      .replace(/_+/g, '_')
      .substring(0, 40);
  }

  /**
   * Main PDF Generator Function
   * Builds Page 1 (Summary + 3 Charts) and Page 2+ (Full Transactions Ledger)
   */
  async function generateAndDownloadPDF() {
    const downloadBtn = document.getElementById('download-pdf-btn');
    const btnText = document.getElementById('download-pdf-btn-text');

    if (downloadBtn) downloadBtn.disabled = true;
    if (btnText) btnText.textContent = 'Generating Vector PDF...';

    try {
      if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('jsPDF library failed to load. Please check your internet connection or use browser print.');
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });

      const pageWidth = 210;
      const pageHeight = 297;
      const margin = 10;
      const contentWidth = pageWidth - (margin * 2);

      const tripName = (activeTrip && activeTrip.name) ? activeTrip.name : 'Travel Expense Report';
      const curCode = (activeTrip && activeTrip.baseCurrency) ? activeTrip.baseCurrency : 'INR';
      const transactions = getFilteredAndSortedTransactions();

      let totalSpend = 0;
      transactions.forEach(t => {
        totalSpend += (Number(t.amountINR || t.amountInINR) || 0);
      });

      // Date span computation
      const dates = transactions.map(t => t.date).filter(Boolean).sort();
      let dateSpanText = 'All Recorded Expenses';
      if (dates.length > 0) {
        dateSpanText = (dates[0] === dates[dates.length - 1]) ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`;
      }

      // ----------------------------------------------------
      // PAGE 1: EXECUTIVE SUMMARY & THE 3 BREAKUP CHARTS
      // ----------------------------------------------------

      // 1. Top Header Banner
      doc.setFillColor(15, 23, 42); // slate-900
      doc.roundedRect(margin, margin, contentWidth, 15, 2, 2, 'F');

      // Header App Brand
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('XPENSE TRACKER', margin + 6, margin + 9.5);

      // Header Trip Name on Right
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(255, 255, 255);
      doc.text(tripName, pageWidth - margin - 6, margin + 6.5, { align: 'right' });

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(148, 163, 184);
      const nowStr = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
      doc.text(`Generated: ${nowStr}`, pageWidth - margin - 6, margin + 11.5, { align: 'right' });

      // 2. KPI Summary Boxes (4 columns)
      const kpiY = margin + 18;
      const kpiHeight = 13;
      const kpiGap = 2.5;
      const kpiWidth = (contentWidth - (kpiGap * 3)) / 4;

      const totalFormatted = (Number(totalSpend) || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      // Box 1: Total Spend
      const b1X = margin;
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(b1X, kpiY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('TOTAL SPEND', b1X + 3, kpiY + 4);
      doc.setFontSize(8.5);
      doc.setTextColor(37, 99, 235);
      if (curCode === 'INR') {
        drawRupeeLogo(doc, b1X + 3.2, kpiY + 6.8, 3.0, 3.0, '#2563eb');
        doc.text(totalFormatted, b1X + 6.8, kpiY + 9.8);
      } else {
        doc.text(formatPdfCurrency(totalSpend, curCode), b1X + 3, kpiY + 9.8);
      }

      // Box 2: Expenses Count
      const b2X = margin + (kpiWidth + kpiGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(b2X, kpiY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('EXPENSES', b2X + 3, kpiY + 4);
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      doc.text(`${transactions.length} items`, b2X + 3, kpiY + 9.8);

      // Box 3: Base Currency
      const b3X = margin + 2 * (kpiWidth + kpiGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(b3X, kpiY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('BASE CURRENCY', b3X + 3, kpiY + 4);
      doc.setFontSize(8.5);
      doc.setTextColor(15, 23, 42);
      if (curCode === 'INR') {
        doc.text('INR (', b3X + 3, kpiY + 9.8);
        drawRupeeLogo(doc, b3X + 9.2, kpiY + 7.2, 2.6, 2.6, '#0f172a');
        doc.text(')', b3X + 12.2, kpiY + 9.8);
      } else {
        doc.text(curCode, b3X + 3, kpiY + 9.8);
      }

      // Box 4: Date Range
      const b4X = margin + 3 * (kpiWidth + kpiGap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(b4X, kpiY, kpiWidth, kpiHeight, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text('DATE RANGE', b4X + 3, kpiY + 4);
      doc.setFontSize(6.5);
      doc.setTextColor(15, 23, 42);
      doc.text(dateSpanText, b4X + 3, kpiY + 9.8);

      // 3. Breakup Chart Sections
      const catEnabled = document.getElementById('export-include-category')?.checked ?? true;
      const payEnabled = document.getElementById('export-include-payment')?.checked ?? true;
      const userEnabled = document.getElementById('export-include-paidby')?.checked ?? true;

      let currentY = kpiY + kpiHeight + 3.5;

      // SECTION 1: CATEGORY BREAKDOWN (Full Width, Multi-Column to fit ALL categories)
      if (catEnabled) {
        const { breakdown, total } = aggregateBreakdown(transactions, 'category');
        const keys = Object.keys(breakdown).filter(k => breakdown[k] > 0);
        keys.sort((a, b) => breakdown[b] - breakdown[a]);

        const allItems = keys.map(k => ({
          key: k,
          amt: breakdown[k],
          pct: total > 0 ? Math.round((breakdown[k] / total) * 100) : 0
        }));

        // Render in 2 columns if more than 4 categories so ALL fit compactly
        const isTwoCols = allItems.length > 4;
        const numRows = isTwoCols ? Math.ceil(allItems.length / 2) : Math.max(1, allItems.length);
        const cardHeight = Math.max(46, numRows * 3.8 + 13);

        // Container Card
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, currentY, contentWidth, cardHeight, 2, 2, 'FD');

        // Header Title Bar
        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, currentY, contentWidth, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`1. EXPENSE BREAKDOWN BY CATEGORY (${allItems.length} CATEGORIES)`, margin + 4, currentY + 4.2);

        // Donut Chart Graphic on Left
        const chartDiamMm = Math.min(cardHeight - 10, 38);
        const chartDataUrl = renderOffscreenDonutChart(breakdown, total, 'category', 260);
        const chartX = margin + 4;
        const chartY = currentY + 7;
        doc.addImage(chartDataUrl, 'PNG', chartX, chartY, chartDiamMm, chartDiamMm);

        // Table on Right: 1 column or 2 columns (Printing ALL categories without truncation)
        const tableStartX = chartX + chartDiamMm + 6;
        const tableTotalWidth = contentWidth - (chartDiamMm + 14);

        if (!isTwoCols) {
          drawBreakdownItems(doc, allItems, tableStartX, currentY + 10, tableTotalWidth, curCode, 'category', 0);
        } else {
          const mid = Math.ceil(allItems.length / 2);
          const col1Items = allItems.slice(0, mid);
          const col2Items = allItems.slice(mid);
          const colW = (tableTotalWidth - 4) / 2;

          drawBreakdownItems(doc, col1Items, tableStartX, currentY + 10, colW, curCode, 'category', 0);
          drawBreakdownItems(doc, col2Items, tableStartX + colW + 4, currentY + 10, colW, curCode, 'category', mid);
        }

        currentY += cardHeight + 3.5;
      }

      // SECTION 2 & 3: PAYMENT MODE & PAID BY BREAKDOWNS
      if (payEnabled && userEnabled) {
        // Render Side-by-Side to preserve vertical space and fit A4 perfectly
        const halfWidth = (contentWidth - 3.5) / 2;

        const payData = aggregateBreakdown(transactions, 'payment');
        const payKeys = Object.keys(payData.breakdown).filter(k => payData.breakdown[k] > 0);
        payKeys.sort((a, b) => payData.breakdown[b] - payData.breakdown[a]);
        const payItems = payKeys.map(k => ({
          key: k,
          amt: payData.breakdown[k],
          pct: payData.total > 0 ? Math.round((payData.breakdown[k] / payData.total) * 100) : 0
        }));

        const userData = aggregateBreakdown(transactions, 'user');
        const userKeys = Object.keys(userData.breakdown).filter(k => userData.breakdown[k] > 0);
        userKeys.sort((a, b) => userData.breakdown[b] - userData.breakdown[a]);
        const userItems = userKeys.map(k => ({
          key: k,
          amt: userData.breakdown[k],
          pct: userData.total > 0 ? Math.round((userData.breakdown[k] / userData.total) * 100) : 0
        }));

        const maxRows = Math.max(payItems.length, userItems.length, 1);
        const cardHeight = Math.max(44, maxRows * 3.8 + 13);

        // Left Card: Payment Mode
        const leftX = margin;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(leftX, currentY, halfWidth, cardHeight, 2, 2, 'FD');

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(leftX, currentY, halfWidth, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`2. BREAKDOWN BY PAYMENT MODE (${payItems.length})`, leftX + 4, currentY + 4.2);

        const miniChartDiam = Math.min(cardHeight - 12, 30);
        const payChartUrl = renderOffscreenDonutChart(payData.breakdown, payData.total, 'payment', 220);
        doc.addImage(payChartUrl, 'PNG', leftX + 3, currentY + 8, miniChartDiam, miniChartDiam);

        const payTableX = leftX + miniChartDiam + 4;
        const payTableW = halfWidth - (miniChartDiam + 7);
        drawBreakdownItems(doc, payItems, payTableX, currentY + 10, payTableW, curCode, 'payment', 0);

        // Right Card: Paid By / Member
        const rightX = margin + halfWidth + 3.5;
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(rightX, currentY, halfWidth, cardHeight, 2, 2, 'FD');

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(rightX, currentY, halfWidth, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`3. BREAKDOWN BY PAID BY / MEMBER (${userItems.length})`, rightX + 4, currentY + 4.2);

        const userChartUrl = renderOffscreenDonutChart(userData.breakdown, userData.total, 'user', 220);
        doc.addImage(userChartUrl, 'PNG', rightX + 3, currentY + 8, miniChartDiam, miniChartDiam);

        const userTableX = rightX + miniChartDiam + 4;
        const userTableW = halfWidth - (miniChartDiam + 7);
        drawBreakdownItems(doc, userItems, userTableX, currentY + 10, userTableW, curCode, 'user', 0);

        currentY += cardHeight + 3.5;

      } else if (payEnabled || userEnabled) {
        // Only one enabled: render full width
        const basis = payEnabled ? 'payment' : 'user';
        const title = payEnabled ? '2. EXPENSE BREAKDOWN BY PAYMENT MODE' : '2. EXPENSE BREAKDOWN BY PAID BY / MEMBER';

        const bData = aggregateBreakdown(transactions, basis);
        const bKeys = Object.keys(bData.breakdown).filter(k => bData.breakdown[k] > 0);
        bKeys.sort((a, b) => bData.breakdown[b] - bData.breakdown[a]);
        const bItems = bKeys.map(k => ({
          key: k,
          amt: bData.breakdown[k],
          pct: bData.total > 0 ? Math.round((bData.breakdown[k] / bData.total) * 100) : 0
        }));

        const isTwoCols = bItems.length > 5;
        const numRows = isTwoCols ? Math.ceil(bItems.length / 2) : Math.max(1, bItems.length);
        const cardHeight = Math.max(44, numRows * 3.8 + 13);

        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(margin, currentY, contentWidth, cardHeight, 2, 2, 'FD');

        doc.setFillColor(241, 245, 249);
        doc.roundedRect(margin, currentY, contentWidth, 6, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(30, 41, 59);
        doc.text(`${title} (${bItems.length})`, margin + 4, currentY + 4.2);

        const chartDiamMm = Math.min(cardHeight - 10, 36);
        const chartUrl = renderOffscreenDonutChart(bData.breakdown, bData.total, basis, 240);
        doc.addImage(chartUrl, 'PNG', margin + 4, currentY + 8, chartDiamMm, chartDiamMm);

        const tableStartX = margin + chartDiamMm + 8;
        const tableTotalWidth = contentWidth - (chartDiamMm + 12);

        if (!isTwoCols) {
          drawBreakdownItems(doc, bItems, tableStartX, currentY + 10, tableTotalWidth, curCode, basis, 0);
        } else {
          const mid = Math.ceil(bItems.length / 2);
          const colW = (tableTotalWidth - 4) / 2;
          drawBreakdownItems(doc, bItems.slice(0, mid), tableStartX, currentY + 10, colW, curCode, basis, 0);
          drawBreakdownItems(doc, bItems.slice(mid), tableStartX + colW + 4, currentY + 10, colW, curCode, basis, mid);
        }

        currentY += cardHeight + 3.5;
      }

      // Page 1 Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text('XPense Tracker • Private & Confidential Expense Report', margin, pageHeight - 5);
      doc.text('Page 1 of Executive Summary', pageWidth - margin, pageHeight - 5, { align: 'right' });

      // ----------------------------------------------------
      // PAGE 2+: DETAILED TRANSACTIONS LEDGER (AUTO-TABLE)
      // ----------------------------------------------------
      const includeTxns = document.getElementById('export-include-txns')?.checked ?? true;

      if (includeTxns && transactions.length > 0 && doc.autoTable) {
        doc.addPage();

        // Page 2 Header Banner
        doc.setFillColor(15, 23, 42); // slate-900
        doc.roundedRect(margin, margin, contentWidth, 14, 2, 2, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(255, 255, 255);
        doc.text(`${tripName.toUpperCase()} — DETAILED TRANSACTIONS LEDGER`, margin + 5, margin + 6.5);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(`Chronological ledger of all ${transactions.length} recorded items (${dateSpanText})`, margin + 5, margin + 11);

        const curHeader = (curCode === 'INR') ? 'Amount (₹)' : `Amount (${curCode})`;

        // Prepare rows for autoTable with PDF-safe formatting
        const tableRows = transactions.map((t, idx) => {
          const origAmt = Number(t.originalAmount) || 0;
          const origCur = t.currency || 'INR';
          const convAmt = Number(t.amountINR || t.amountInINR) || 0;
          const numStr = convAmt.toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          });

          return [
            String(idx + 1),
            t.date || '',
            t.description || '—',
            t.category || 'General',
            t.paidBy || 'Self',
            t.paymentMode || 'Cash',
            (origCur !== curCode) ? `${origCur} ${origAmt.toFixed(2)}` : '—',
            (curCode === 'INR') ? numStr : formatPdfCurrency(convAmt, curCode)
          ];
        });

        doc.autoTable({
          startY: margin + 17,
          head: [[
            '#',
            'Date',
            'Description',
            'Category',
            'Paid By',
            'Mode',
            'Original Amt',
            curHeader
          ]],
          body: tableRows,
          theme: 'grid',
          styles: {
            fontSize: 7.5,
            cellPadding: 2.0,
            font: 'helvetica',
            textColor: [30, 41, 59],
            lineColor: [226, 232, 240],
            lineWidth: 0.15
          },
          headStyles: {
            fillColor: [30, 41, 59], // slate-800
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            halign: 'left',
            fontSize: 7.5
          },
          alternateRowStyles: {
            fillColor: [248, 250, 252] // slate-50
          },
          columnStyles: {
            0: { cellWidth: 8, halign: 'center' },
            1: { cellWidth: 20 },
            2: { cellWidth: 'auto' },
            3: { cellWidth: 26 },
            4: { cellWidth: 20 },
            5: { cellWidth: 22 },
            6: { cellWidth: 25, halign: 'right' },
            7: { cellWidth: 30, halign: 'right', fontStyle: 'bold' }
          },
          margin: { left: margin, right: margin, bottom: 12 },
          didDrawCell: function(data) {
            if (data.column.index === 7) {
              if (data.section === 'head' && curCode === 'INR') {
                // Draw Rupee logo inside header
                const hx = data.cell.x + data.cell.width - 9.0;
                drawRupeeLogo(doc, hx, data.cell.y + (data.cell.height - 2.4) / 2, 2.4, 2.4, '#ffffff');
              } else if (data.section === 'body' && curCode === 'INR') {
                // Draw Rupee logo before the right-aligned amount number
                const rawVal = data.cell.raw || (data.cell.text ? data.cell.text[0] : '');
                const textW = (doc.getStringUnitWidth(String(rawVal)) * 7.5) / doc.internal.scaleFactor;
                const padR = data.cell.padding('right');
                const rx = data.cell.x + data.cell.width - textW - padR - 2.8;
                const ry = data.cell.y + (data.cell.height - 2.3) / 2;
                drawRupeeLogo(doc, rx, ry, 2.3, 2.3, '#0f172a');
              }
            }
          },
          didDrawPage: function(data) {
            // Footer on every transaction ledger page
            const pageNum = doc.internal.getNumberOfPages();
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text('XPense Tracker • Detailed Ledger', margin, pageHeight - 5);
            doc.text(`Page ${pageNum}`, pageWidth - margin, pageHeight - 5, { align: 'right' });
          }
        });
      }

      // Generate sanitized filename and trigger instant download
      const cleanName = sanitizeFilename(tripName);
      const dateTag = new Date().toISOString().substring(0, 10);
      const fileName = `${cleanName}_Expense_Report_${dateTag}.pdf`;

      doc.save(fileName);

      if (typeof showToast === 'function') {
        showToast('PDF Report downloaded successfully!', '📄');
      }

    } catch (err) {
      console.error('PDF Generation Error:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      if (downloadBtn) downloadBtn.disabled = false;
      if (btnText) btnText.textContent = 'Download PDF Report';
    }
  }

  /**
   * Helper to parse hex colors to RGB
   */
  function hexToRgb(hex) {
    let clean = String(hex || '#3b82f6').replace('#', '');
    if (clean.length === 3) {
      clean = clean.split('').map(c => c + c).join('');
    }
    const num = parseInt(clean, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    };
  }

  /**
   * Triggers native browser print
   */
  function triggerPrint() {
    window.print();
  }

  return {
    init,
    openModal,
    closeModal,
    applyFiltersAndRenderPreview,
    renderOffscreenDonutChart,
    aggregateBreakdown,
    getFilteredAndSortedTransactions,
    generateAndDownloadPDF,
    sanitizeFilename,
    hexToRgb,
    formatPdfCurrency,
    drawRupeeLogo,
    getRupeeIconDataUrl
  };
})();

// Auto-initialize when DOM is loaded
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    ReportExport.init();
  });
}

// Module export for testing environment
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { ReportExport };
}
