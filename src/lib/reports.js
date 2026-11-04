import { paiseToRupees } from './tax.js';
import { formatDisplayDate } from './billUtils.js';
import { formatMilliToQuantity } from './billPayload.js';

/**
 * Formats integer paise into a decimal number suitable for Excel / reporting (e.g. 124625 -> 1246.25).
 */
export function paiseToNumber(paise) {
  if (paise === null || paise === undefined || isNaN(paise)) return 0;
  return Number((Number(paise) / 100).toFixed(2));
}

/**
 * 1. Generates HARDCOPY Buyer Statement rows from invoices.
 * Matches Uncle's legacy HARDCOPY Excel sheet.
 */
export function buildHardcopyStatementRows(invoices = []) {
  return invoices.map((inv) => {
    const isCancelled = inv.status === 'cancelled';
    const taxable = isCancelled ? 0 : paiseToNumber(inv.taxable_paise);
    const cgst = isCancelled ? 0 : paiseToNumber(inv.cgst_paise);
    const sgst = isCancelled ? 0 : paiseToNumber(inv.sgst_paise);
    const payable = isCancelled ? 0 : paiseToNumber(inv.payable_paise);

    return {
      'Invoice No': inv.invoice_no,
      'Invoice Date': formatDisplayDate(inv.invoice_date),
      'Buyer Name': inv.buyer_name || '',
      'PO / Order No': inv.buyer_order_no || '-',
      'PO Date': inv.buyer_order_date || '-',
      'DC / Delivery No': inv.delivery_no || '-',
      'Delivery Date': inv.delivery_date ? formatDisplayDate(inv.delivery_date) : '-',
      'Taxable Value (₹)': taxable,
      'CGST (₹)': cgst,
      'SGST (₹)': sgst,
      'Total Amount (₹)': payable,
      'Status': isCancelled ? 'CANCELLED' : 'FINAL',
    };
  });
}

/**
 * 2. Generates Monthly GST Sales Register rows from invoices.
 * Rate-wise breakdown (5%, 18%, etc.). Matches Uncle's GST sheet.
 */
export function buildGstRegisterRows(invoices = []) {
  return invoices
    .filter((inv) => inv.status !== 'cancelled')
    .map((inv) => {
      // Calculate rate breakdown for this invoice
      let taxable5 = 0;
      let cgst5 = 0;
      let sgst5 = 0;

      let taxable18 = 0;
      let cgst18 = 0;
      let sgst18 = 0;

      const lines = inv.lines || [];
      for (const line of lines) {
        const gstRate = Number(line.gst_percent ?? 0);
        const amountPaise = Number(
          line.amount_paise !== undefined && line.amount_paise !== null
            ? line.amount_paise
            : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
        );

        if (gstRate === 5) {
          taxable5 += amountPaise;
        } else if (gstRate === 18) {
          taxable18 += amountPaise;
        }
      }

      if (taxable5 > 0) {
        const tax5 = Math.round((taxable5 * 5) / 100);
        cgst5 = Math.floor(tax5 / 2);
        sgst5 = tax5 - cgst5;
      }

      if (taxable18 > 0) {
        const tax18 = Math.round((taxable18 * 18) / 100);
        cgst18 = Math.floor(tax18 / 2);
        sgst18 = tax18 - cgst18;
      }

      return {
        'Invoice No': inv.invoice_no,
        'Invoice Date': formatDisplayDate(inv.invoice_date),
        'Buyer Name': inv.buyer_name,
        'Buyer GSTIN': inv.buyer_gstin,
        '5% Taxable (₹)': paiseToNumber(taxable5),
        '5% CGST (₹)': paiseToNumber(cgst5),
        '5% SGST (₹)': paiseToNumber(sgst5),
        '18% Taxable (₹)': paiseToNumber(taxable18),
        '18% CGST (₹)': paiseToNumber(cgst18),
        '18% SGST (₹)': paiseToNumber(sgst18),
        'Total Taxable (₹)': paiseToNumber(inv.taxable_paise),
        'Total CGST (₹)': paiseToNumber(inv.cgst_paise),
        'Total SGST (₹)': paiseToNumber(inv.sgst_paise),
        'Total Tax (₹)': paiseToNumber((inv.cgst_paise || 0) + (inv.sgst_paise || 0)),
        'Invoice Total (₹)': paiseToNumber(inv.payable_paise),
      };
    });
}

/**
 * 3. Generates HSN Summary table rows across all active invoices in the period.
 * Groups by (HSN, GST Rate).
 */
