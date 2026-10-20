import { rupeesToPaise, calcInvoice, amountInWords } from './tax.js';
import { validateHSN } from './itemValidation.js';

export { amountInWords as numberToWordsIndian };

/**
 * Parses user-entered quantity string or number into integer thousandths (qty_milli).
 * Up to 3 decimal places are supported (e.g. "2.5" -> 2500, "1" -> 1000, "0.75" -> 750).
 */
export function parseQuantityToMilli(val) {
  if (val === null || val === undefined || val === '') return 0;
  const str = String(val).trim().replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(str)) {
    const num = parseFloat(str);
    if (isNaN(num) || num <= 0) return 0;
    return Math.round(num * 1000);
  }
  const [whole, decimal = ''] = str.split('.');
  const cleanDec = decimal.slice(0, 3).padEnd(3, '0');
  const milli = parseInt(whole, 10) * 1000 + parseInt(cleanDec, 10);
  return isNaN(milli) ? 0 : milli;
}

/**
 * Converts integer milli back to decimal quantity string.
 * E.g., 2500 -> "2.5", 1000 -> "1", 750 -> "0.75"
 */
export function formatMilliToQuantity(milli) {
  if (milli === null || milli === undefined || isNaN(milli) || milli <= 0) return '';
  const num = Number(milli) / 1000;
  return String(num);
}

/**
 * Parses rupee input (string or number) into integer paise.
 */
export function parseRupeesToPaise(val) {
  return rupeesToPaise(val);
}

/**
 * Validates an individual bill line.
 * Rule: A line cannot be saved if HSN or GST % is empty.
 * In this case, returns exact message: "Fill HSN and GST % (item needs checking)".
 * HSN not 4, 6 or 8 digits returns a warning only.
 */
export function validateBillLine(line = {}) {
  const errors = [];
  let warning = null;

  const desc = String(line.description || '').trim();
  if (!desc) {
    errors.push('Item description is required');
  }

  const hsn = line.hsn !== null && line.hsn !== undefined ? String(line.hsn).trim() : '';
  const gstRaw = line.gst_percent ?? line.gstPercent;
  const hasGst = gstRaw !== null && gstRaw !== undefined && gstRaw !== '' && !isNaN(Number(gstRaw));

  if (!hsn || !hasGst) {
    errors.push('Fill HSN and GST % (item needs checking)');
  } else {
    const hsnCheck = validateHSN(hsn);
    if (hsnCheck.warning) {
      warning = hsnCheck.warning;
    }
  }

  const qtyMilli = typeof line.qty_milli === 'number' && line.qty_milli > 0
    ? line.qty_milli
    : parseQuantityToMilli(line.quantity ?? line.qty ?? line.qty_milli);

  if (qtyMilli <= 0) {
    errors.push('Quantity must be greater than 0');
  }

  const ratePaise = typeof line.rate_paise === 'number' && line.rate_paise >= 0
    ? line.rate_paise
    : parseRupeesToPaise(line.rate ?? line.rate_rupees ?? line.rate_paise);

  if (ratePaise < 0 || isNaN(ratePaise)) {
    errors.push('Rate cannot be negative');
  }

  return {
    isValid: errors.length === 0,
    error: errors[0] || null,
    errors,
    warning,
  };
}

/**
 * Validates the entire bill form (header fields + line cards).
 */
export function validateBillForm({ header = {}, lines = [] } = {}) {
  const errors = [];
  const lineErrors = {};
  const lineWarnings = {};

  if (!header.buyer_id && !header.buyer_name) {
    errors.push('Buyer selection is required');
  }

  if (!header.buyer_address || !String(header.buyer_address).trim()) {
    errors.push('Branch delivery address is required');
  }

  if (!header.invoice_date || !String(header.invoice_date).trim()) {
    errors.push('Bill date is required');
  }

  if (!header.buyer_order_no || !String(header.buyer_order_no).trim()) {
    errors.push('Buyer Order No is required');
  }

  if (!header.despatched_through || !String(header.despatched_through).trim()) {
    errors.push('Despatched Through is required');
  }

  if (!Array.isArray(lines) || lines.length === 0) {
    errors.push('Add at least one line item');
  } else {
    lines.forEach((line, idx) => {
      const res = validateBillLine(line);
      if (!res.isValid) {
        lineErrors[idx] = res.error;
        errors.push(`Line ${idx + 1}: ${res.error}`);
      }
      if (res.warning) {
        lineWarnings[idx] = res.warning;
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    lineErrors,
    lineWarnings,
  };
}

/**
 * Pure function to build the create_invoice payload with snake_case keys
 * and exact client totals calculated via calcInvoice.
 */
export function buildInvoicePayload({ header = {}, lines = [], roundToRupee = false } = {}) {
  // Normalize and parse lines
  const normalizedLines = lines.map((line, idx) => {
    const qtyMilli = typeof line.qty_milli === 'number' && line.qty_milli > 0
      ? line.qty_milli
      : parseQuantityToMilli(line.quantity ?? line.qty ?? line.qty_milli);

    const ratePaise = typeof line.rate_paise === 'number' && line.rate_paise >= 0
      ? line.rate_paise
      : parseRupeesToPaise(line.rate ?? line.rate_rupees ?? line.rate_paise);

    const gstPercent = Number(line.gst_percent ?? line.gstPercent ?? 0);

    return {
      line_no: idx + 1,
      description: String(line.description || '').trim(),
      hsn: line.hsn !== null && line.hsn !== undefined ? String(line.hsn).trim() : null,
      unit: String(line.unit || 'NOS').trim().toUpperCase(),
      qtyMilli,
      ratePaise,
      gstPercent,
      qty_milli: qtyMilli,
      rate_paise: ratePaise,
      gst_percent: gstPercent,
    };
  });

  // Calculate live invoice totals
  const invoiceCalc = calcInvoice(normalizedLines, { roundToRupee, interState: false });

  return {
    invoice_date: header.invoice_date,
    buyer_id: header.buyer_id || null,
    buyer_name: header.buyer_name,
    buyer_gstin: header.buyer_gstin,
    buyer_state_code: header.buyer_state_code || '33',
    buyer_address: header.buyer_address,
    buyer_order_no: String(header.buyer_order_no || '').trim(),
    buyer_order_date: header.buyer_order_date ? String(header.buyer_order_date).trim() : null,
    delivery_no: header.delivery_no !== undefined && header.delivery_no !== null && String(header.delivery_no).trim() !== ''
      ? String(header.delivery_no).trim()
      : null,
    delivery_date: header.delivery_date || null,
    despatched_through: String(header.despatched_through || '').trim(),
    destination: header.destination ? String(header.destination).trim() : null,
    terms_of_delivery: header.terms_of_delivery ? String(header.terms_of_delivery).trim() : null,
    taxable_paise: invoiceCalc.totalTaxablePaise,
    cgst_paise: invoiceCalc.totalCgstPaise,
    sgst_paise: invoiceCalc.totalSgstPaise,
    payable_paise: invoiceCalc.payablePaise,
    lines: invoiceCalc.lines.map((l, index) => ({
      line_no: index + 1,
      description: l.description,
      hsn: l.hsn,
      unit: l.unit,
      qty_milli: l.qtyMilli,
      rate_paise: l.ratePaise,
      gst_percent: l.gstPercent,
    })),
  };
}
