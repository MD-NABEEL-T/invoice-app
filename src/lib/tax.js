/**
 * Tax & Currency Calculation Utilities for GST Invoicing.
 * All monetary amounts are handled strictly in integer paise (1 Rupee = 100 paise)
 * to eliminate JavaScript IEEE-754 floating-point rounding errors.
 */

/**
 * Converts a rupee amount (string or number) to integer paise.
 * E.g., "1246.25" -> 124625, 625 -> 62500, "-0.25" -> -25
 */
export function rupeesToPaise(val) {
  if (val === null || val === undefined || val === '') return 0;
  const num = typeof val === 'number' ? val : parseFloat(String(val).replace(/,/g, ''));
  if (isNaN(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Converts integer paise back to a standard rupee decimal string.
 * E.g., 124625 -> "1246.25", 62500 -> "625.00", -25 -> "-0.25"
 */
export function paiseToRupees(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return '0.00';
  return (paise / 100).toFixed(2);
}

/**
 * GST Rounding Rule:
 * Indian GST rules compute tax on the consolidated taxable value per GST rate group,
 * rounding once to the nearest integer paise.
 * For intra-state (same-state) transactions, the rounded group tax is split into CGST & SGST:
 * CGST = floor(tax / 2), SGST = tax - CGST.
 * For inter-state transactions, the entire tax goes to IGST.
 * We NEVER round CGST and SGST halves separately to prevent single-paise drift.
 */
export function calcInvoice(lines = [], { interState = false, roundToRupee = false } = {}) {
  // Calculate per-line taxable amount in paise:
  // qtyMilli is integer thousandths (1 unit = 1000, 2.5 kg = 2500)
  const calculatedLines = lines.map((line) => {
    const qtyMilli = Number(line.qtyMilli || 0);
    const ratePaise = Number(line.ratePaise || 0);
    const gstPercent = Number(line.gstPercent || 0);
    const amountPaise = Math.round((qtyMilli * ratePaise) / 1000);

    return {
      ...line,
      qtyMilli,
      ratePaise,
      gstPercent,
      amountPaise,
    };
  });

  // Group by GST percent to calculate group tax
  const groupMap = new Map();
  for (const line of calculatedLines) {
    const currentTaxable = groupMap.get(line.gstPercent) || 0;
    groupMap.set(line.gstPercent, currentTaxable + line.amountPaise);
  }

  const rateGroups = [];
  let totalTaxablePaise = 0;
  let totalCgstPaise = 0;
  let totalSgstPaise = 0;
  let totalIgstPaise = 0;
  let totalTaxPaise = 0;

  // Process rate groups in ascending order of gstPercent
  const sortedPercents = Array.from(groupMap.keys()).sort((a, b) => a - b);

  for (const gstPercent of sortedPercents) {
    const taxablePaise = groupMap.get(gstPercent);
    totalTaxablePaise += taxablePaise;

    // Round tax once to nearest paise
    const groupTaxPaise = Math.round((taxablePaise * gstPercent) / 100);
    totalTaxPaise += groupTaxPaise;

    let cgstPaise = 0;
    let sgstPaise = 0;
    let igstPaise = 0;

    if (interState) {
      igstPaise = groupTaxPaise;
      totalIgstPaise += igstPaise;
    } else {
      cgstPaise = Math.floor(groupTaxPaise / 2);
      sgstPaise = groupTaxPaise - cgstPaise;
      totalCgstPaise += cgstPaise;
      totalSgstPaise += sgstPaise;
    }

    rateGroups.push({
      gstPercent,
      taxablePaise,
      cgstPaise,
      sgstPaise,
      igstPaise,
      taxPaise: groupTaxPaise,
    });
  }

  const grandTotalPaise = totalTaxablePaise + totalTaxPaise;
  let roundOffPaise = 0;
  let payablePaise = grandTotalPaise;

  if (roundToRupee) {
    // Round to nearest whole rupee (100 paise)
    payablePaise = Math.round(grandTotalPaise / 100) * 100;
    roundOffPaise = payablePaise - grandTotalPaise;
  }

  return {
    lines: calculatedLines,
    rateGroups,
    totalTaxablePaise,
    totalCgstPaise,
    totalSgstPaise,
    totalIgstPaise,
    totalTaxPaise,
    grandTotalPaise,
    roundOffPaise,
    payablePaise,
  };
}

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen'
];

const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'
];

function convertBelowThousand(n) {
  let str = '';
  if (n >= 100) {
    str += ONES[Math.floor(n / 100)] + ' Hundred';
    n %= 100;
    if (n > 0) str += ' ';
  }
  if (n > 0) {
    if (n < 20) {
      str += ONES[n];
    } else {
      str += TENS[Math.floor(n / 10)];
      if (n % 10 > 0) str += ' ' + ONES[n % 10];
    }
  }
  return str;
}

function convertNumberToWords(num) {
  if (num === 0) return 'Zero';

  let words = '';
  const crore = Math.floor(num / 10000000);
  num %= 10000000;

  const lakh = Math.floor(num / 100000);
  num %= 100000;

  const thousand = Math.floor(num / 1000);
  num %= 1000;

  const remainder = num;

  if (crore > 0) {
    words += convertNumberToWords(crore) + ' Crore ';
  }
  if (lakh > 0) {
    words += convertBelowThousand(lakh) + ' Lakh ';
  }
  if (thousand > 0) {
    words += convertBelowThousand(thousand) + ' Thousand ';
  }
  if (remainder > 0) {
    words += convertBelowThousand(remainder) + ' ';
  }

  return words.trim();
}

/**
 * Converts integer paise into Indian currency words format.
 * E.g., 124625 -> "Rupees One Thousand Two Hundred Forty Six and Twenty Five Paise Only"
 * E.g., 100 -> "Rupees One Only"
 * E.g., 0 -> "Rupees Zero Only"
 */
export function amountInWords(paise) {
  const totalPaise = Math.round(Number(paise) || 0);
  if (totalPaise === 0) return 'Rupees Zero Only';

  const isNegative = totalPaise < 0;
  const absPaise = Math.abs(totalPaise);

  const rupees = Math.floor(absPaise / 100);
  const remainingPaise = absPaise % 100;

  let result = isNegative ? 'Minus ' : '';

  if (rupees > 0) {
    result += 'Rupees ' + convertNumberToWords(rupees);
  } else {
    result += 'Rupees Zero';
  }

  if (remainingPaise > 0) {
    result += ' and ' + convertNumberToWords(remainingPaise) + ' Paise';
  }

  result += ' Only';
  return result;
}

/**
 * Returns financial year string e.g. "25-26" (FY begins on 1 April).
 */
export function financialYear(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0 = Jan, 2 = Mar, 3 = Apr

  // If before April (Jan, Feb, Mar), FY started previous calendar year
  const startYear = month >= 3 ? year : year - 1;
  const endYear = startYear + 1;

  const startStr = String(startYear).slice(-2);
  const endStr = String(endYear).slice(-2);

  return `${startStr}-${endStr}`;
}

/**
 * Formats running sequence number and FY into invoice string e.g. "048/25-26".
 * Padded to at least 3 digits.
 */
export function formatInvoiceNo(seqNumber, fy) {
  const numStr = String(seqNumber).padStart(3, '0');
  const fyStr = fy || financialYear();
  return `${numStr}/${fyStr}`;
}