export function buildHsnSummaryRows(invoices = []) {
  const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');
  const hsnMap = new Map();

  for (const inv of activeInvoices) {
    for (const line of inv.lines || []) {
      const hsn = String(line.hsn || '').trim() || 'OTHER';
      const gstPercent = Number(line.gst_percent ?? 0);
      const unit = String(line.unit || 'NOS').trim().toUpperCase();
      const desc = String(line.description || '').trim();
      const key = `${hsn}_${gstPercent}_${unit}`;

      const amountPaise = Number(
        line.amount_paise !== undefined && line.amount_paise !== null
          ? line.amount_paise
          : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
      );

      const qtyMilli = Number(line.qty_milli || 0);

      const existing = hsnMap.get(key) || {
        hsn,
        description: desc,
        gstPercent,
        unit,
        totalQtyMilli: 0,
        taxablePaise: 0,
      };

      existing.totalQtyMilli += qtyMilli;
      existing.taxablePaise += amountPaise;
      hsnMap.set(key, existing);
    }
  }

  const rows = Array.from(hsnMap.values()).map((entry) => {
    const taxPaise = Math.round((entry.taxablePaise * entry.gstPercent) / 100);
    const cgstPaise = Math.floor(taxPaise / 2);
    const sgstPaise = taxPaise - cgstPaise;

    return {
      'HSN / SAC': entry.hsn,
      'Description / Sample Item': entry.description,
      'Total Quantity': formatMilliToQuantity(entry.totalQtyMilli),
      'Unit': entry.unit,
      'GST Rate': `${entry.gstPercent}%`,
      'Taxable Value (₹)': paiseToNumber(entry.taxablePaise),
      'Central Tax CGST (₹)': paiseToNumber(cgstPaise),
      'State Tax SGST (₹)': paiseToNumber(sgstPaise),
      'Total Tax (₹)': paiseToNumber(taxPaise),
    };
  });

  return rows.sort((a, b) => a['HSN / SAC'].localeCompare(b['HSN / SAC']));
}

/**
 * 4. Exports all three reports into an Excel (.xlsx) workbook.
 */
