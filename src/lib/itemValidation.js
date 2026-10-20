import { rupeesToPaise } from './tax.js';

/**
 * Validates a GSTIN string.
 * Indian GSTIN is a 15-character alphanumeric code.
 * Warns if not exactly 15 characters.
 */
export function validateGSTIN(gstin) {
  if (!gstin || typeof gstin !== 'string') {
    return { isValid: false, warning: 'GSTIN is required' };
  }

  const cleaned = gstin.trim().toUpperCase();
  if (cleaned.length === 0) {
    return { isValid: false, warning: 'GSTIN cannot be empty' };
  }

  if (cleaned.length !== 15) {
    return {
      isValid: false,
      warning: `GSTIN has ${cleaned.length} characters (standard GSTIN is 15 characters)`,
    };
  }

  // Regex for standard Indian GSTIN format
  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(cleaned)) {
    return {
      isValid: true, // Warn, don't block
      warning: 'GSTIN format looks unusual (expected format like 33AAACR1714R1ZA)',
    };
  }

  return { isValid: true, warning: null };
}

/**
 * Validates an HSN code.
 * HSN should be 4, 6, or 8 digits. Warns if it is not, but never blocks.
 */
export function validateHSN(hsn) {
  if (!hsn || typeof hsn !== 'string' || hsn.trim() === '') {
    return { isValid: true, warning: 'HSN code is empty (needs checking)' };
  }

  const cleaned = hsn.trim();
  const digitRegex = /^(\d{4}|\d{6}|\d{8})$/;

  if (!digitRegex.test(cleaned)) {
    return {
      isValid: true, // Warn, don't block
      warning: `HSN "${cleaned}" is not 4, 6, or 8 digits`,
    };
  }

  return { isValid: true, warning: null };
}

/**
 * Validates an imported item row from the Excel sheet.
 * Row format expected from Excel:
 * Description / Items, Unit, HSN code, GST %, Usual rate (Rs), Confirmed (Y)
 */
export function validateImportRow(row = {}) {
  const errors = [];
  const warnings = [];

  // Description check
  const rawDesc = row.description || row.Description || row.Items || row.items || row['Item Name'] || '';
  const description = String(rawDesc).trim();

  if (!description) {
    errors.push('Item description is blank');
  }

  // Unit
  const rawUnit = row.unit || row.Unit || '';
  const unit = String(rawUnit).trim() || null;

  // HSN validation
  const rawHsn = row.hsn || row.HSN || row['HSN code'] || row['HSN Code'] || '';
  const hsn = String(rawHsn).trim() || null;
  if (hsn) {
    const hsnResult = validateHSN(hsn);
    if (hsnResult.warning) {
      warnings.push(hsnResult.warning);
    }
  }

  // GST %
  const rawGst = row.gst_percent ?? row.gst ?? row['GST %'] ?? row['GST%'] ?? null;
  let gstPercent = null;
  if (rawGst !== null && rawGst !== undefined && String(rawGst).trim() !== '') {
    const num = Number(rawGst);
    if (isNaN(num) || num < 0) {
      errors.push(`Invalid GST % "${rawGst}"`);
    } else {
      gstPercent = num;
    }
  }

  // Usual Rate
  const rawRate = row.usual_rate ?? row.rate ?? row['Usual rate (Rs)'] ?? row['Usual Rate'] ?? null;
  let defaultRatePaise = null;
  if (rawRate !== null && rawRate !== undefined && String(rawRate).trim() !== '') {
    const num = Number(String(rawRate).replace(/,/g, ''));
    if (isNaN(num) || num < 0) {
      errors.push(`Invalid rate amount "${rawRate}"`);
    } else {
      defaultRatePaise = rupeesToPaise(num);
    }
  }

  // Confirmed / Verified
  const rawConfirmed = row.confirmed || row.Confirmed || row['Confirmed (Y)'] || row.verified || '';
  const isConfirmed = String(rawConfirmed).trim().toUpperCase() === 'Y';

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    parsedItem: {
      description,
      unit,
      hsn,
      gst_percent: gstPercent,
      default_rate_paise: defaultRatePaise,
      verified: isConfirmed,
      active: true,
    },
  };
}
