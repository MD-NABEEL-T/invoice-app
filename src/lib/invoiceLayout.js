import { amountInWords, paiseToRupees } from './tax.js';

/**
 * 1. Generates clean PDF file name from invoice number.
 * E.g. '048/26-27' -> '048-26-27.pdf'
 * Falsy -> 'invoice.pdf'
 */
export function getInvoicePdfFilename(invoiceNo) {
  if (!invoiceNo || typeof invoiceNo !== 'string') return 'invoice.pdf';
  const clean = invoiceNo.trim().replace(/[/\\:*?"<>|]/g, '-');
  if (!clean) return 'invoice.pdf';
  return clean.toLowerCase().endsWith('.pdf') ? clean : `${clean}.pdf`;
}

/**
 * 2. Formats integer paise into clean Indian currency amount string with 2 decimal places.
 * Avoids rupee symbol glyph (₹) per requirements.
 * E.g. 124625 -> "1,246.25", 25875 -> "258.75", 0 -> "0.00"
 * If withPrefix: "Rs. 1,246.25"
 */
export function formatPlainAmount(paise, { withPrefix = false } = {}) {
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

  const formatted = `${isNegative ? '-' : ''}${formattedInt}.${decimalPart || '00'}`;
  return withPrefix ? `Rs. ${formatted}` : formatted;
}

/**
 * 3. Rate-group tax summary rows for bill lines.
 * Computes consolidated taxable amount and tax split (CGST + SGST) per GST % rate slab.
 */
export function getRateGroupSummary(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) return [];

  const groupMap = new Map();

  for (const line of lines) {
    const gstPercent = Number(line.gst_percent ?? line.gstPercent ?? 0);
    const amountPaise = Number(
      line.amount_paise !== undefined && line.amount_paise !== null
        ? line.amount_paise
        : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
    );
    const currentTaxable = groupMap.get(gstPercent) || 0;
    groupMap.set(gstPercent, currentTaxable + amountPaise);
  }

  const sortedPercents = Array.from(groupMap.keys()).sort((a, b) => a - b);

  return sortedPercents.map((gstPercent) => {
    const taxablePaise = groupMap.get(gstPercent);
    // Round tax once to nearest integer paise
    const taxPaise = Math.round((taxablePaise * gstPercent) / 100);
    const halfRate = gstPercent / 2;
    const cgstPaise = Math.floor(taxPaise / 2);
    const sgstPaise = taxPaise - cgstPaise;

    return {
      gstPercent,
      taxablePaise,
      taxPaise,
      cgstRate: halfRate,
      cgstPaise,
      sgstRate: halfRate,
      sgstPaise,
    };
  });
}

/**
 * 4. HSN-wise tax summary table rows.
 * Groups line items by (hsn, gst_percent).
 * Returns rows plus totals and tax in words.
 */
export function getHsnSummaryRows(lines = []) {
  if (!Array.isArray(lines) || lines.length === 0) {
    return {
      rows: [],
      totalTaxablePaise: 0,
      totalCentralTaxPaise: 0,
      totalStateTaxPaise: 0,
      totalTaxPaise: 0,
      taxInWords: 'Rupees Zero Only',
    };
  }

  const hsnMap = new Map();

  for (const line of lines) {
    const hsn = String(line.hsn || '').trim() || 'OTHER';
    const gstPercent = Number(line.gst_percent ?? line.gstPercent ?? 0);
    const amountPaise = Number(
      line.amount_paise !== undefined && line.amount_paise !== null
        ? line.amount_paise
        : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
    );

    const key = `${hsn}__${gstPercent}`;
    const existing = hsnMap.get(key) || { hsn, gstPercent, taxablePaise: 0 };
    existing.taxablePaise += amountPaise;
    hsnMap.set(key, existing);
  }

  const rows = Array.from(hsnMap.values())
    .sort((a, b) => a.hsn.localeCompare(b.hsn) || a.gstPercent - b.gstPercent)
    .map((item) => {
      const taxPaise = Math.round((item.taxablePaise * item.gstPercent) / 100);
      const halfRate = item.gstPercent / 2;
      const centralTaxPaise = Math.floor(taxPaise / 2);
      const stateTaxPaise = taxPaise - centralTaxPaise;

      return {
        hsn: item.hsn,
        gstPercent: item.gstPercent,
        taxablePaise: item.taxablePaise,
        centralRate: halfRate,
        centralTaxPaise,
        stateRate: halfRate,
        stateTaxPaise,
        totalTaxPaise: taxPaise,
      };
    });

  let totalTaxablePaise = 0;
  let totalCentralTaxPaise = 0;
  let totalStateTaxPaise = 0;
  let totalTaxPaise = 0;

  for (const row of rows) {
    totalTaxablePaise += row.taxablePaise;
    totalCentralTaxPaise += row.centralTaxPaise;
    totalStateTaxPaise += row.stateTaxPaise;
    totalTaxPaise += row.totalTaxPaise;
  }

  return {
    rows,
    totalTaxablePaise,
    totalCentralTaxPaise,
    totalStateTaxPaise,
    totalTaxPaise,
    taxInWords: amountInWords(totalTaxPaise),
  };
}

/**
 * 5. Returns copy label for top-right corner if feature is enabled in Settings.
 */
export function getCopyLabel(copyIndex = 0, isEnabled = false) {
  if (!isEnabled) return '';
  switch (copyIndex) {
    case 0:
      return 'ORIGINAL FOR RECIPIENT';
    case 1:
      return 'DUPLICATE FOR TRANSPORTER';
    case 2:
      return 'TRIPLICATE FOR SUPPLIER';
    default:
      return `EXTRA COPY (${copyIndex + 1})`;
  }
}

/**
 * 6. Pagination Splitter for Invoice Lines.
 * Distributes line items across A4 pages so that:
 * - Header and table heading repeat on every page.
 * - Totals, HSN summary, words, declaration, and signatures appear ONLY on the last page.
 * - No line row is split across pages.
 *
 * @param {Array} lines - Array of bill line items
 * @param {Object} [options]
 * @param {number} [options.singlePageCapacity=8] - Max lines if the bill fits entirely on 1 page
 * @param {number} [options.middlePageCapacity=14] - Max lines on intermediate pages without totals/footer
 * @param {number} [options.lastPageCapacity=7] - Max lines on the final page (which includes totals & footer)
 * @returns {Array<{ pageIndex: number, pageNumber: number, totalPages: number, isFirst: boolean, isLast: boolean, lines: Array }>}
 */
export function paginateInvoiceLines(lines = [], {
  singlePageCapacity = 8,
  middlePageCapacity = 14,
  lastPageCapacity = 7,
} = {}) {
  const allLines = Array.isArray(lines) ? lines : [];

  // Edge case: empty lines
  if (allLines.length === 0) {
    return [{
      pageIndex: 0,
      pageNumber: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      lines: [],
    }];
  }

  // 1. Fits completely on a single page
  if (allLines.length <= singlePageCapacity) {
    return [{
      pageIndex: 0,
      pageNumber: 1,
      totalPages: 1,
      isFirst: true,
      isLast: true,
      lines: allLines,
    }];
  }

  // 2. Multi-page bill
  const pages = [];
  let remaining = [...allLines];

  while (remaining.length > 0) {
    const isFirst = pages.length === 0;

    // Can all remaining lines fit on this final page?
    if (remaining.length <= lastPageCapacity) {
      pages.push({
        isFirst,
        isLast: true,
        lines: remaining,
      });
      break;
    }

    // Intermediate page: take up to middlePageCapacity, but reserve at least 1 line for later
    const takeCount = Math.min(middlePageCapacity, remaining.length - 1);

    pages.push({
      isFirst,
      isLast: false,
      lines: remaining.slice(0, takeCount),
    });

    remaining = remaining.slice(takeCount);
  }

  const totalPages = pages.length;
  return pages.map((page, index) => ({
    pageIndex: index,
    pageNumber: index + 1,
    totalPages,
    isFirst: page.isFirst,
    isLast: page.isLast,
    lines: page.lines,
  }));
}