export async function exportMonthEndExcel({ invoices = [], periodTitle = 'Monthly' }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 1. HARDCOPY Statement Sheet
  const hardcopyRows = buildHardcopyStatementRows(invoices);
  const wsHardcopy = XLSX.utils.json_to_sheet(hardcopyRows);
  XLSX.utils.book_append_sheet(wb, wsHardcopy, 'Hardcopy Statement');

  // 2. GST Sales Register Sheet
  const gstRows = buildGstRegisterRows(invoices);
  const wsGst = XLSX.utils.json_to_sheet(gstRows);
  XLSX.utils.book_append_sheet(wb, wsGst, 'GST Sales Register');

  // 3. HSN Summary Sheet
  const hsnRows = buildHsnSummaryRows(invoices);
  const wsHsn = XLSX.utils.json_to_sheet(hsnRows);
  XLSX.utils.book_append_sheet(wb, wsHsn, 'HSN Summary');

  // Safe filename
  const cleanTitle = periodTitle.replace(/[/\\:*?"<>|\s]/g, '_');
  const filename = `Khansa_GST_Report_${cleanTitle}.xlsx`;

  XLSX.writeFile(wb, filename);
  return { success: true, filename };
}

/**
 * Maps common unit abbreviations to official GST UQC (Unit Quantity Code).
 */
export function mapUnitToUqc(unit) {
  const u = String(unit || '').trim().toUpperCase();
  const uqcMap = {
    PCS: 'PCS-PIECES',
    PC: 'PCS-PIECES',
    NOS: 'NOS-NUMBERS',
    NO: 'NOS-NUMBERS',
    KG: 'KGS-KILOGRAMS',
    KGS: 'KGS-KILOGRAMS',
    BOX: 'BOX-BOXES',
    PKT: 'PAC-PACKETS',
    PAC: 'PAC-PACKETS',
    SET: 'SET-SETS',
    ROLL: 'ROL-ROLLS',
    ROL: 'ROL-ROLLS',
    MTR: 'MTR-METERS',
    MTRS: 'MTR-METERS',
    BAG: 'BAG-BAGS',
    BTL: 'BTL-BOTTLES',
    PRS: 'PRS-PAIRS',
    PAIRS: 'PRS-PAIRS',
  };
  return uqcMap[u] || `${u}-OTHERS`;
}

/**
 * 5. Generates official GSTR-1 B2B sheet rows.
 * Rate-wise rows matching the official GST Portal GSTR-1 Offline Tool Excel template.
 */
export function buildGstr1B2bRows(invoices = []) {
  const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');
  const rows = [];

  for (const inv of activeInvoices) {
    const lines = inv.lines || [];
    const totalInvoiceVal = paiseToNumber(inv.payable_paise);
    const pos = inv.buyer_state_code ? `${inv.buyer_state_code}-Tamil Nadu` : '33-Tamil Nadu';

    // Group lines by gst_percent
    const rateMap = new Map();
    for (const line of lines) {
      const rate = Number(line.gst_percent ?? 5);
      const amountPaise = Number(
        line.amount_paise !== undefined && line.amount_paise !== null
          ? line.amount_paise
          : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
      );
      rateMap.set(rate, (rateMap.get(rate) || 0) + amountPaise);
    }

    if (rateMap.size === 0) {
      rateMap.set(5, Number(inv.taxable_paise || 0));
    }

    for (const [rate, taxablePaise] of rateMap.entries()) {
      rows.push({
        'GSTIN/UIN of Recipient': inv.buyer_gstin || '',
        'Receiver Name': inv.buyer_name || '',
        'Invoice Number': inv.invoice_no || '',
        'Invoice date': formatDisplayDate(inv.invoice_date),
        'Invoice Value': totalInvoiceVal,
        'Place Of Supply': pos,
        'Reverse Charge': 'N',
        'Applicable % of Tax Rate': '',
        'Invoice Type': 'Regular',
        'E-Commerce GSTIN': '',
        'Rate': rate,
        'Taxable Value': paiseToNumber(taxablePaise),
        'Cess Amount': 0,
      });
    }
  }

  return rows;
}

/**
 * 6. Generates official GSTR-1 Table 12 HSN Summary rows.
 */
export function buildGstr1HsnRows(invoices = []) {
  const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');
  const hsnMap = new Map();

  for (const inv of activeInvoices) {
    const isInterState = inv.buyer_state_code && inv.buyer_state_code !== '33';

    for (const line of inv.lines || []) {
      const hsn = String(line.hsn || '').trim() || '4107';
      const desc = String(line.description || '').trim();
      const unit = String(line.unit || 'PCS').trim().toUpperCase();
      const uqc = mapUnitToUqc(unit);
      const rate = Number(line.gst_percent ?? 5);
      const key = `${hsn}_${rate}_${uqc}`;

      const amountPaise = Number(
        line.amount_paise !== undefined && line.amount_paise !== null
          ? line.amount_paise
          : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
      );
      const qtyMilli = Number(line.qty_milli || 0);

      const existing = hsnMap.get(key) || {
        hsn,
        description: desc,
        uqc,
        rate,
        totalQtyMilli: 0,
        taxablePaise: 0,
        isInterState,
      };

      existing.totalQtyMilli += qtyMilli;
      existing.taxablePaise += amountPaise;
      hsnMap.set(key, existing);
    }
  }

  const rows = Array.from(hsnMap.values()).map((entry) => {
    const taxPaise = Math.round((entry.taxablePaise * entry.rate) / 100);
    const totalValPaise = entry.taxablePaise + taxPaise;

    let igstPaise = 0;
    let cgstPaise = 0;
    let sgstPaise = 0;

    if (entry.isInterState) {
      igstPaise = taxPaise;
    } else {
      cgstPaise = Math.floor(taxPaise / 2);
      sgstPaise = taxPaise - cgstPaise;
    }

    return {
      'HSN': entry.hsn,
      'Description': entry.description,
      'UQC': entry.uqc,
      'Total Quantity': Number(formatMilliToQuantity(entry.totalQtyMilli)) || 0,
      'Total Value': paiseToNumber(totalValPaise),
      'Rate': entry.rate,
      'Taxable Value': paiseToNumber(entry.taxablePaise),
      'Integrated Tax Amount': paiseToNumber(igstPaise),
      'Central Tax Amount': paiseToNumber(cgstPaise),
      'State/UT Tax Amount': paiseToNumber(sgstPaise),
      'Cess Amount': 0,
    };
  });

  return rows.sort((a, b) => a.HSN.localeCompare(b.HSN));
}

/**
 * 7. Generates GSTR-1 Table 13 Documents Summary rows.
 */
export function buildGstr1DocsRows(invoices = []) {
  if (invoices.length === 0) {
    return [
      {
        'Nature of Document': 'Invoices for outward supply',
        'Sr. No. From': '-',
        'Sr. No. To': '-',
        'Total Number': 0,
        'Cancelled': 0,
      },
    ];
  }

  const sorted = [...invoices].sort((a, b) => (a.number || 0) - (b.number || 0));
  const fromInv = sorted[0]?.invoice_no || '-';
  const toInv = sorted[sorted.length - 1]?.invoice_no || '-';
  const cancelledCount = invoices.filter((i) => i.status === 'cancelled').length;

  return [
    {
      'Nature of Document': 'Invoices for outward supply',
      'Sr. No. From': fromInv,
      'Sr. No. To': toInv,
      'Total Number': invoices.length,
      'Cancelled': cancelledCount,
    },
  ];
}

/**
 * 8. Exports auditor-ready GSTR-1 workbook (.xlsx) matching GST portal format.
 */
export async function exportGstr1Excel({ invoices = [], periodTitle = 'Monthly' }) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();

  // 1. b2b sheet
  const b2bRows = buildGstr1B2bRows(invoices);
  const wsB2b = XLSX.utils.json_to_sheet(b2bRows);
  XLSX.utils.book_append_sheet(wb, wsB2b, 'b2b');

  // 2. hsn sheet
  const hsnRows = buildGstr1HsnRows(invoices);
  const wsHsn = XLSX.utils.json_to_sheet(hsnRows);
  XLSX.utils.book_append_sheet(wb, wsHsn, 'hsn');

  // 3. docs sheet
  const docsRows = buildGstr1DocsRows(invoices);
  const wsDocs = XLSX.utils.json_to_sheet(docsRows);
  XLSX.utils.book_append_sheet(wb, wsDocs, 'docs');

  // Clean filename
  const cleanTitle = periodTitle.replace(/[/\\:*?"<>|\s]/g, '_');
  const filename = `Khansa_GSTR1_Portal_${cleanTitle}.xlsx`;

  XLSX.writeFile(wb, filename);
  return { success: true, filename };
}
