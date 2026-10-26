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
