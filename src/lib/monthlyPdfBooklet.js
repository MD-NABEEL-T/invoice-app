import { jsPDF } from 'jspdf';
import { paiseToRupees } from './tax.js';
import { formatDisplayDate } from './billUtils.js';
import { formatMilliToQuantity, numberToWordsIndian } from './billPayload.js';

/**
 * Generates a compiled, multi-page A4 PDF booklet containing:
 * - Page 1: Monthly Invoices Cover & Tax Summary Register
 * - Pages 2..N: Official A4 GST Tax Invoices for each individual bill
 *
 * @param {Object} params
 * @param {Array} params.invoices - List of invoice records for the month
 * @param {string} params.periodTitle - e.g. 'October 2026' or 'FY_26-27_October'
 * @param {Object} [params.firm] - Firm profile info
 */
export async function generateMonthlyPdfBooklet({
  invoices = [],
  periodTitle = 'Monthly Invoices',
  firm = {
    name: 'KHANSA ENTERPRISES',
    address: '1/19, MOSQUE STREET, MELVISHARAM - 632 509, RANIPET DIST., TAMIL NADU',
    gstin: '33AGXPF4947Q1ZH',
    state: 'Tamil Nadu',
    stateCode: '33',
    bankName: 'INDIAN OVERSEAS BANK',
    branch: 'MELVISHARAM',
    accountNo: '005402000001850',
    ifsc: 'IOBA0000054',
  },
}) {
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 12;
  const contentWidth = pageWidth - margin * 2;

  const activeInvoices = invoices.filter((inv) => inv.status !== 'cancelled');
  const cancelledInvoices = invoices.filter((inv) => inv.status === 'cancelled');

  const totalTaxable = activeInvoices.reduce((s, i) => s + (Number(i.taxable_paise) || 0), 0);
  const totalCgst = activeInvoices.reduce((s, i) => s + (Number(i.cgst_paise) || 0), 0);
  const totalSgst = activeInvoices.reduce((s, i) => s + (Number(i.sgst_paise) || 0), 0);
  const totalPayable = activeInvoices.reduce((s, i) => s + (Number(i.payable_paise) || 0), 0);

  // ===========================================================================
  // PAGE 1: COVER SHEET & MONTHLY SALES SUMMARY REGISTER
  // ===========================================================================
  pdf.setFillColor(15, 23, 42); // slate-900
  pdf.rect(margin, margin, contentWidth, 22, 'F');

  pdf.setTextColor(255, 255, 255);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(14);
  pdf.text(firm.name, margin + 4, margin + 8);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8.5);
  pdf.text(`GSTIN: ${firm.gstin} | ${firm.address.replace(/\n/g, ' ')}`, margin + 4, margin + 14);
  pdf.text(`Monthly Tax Invoices Booklet &bull; Period: ${periodTitle}`, margin + 4, margin + 19);

  // Summary Metrics Banner
  let y = margin + 27;
  pdf.setFillColor(248, 250, 252); // slate-50
  pdf.rect(margin, y, contentWidth, 20, 'F');
  pdf.setDrawColor(203, 213, 225); // slate-300
  pdf.setLineWidth(0.3);
  pdf.rect(margin, y, contentWidth, 20, 'D');

  const colW = contentWidth / 4;
  pdf.setTextColor(71, 85, 105);
  pdf.setFontSize(7.5);
  pdf.setFont('helvetica', 'bold');
  pdf.text('TOTAL INVOICES', margin + 3, y + 6);
  pdf.text('TOTAL TAXABLE', margin + colW + 3, y + 6);
  pdf.text('TOTAL GST (CGST+SGST)', margin + colW * 2 + 3, y + 6);
  pdf.text('TOTAL PAYABLE', margin + colW * 3 + 3, y + 6);

  pdf.setTextColor(15, 23, 42);
  pdf.setFontSize(10.5);
  pdf.text(`${activeInvoices.length} Active${cancelledInvoices.length > 0 ? ` (${cancelledInvoices.length} Can.)` : ''}`, margin + 3, y + 14);
  pdf.text(`Rs. ${paiseToRupees(totalTaxable)}`, margin + colW + 3, y + 14);
  pdf.text(`Rs. ${paiseToRupees(totalCgst + totalSgst)}`, margin + colW * 2 + 3, y + 14);
  pdf.text(`Rs. ${paiseToRupees(totalPayable)}`, margin + colW * 3 + 3, y + 14);

  // Invoices Index Table Header
  y += 26;
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.setTextColor(15, 23, 42);
  pdf.text('Monthly Invoices Index', margin, y);

  y += 4;
  pdf.setFillColor(226, 232, 240); // slate-200
  pdf.rect(margin, y, contentWidth, 7, 'F');
  pdf.setFontSize(7.5);
  pdf.text('#', margin + 2, y + 5);
  pdf.text('Invoice No', margin + 10, y + 5);
  pdf.text('Date', margin + 36, y + 5);
  pdf.text('Buyer Name', margin + 58, y + 5);
  pdf.text('Taxable (Rs.)', margin + 115, y + 5);
  pdf.text('GST (Rs.)', margin + 143, y + 5);
  pdf.text('Total (Rs.)', margin + 168, y + 5);

  y += 7;
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(7.5);

  invoices.forEach((inv, idx) => {
    if (y > pageHeight - 20) {
      pdf.addPage();
      y = margin + 5;
    }
    const isCancelled = inv.status === 'cancelled';
    const bg = idx % 2 === 0 ? 255 : 248;
    pdf.setFillColor(bg, bg, bg);
    pdf.rect(margin, y, contentWidth, 6, 'F');

    pdf.setTextColor(isCancelled ? 180 : 30, 30, 30);
    pdf.text(String(idx + 1), margin + 2, y + 4.2);
    pdf.text(String(inv.invoice_no || '-'), margin + 10, y + 4.2);
    pdf.text(formatDisplayDate(inv.invoice_date), margin + 36, y + 4.2);

    const buyerTrunc = String(inv.buyer_name || '').slice(0, 30);
    pdf.text(buyerTrunc, margin + 58, y + 4.2);

    if (isCancelled) {
      pdf.setTextColor(220, 38, 38);
      pdf.text('CANCELLED', margin + 143, y + 4.2);
    } else {
      pdf.text(paiseToRupees(inv.taxable_paise), margin + 115, y + 4.2);
      pdf.text(paiseToRupees((inv.cgst_paise || 0) + (inv.sgst_paise || 0)), margin + 143, y + 4.2);
      pdf.text(paiseToRupees(inv.payable_paise), margin + 168, y + 4.2);
    }
    y += 6;
  });

  // Footer on cover
  pdf.setFontSize(7);
  pdf.setTextColor(148, 163, 184);
  pdf.text(
    `Generated by Khansa Enterprises GST Invoicing System &bull; Page 1 of ${invoices.length + 1}`,
    pageWidth / 2,
    pageHeight - 8,
    { align: 'center' }
  );

  // ===========================================================================
  // PAGES 2..N: INDIVIDUAL A4 GST TAX INVOICES
  // ===========================================================================
  for (let idx = 0; idx < invoices.length; idx++) {
    const inv = invoices[idx];
    pdf.addPage();

    const isCancelled = inv.status === 'cancelled';

    // Outer border
    pdf.setDrawColor(51, 65, 85);
    pdf.setLineWidth(0.4);
    pdf.rect(margin, margin, contentWidth, pageHeight - margin * 2, 'D');

    // Title Bar
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, margin, contentWidth, 10, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.setTextColor(15, 23, 42);
    pdf.text('TAX INVOICE', pageWidth / 2, margin + 7, { align: 'center' });

    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('ORIGINAL FOR RECIPIENT', pageWidth - margin - 3, margin + 7, { align: 'right' });

    // Cancelled watermark if cancelled
    if (isCancelled) {
      pdf.setTextColor(239, 68, 68);
      pdf.setFontSize(40);
      pdf.setFont('helvetica', 'bold');
      pdf.text('CANCELLED', pageWidth / 2, 140, { align: 'center', angle: 45 });
    }

    // Header 2-column: Supplier Info (Left) | Invoice Meta (Right)
    const headerTop = margin + 10;
    const splitX = margin + contentWidth * 0.52;

    // Left: Supplier details
    pdf.setTextColor(15, 23, 42);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(11);
    pdf.text(firm.name, margin + 3, headerTop + 6);

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7.5);
    pdf.text(firm.address, margin + 3, headerTop + 11);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`GSTIN / UIN: ${firm.gstin}`, margin + 3, headerTop + 22);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`State Name: ${firm.state}, Code: ${firm.stateCode}`, margin + 3, headerTop + 26);

    // Right: Invoice No, Date, Orders
    pdf.line(splitX, headerTop, splitX, headerTop + 30);
    pdf.line(margin, headerTop + 30, margin + contentWidth, headerTop + 30);

    const rightCol = splitX + 3;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Invoice No.', rightCol, headerTop + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.invoice_no || '-', rightCol + 25, headerTop + 5);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Dated', rightCol + 55, headerTop + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(formatDisplayDate(inv.invoice_date), rightCol + 66, headerTop + 5);

    pdf.line(splitX, headerTop + 7.5, margin + contentWidth, headerTop + 7.5);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Delivery Note', rightCol, headerTop + 12);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.delivery_no || '-', rightCol + 25, headerTop + 12);

    pdf.line(splitX, headerTop + 15, margin + contentWidth, headerTop + 15);

    pdf.setFont('helvetica', 'bold');
    pdf.text("Buyer's Order No.", rightCol, headerTop + 19.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.buyer_order_no || '-', rightCol + 25, headerTop + 19.5);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Dated', rightCol + 55, headerTop + 19.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.buyer_order_date || '-', rightCol + 66, headerTop + 19.5);

    pdf.line(splitX, headerTop + 22.5, margin + contentWidth, headerTop + 22.5);

    pdf.setFont('helvetica', 'bold');
    pdf.text('Despatched through', rightCol, headerTop + 27);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.despatched_through || '-', rightCol + 30, headerTop + 27);

    // Buyer (Bill to) section
    const buyerTop = headerTop + 30;
    pdf.line(margin, buyerTop + 24, margin + contentWidth, buyerTop + 24);

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(8);
    pdf.text('Buyer (Bill to):', margin + 3, buyerTop + 5);
    pdf.setFontSize(9.5);
    pdf.text(inv.buyer_name || 'KH EXPORT INDIA PRIVATE LTD', margin + 3, buyerTop + 10);
    pdf.setFontSize(7.5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(inv.buyer_address || 'MELVISHARAM, TAMIL NADU', margin + 3, buyerTop + 14.5);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`GSTIN/UIN: ${inv.buyer_gstin || '-'}    State: Tamil Nadu, Code: 33`, margin + 3, buyerTop + 20);

    // Items Table
    const tableTop = buyerTop + 24;
    pdf.setFillColor(241, 245, 249);
    pdf.rect(margin, tableTop, contentWidth, 7, 'F');
    pdf.line(margin, tableTop + 7, margin + contentWidth, tableTop + 7);

    // Column positions
    const colSno = margin + 2;
    const colDesc = margin + 10;
    const colHsn = margin + 85;
    const colQty = margin + 115;
    const colRate = margin + 142;
    const colAmt = margin + 168;

    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('Sl', colSno, tableTop + 5);
    pdf.text('Description of Goods', colDesc, tableTop + 5);
    pdf.text('HSN/SAC', colHsn, tableTop + 5);
    pdf.text('Quantity', colQty, tableTop + 5);
    pdf.text('Rate', colRate, tableTop + 5);
    pdf.text('Amount (Rs.)', colAmt, tableTop + 5);

    // Vertical column gridlines
    const tableBottom = 220;
    [colDesc - 2, colHsn - 3, colQty - 3, colRate - 3, colAmt - 3].forEach((gx) => {
      pdf.line(gx, tableTop, gx, tableBottom);
    });

    let itemY = tableTop + 12;
    const lines = inv.lines || [];
    pdf.setFont('helvetica', 'normal');

    lines.forEach((l, lIdx) => {
      const q = formatMilliToQuantity(l.qty_milli) || l.quantity || '1';
      const u = l.unit || 'PCS';
      const r = paiseToRupees(l.rate_paise) || l.rate || '0.00';
      const amtPaise = l.amount_paise || Math.round(((l.qty_milli || 0) * (l.rate_paise || 0)) / 1000);

      pdf.text(String(lIdx + 1), colSno, itemY);
      pdf.text(String(l.description || '-').slice(0, 38), colDesc, itemY);
      pdf.text(String(l.hsn || '-'), colHsn, itemY);
      pdf.text(`${q} ${u}`, colQty, itemY);
      pdf.text(String(r), colRate, itemY);
      pdf.text(paiseToRupees(amtPaise), colAmt, itemY);
      itemY += 6.5;
    });

    // Subtotal tax line
    if (!isCancelled) {
      if (inv.cgst_paise > 0) {
        pdf.text('Output CGST 2.5%', colDesc, itemY);
        pdf.text(paiseToRupees(inv.cgst_paise), colAmt, itemY);
        itemY += 5.5;
      }
      if (inv.sgst_paise > 0) {
        pdf.text('Output SGST 2.5%', colDesc, itemY);
        pdf.text(paiseToRupees(inv.sgst_paise), colAmt, itemY);
        itemY += 5.5;
      }
    }

    // Bottom border of items table
    pdf.line(margin, tableBottom, margin + contentWidth, tableBottom);

    // Total row
    pdf.setFillColor(248, 250, 252);
    pdf.rect(margin, tableBottom, contentWidth, 7, 'F');
    pdf.setFont('helvetica', 'bold');
    pdf.text('Total', colDesc, tableBottom + 5);
    pdf.text(`Rs. ${paiseToRupees(inv.payable_paise)}`, colAmt, tableBottom + 5);

    // Amount in Words
    const wordsY = tableBottom + 7;
    pdf.line(margin, wordsY, margin + contentWidth, wordsY);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(7.5);
    pdf.text('Amount Chargeable (in words):', margin + 3, wordsY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`INR ${numberToWordsIndian(inv.payable_paise)} Only`, margin + 3, wordsY + 9);

    pdf.line(margin, wordsY + 12, margin + contentWidth, wordsY + 12);

    // Bank Details & Signature
    const bankY = wordsY + 12;
    pdf.setFont('helvetica', 'bold');
    pdf.text('Company Bank Details:', margin + 3, bankY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text(`Bank: ${firm.bankName}`, margin + 3, bankY + 9.5);
    pdf.text(`A/c No.: ${firm.accountNo}`, margin + 3, bankY + 14);
    pdf.text(`Branch & IFSC: ${firm.branch} & ${firm.ifsc}`, margin + 3, bankY + 18.5);

    // Signatory box
    const signX = margin + contentWidth * 0.6;
    pdf.line(signX, bankY, signX, pageHeight - margin);
    pdf.setFont('helvetica', 'bold');
    pdf.text(`for ${firm.name}`, signX + 4, bankY + 5);
    pdf.setFont('helvetica', 'normal');
    pdf.text('Authorised Signatory', signX + 4, pageHeight - margin - 4);

    // Page number
    pdf.setFontSize(7);
    pdf.setTextColor(148, 163, 184);
    pdf.text(
      `Khansa Enterprises &bull; Invoice ${inv.invoice_no || '-'} &bull; Page ${idx + 2} of ${invoices.length + 1}`,
      pageWidth / 2,
      pageHeight - margin + 3,
      { align: 'center' }
    );
  }

  // Generate & save
  const cleanTitle = periodTitle.replace(/[/\\:*?"<>|\s]/g, '_');
  const filename = `Khansa_Enterprises_Monthly_Invoices_${cleanTitle}.pdf`;
  pdf.save(filename);

  return { success: true, filename, pageCount: invoices.length + 1 };
}
