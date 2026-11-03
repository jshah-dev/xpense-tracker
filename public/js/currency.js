/**
 * Currency Catalog, Formatters, and Conversion Engine
 */

const CURRENCIES = [
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', defaultRate: 1.0 },
  { code: 'USD', symbol: '$', name: 'US Dollar', defaultRate: 86.5 },
  { code: 'EUR', symbol: '€', name: 'Euro', defaultRate: 93.0 },
  { code: 'GBP', symbol: '£', name: 'British Pound', defaultRate: 110.0 },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', defaultRate: 23.5 },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', defaultRate: 2.5 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', defaultRate: 64.0 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', defaultRate: 0.58 },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', defaultRate: 0.0034 },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', defaultRate: 0.0053 },
  { code: 'CUSTOM', symbol: '¤', name: 'Custom Currency', defaultRate: 1.0 }
];

/**
 * Returns currency info by code
 */
function getCurrency(code) {
  if (!code) return CURRENCIES[0];
  const found = CURRENCIES.find(c => c.code === code.toUpperCase());
  return found || { code: code.toUpperCase(), symbol: code, name: code, defaultRate: 1.0 };
}

/**
 * Formats a number in any supported currency format (e.g. INR ₹, USD $, EUR €, GBP £, JPY ¥)
 */
function formatCurrency(amount, currencyCode = 'INR') {
  const code = (currencyCode || 'INR').toUpperCase();
  const num = Number(amount) || 0;

  if (code === 'CUSTOM') {
    return `¤ ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  const localeMap = {
    'INR': 'en-IN',
    'USD': 'en-US',
    'EUR': 'de-DE',
    'GBP': 'en-GB',
    'AED': 'ar-AE',
    'THB': 'th-TH',
    'SGD': 'en-SG',
    'JPY': 'ja-JP',
    'VND': 'vi-VN',
    'IDR': 'id-ID'
  };

  const zeroDecimalCurrencies = ['JPY', 'VND', 'IDR'];
  const decimals = zeroDecimalCurrencies.includes(code) ? 0 : 2;

  try {
    const locale = localeMap[code] || 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: code,
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals
    }).format(num);
  } catch (e) {
    const cur = getCurrency(code);
    return `${cur.symbol} ${num.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
  }
}

/**
 * Formats a number in Indian Rupee format (e.g. ₹ 1,24,850.00) — backward-compatible wrapper
 */
function formatINR(amount) {
  return formatCurrency(amount, 'INR');
}

/**
 * Formats a number with its native currency symbol
 */
function formatOriginalCurrency(amount, currencyCode) {
  const cur = getCurrency(currencyCode);
  const num = Number(amount) || 0;
  return `${cur.symbol} ${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Computes converted amount given original amount and exchange rate
 */
function calculateConvertedAmount(originalAmount, exchangeRate) {
  const amt = Number(originalAmount) || 0;
  const rate = Number(exchangeRate) || 1;
  return Math.round(amt * rate * 100) / 100;
}

/**
 * Computes converted INR amount — backward-compatible wrapper
 */
function calculateINR(originalAmount, exchangeRate) {
  return calculateConvertedAmount(originalAmount, exchangeRate);
}

// Export for module/browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CURRENCIES,
    getCurrency,
    formatCurrency,
    formatINR,
    formatOriginalCurrency,
    calculateConvertedAmount,
    calculateINR
  };
}

