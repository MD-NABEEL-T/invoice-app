import { paiseToRupees, amountInWords } from './tax.js';

export { amountInWords as numberToWordsIndian };

/**
 * Formats an ISO date string (YYYY-MM-DD) into DD/MM/YYYY for bill display.
 */
export function formatDisplayDate(dateStr) {
  if (!dateStr) return '';
  const parts = String(dateStr).split('T')[0].split('-');
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

/**
 * Formats integer paise into Indian rupee display format with currency symbol.
 * E.g., 124625 -> "₹1,246.25", 20000 -> "₹200.00", 0 -> "₹0.00"
 */
export function formatRupees(paise) {
  const rupeesStr = paiseToRupees(paise);
  const isNegative = rupeesStr.startsWith('-');
  const cleanStr = isNegative ? rupeesStr.slice(1) : rupeesStr;
  const [integerPart, decimalPart] = cleanStr.split('.');

  // Format integer part with Indian lakh/thousand commas
  const lastThree = integerPart.slice(-3);
  const otherNumbers = integerPart.slice(0, -3);
  const formattedInt = otherNumbers !== ''
    ? otherNumbers.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + lastThree
    : lastThree;

  return `${isNegative ? '-' : ''}₹${formattedInt}.${decimalPart || '00'}`;
}

/**
 * Computes today's and this month's invoice statistics.
 * Cancelled invoices are strictly excluded from counts and totals.
 *
 * @param {Array} invoices - List of invoice records
 * @param {string|Date} [refDate] - Reference date (YYYY-MM-DD or Date object, defaults to today)
 */
export function computeBillStats(invoices = [], refDate = new Date()) {
  const dateObj = refDate instanceof Date ? refDate : new Date(refDate);
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, '0');
  const day = String(dateObj.getDate()).padStart(2, '0');

  const todayStr = `${year}-${month}-${day}`;
  const monthPrefix = `${year}-${month}`;

  let todayCount = 0;
  let todayTotalPaise = 0;
  let monthCount = 0;
  let monthTotalPaise = 0;

  for (const inv of invoices) {
    if (inv.status === 'cancelled') continue;

    const invDateStr = String(inv.invoice_date || '').split('T')[0];
    const payable = Number(inv.payable_paise) || 0;

    if (invDateStr === todayStr) {
      todayCount += 1;
      todayTotalPaise += payable;
    }

    if (invDateStr.startsWith(monthPrefix)) {
      monthCount += 1;
      monthTotalPaise += payable;
    }
  }

  return {
    todayCount,
    todayTotalPaise,
    monthCount,
    monthTotalPaise,
  };
}
