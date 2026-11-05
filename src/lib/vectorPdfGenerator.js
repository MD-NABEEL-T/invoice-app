import { jsPDF } from 'jspdf';
import { registerCarlitoFont } from './fonts/carlito.js';
import { formatDisplayDate } from './billUtils.js';
import { formatMilliToQuantity, numberToWordsIndian } from './billPayload.js';
import { getHsnSummaryRows, getRateGroupSummary, formatPlainAmount, paginateInvoiceLines } from './invoiceLayout.js';

const DEFAULT_FIRM = {
  name: 'KHANSA ENTERPRISES',
  address: '#158,Pudhupet 3rd Street,\nMELVISHARAM-632509\nRanipet District\nTamil Nadu.',
  gstin: '33AGXPF4947Q1ZH',
  email: 'mohammedafzalarni@yahoo.com',
  phone: '8300533896/9342614838',
  declaration: 'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct',
};

// 8 Columns (mm) from Excel: A:18.2, B:45.7, C:24.0, D:11.1, E:26.1, F:20.9, G:21.1, H:30.2 = 197.3 mm total
export const COL_WIDTHS = [18.2, 45.7, 24.0, 11.1, 26.1, 20.9, 21.1, 30.2];
export const MARGIN = 6.35;
export const PAGE_WIDTH = 210;
export const PAGE_HEIGHT = 297;
export const CONTENT_WIDTH = 197.3;

export const COL_X = [
  MARGIN, // 6.35 (Col A start)
  MARGIN + COL_WIDTHS[0], // 24.55 (Col B start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1], // 70.25 (Col C start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2], // 94.25 (Col D start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3], // 105.35 (Col E start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3] + COL_WIDTHS[4], // 131.45 (Col F start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3] + COL_WIDTHS[4] + COL_WIDTHS[5], // 152.35 (Col G start)
  MARGIN + COL_WIDTHS[0] + COL_WIDTHS[1] + COL_WIDTHS[2] + COL_WIDTHS[3] + COL_WIDTHS[4] + COL_WIDTHS[5] + COL_WIDTHS[6], // 173.45 (Col H start)
  MARGIN + CONTENT_WIDTH, // 203.65 (Col H end)
];

function drawBox(doc, x, y, w, h) {
  doc.rect(x, y, w, h);
}

function toDisplayDate(val) {
  if (!val) return '-';
  const str = String(val).trim();
  if (str.includes('\n')) {
    return str.split('\n').map((part) => toDisplayDate(part)).join('\n');
  }
  return formatDisplayDate(str) || str;
}

/**
 * Builds the official legal A4 PDF matching Excel Book1.xlsx sheet 230 exactly.
 */
export function buildVectorInvoicePdf(invoice, firmProfile = null, options = {}) {
  const firm = firmProfile || DEFAULT_FIRM;
  const copyLabel = options.copyLabel || '';
  const isCancelled = invoice?.status === 'cancelled';

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  registerCarlitoFont(doc);
  const fontName = doc.getFontList()['Carlito'] ? 'Carlito' : 'Helvetica';

  doc.setDrawColor(0, 0, 0);
  doc.setTextColor(0, 0, 0);
  doc.setLineWidth(0.176); // 0.5 pt

  const lines = invoice?.lines || [];
  const rateGroups = getRateGroupSummary(lines);
  const hsnSummary = getHsnSummaryRows(lines);

  // Paginate invoice lines using strict single/multi page capacity
  const pages = paginateInvoiceLines(lines, {
    singlePageCapacity: 8,
    middlePageCapacity: 14,
    lastPageCapacity: 7,
  });

  const totalPages = pages.length;

  for (let pIdx = 0; pIdx < totalPages; pIdx++) {
    if (pIdx > 0) doc.addPage('a4', 'portrait');

    const pageInfo = pages[pIdx];
    const isFirst = pageInfo.isFirst;
    const isLast = pageInfo.isLast;
    const currentLines = pageInfo.lines;

    let y = MARGIN;

    // Optional Copy Label in top margin
    if (copyLabel) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(8.5);
      doc.text(copyLabel.toUpperCase(), COL_X[8], y - 1.5, { align: 'right' });
    }

    // -------------------------------------------------------------
    // ROW 1 (5.6 mm): "TAX INVOICE" bold, centered across A:H, bottom border only
    // -------------------------------------------------------------
    const row1H = 5.6;
    doc.line(COL_X[0], y + row1H, COL_X[8], y + row1H); // bottom border only
    doc.setFont(fontName, 'bold');
    doc.setFontSize(13);
    doc.text('TAX INVOICE', COL_X[0] + CONTENT_WIDTH / 2, y + 4.2, { align: 'center' });
    y += row1H;

    // -------------------------------------------------------------
    // ROWS 2-4: Left block A:B merged (45.2 mm tall, boxed, centered, top-aligned)
    // Firm name 12pt bold, address/GSTIN 11pt bold, email 10pt bold, cell 11pt bold
    // Right side C:H, 4 fully boxed cells per row, bold, top-left aligned:
    // [label C][value D:E merged][label F][value G:H merged]
    // -------------------------------------------------------------
    const row2H = 17.7;
    const row3H = 17.7;
    const row4H = 9.8;
    const block1H = row2H + row3H + row4H; // 45.2 mm

    const leftW = COL_X[2] - COL_X[0]; // 63.9 mm (A:B)
    drawBox(doc, COL_X[0], y, leftW, block1H);

    // Left Block Firm Details
    let fY = y + 4.8;
    doc.setFont(fontName, 'bold');
    doc.setFontSize(12);
    doc.text((firm.name || 'KHANSA ENTERPRISES').toUpperCase(), COL_X[0] + leftW / 2, fY, { align: 'center' });

    fY += 4.5;
    doc.setFontSize(11);
    const addrLines = (firm.address || '').split('\n');
    addrLines.forEach((al) => {
      if (al.trim()) {
        doc.text(al.trim(), COL_X[0] + leftW / 2, fY, { align: 'center' });
        fY += 4.2;
      }
    });

    doc.text(`GSTIN/UIN:${firm.gstin || '33AGXPF4947Q1ZH'}`, COL_X[0] + leftW / 2, fY, { align: 'center' });
    fY += 4.2;

    if (firm.email) {
      doc.setFontSize(10);
      doc.text(`Email:${firm.email}`, COL_X[0] + leftW / 2, fY, { align: 'center' });
      fY += 4.2;
    }
    if (firm.phone) {
      doc.setFontSize(11);
      doc.text(`Cell:${firm.phone}`, COL_X[0] + leftW / 2, fY, { align: 'center' });
    }

    // Right Side C:H Rows 2-4
    let rY = y;
    const deW = COL_WIDTHS[3] + COL_WIDTHS[4]; // 37.2 mm
    const ghW = COL_WIDTHS[6] + COL_WIDTHS[7]; // 51.3 mm

    // Row 2 (17.7 mm): INVOICE No: | no ; Dated: | date
    drawBox(doc, COL_X[2], rY, COL_WIDTHS[2], row2H);
    drawBox(doc, COL_X[3], rY, deW, row2H);
    drawBox(doc, COL_X[5], rY, COL_WIDTHS[5], row2H);
    drawBox(doc, COL_X[6], rY, ghW, row2H);

    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('INVOICE No:', COL_X[2] + 1.5, rY + 4.8);
    doc.text(invoice.invoice_no || '-', COL_X[3] + 2, rY + 4.8);
    doc.text('Dated:', COL_X[5] + 1.5, rY + 4.8);
    doc.text(toDisplayDate(invoice.invoice_date), COL_X[6] + 2, rY + 4.8);
    rY += row2H;

    // Row 3 (17.7 mm): Buyer Order: | order no (supports multiline) ; Dated: | date (supports multiline)
    drawBox(doc, COL_X[2], rY, COL_WIDTHS[2], row3H);
    drawBox(doc, COL_X[3], rY, deW, row3H);
    drawBox(doc, COL_X[5], rY, COL_WIDTHS[5], row3H);
    drawBox(doc, COL_X[6], rY, ghW, row3H);

    doc.text('Buyer Order:', COL_X[2] + 1.5, rY + 4.8);
    const orderLines = (invoice.buyer_order_no || '-').split('\n');
    let boY = rY + 4.8;
    orderLines.forEach((ol) => {
      doc.text(ol.trim(), COL_X[3] + 2, boY);
      boY += 4.5;
    });

    doc.text('Dated:', COL_X[5] + 1.5, rY + 4.8);
    const orderDateLines = (invoice.buyer_order_date ? toDisplayDate(invoice.buyer_order_date) : '-').split('\n');
    let bodY = rY + 4.8;
    orderDateLines.forEach((odl) => {
      doc.text(odl.trim(), COL_X[6] + 2, bodY);
      bodY += 4.5;
    });
    rY += row3H;

    // Row 4 (9.8 mm): Delivery No: | no ; Delivery Dt: | date
    drawBox(doc, COL_X[2], rY, COL_WIDTHS[2], row4H);
    drawBox(doc, COL_X[3], rY, deW, row4H);
    drawBox(doc, COL_X[5], rY, COL_WIDTHS[5], row4H);
    drawBox(doc, COL_X[6], rY, ghW, row4H);

    doc.text('Delivery No:', COL_X[2] + 1.5, rY + 5.5);
    doc.text(invoice.delivery_no || '-', COL_X[3] + 2, rY + 5.5);
    doc.text('Delivery Dt:', COL_X[5] + 1.5, rY + 5.5);
    doc.text(invoice.delivery_date ? toDisplayDate(invoice.delivery_date) : '-', COL_X[6] + 2, rY + 5.5);

    y += block1H;

    // -------------------------------------------------------------
    // ROWS 5-6: Left block A:B merged (37.8 mm tall, boxed, bold, centered)
    // "Buyer:" at top-left, then buyer name, address lines, GSTIN.
    // Right side:
    // Row 5 (17.7 mm): Despatched through: | value ; Destination: | value
    // Row 6 (20.1 mm): C:H merged "Terms of Delivery:" bold, centered, top-aligned, empty space below
    // -------------------------------------------------------------
    const row5H = 17.7;
    const row6H = 20.1;
    const block2H = row5H + row6H; // 37.8 mm

    drawBox(doc, COL_X[0], y, leftW, block2H);

    // "Buyer:" at top-left
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('Buyer:', COL_X[0] + 1.5, y + 4.8);

    // Centered Buyer Name & Address
    let bY = y + 4.8;
    doc.setFontSize(11.5);
    const buyerNameLines = doc.splitTextToSize((invoice.buyer_name || '').toUpperCase(), leftW - 4);
    buyerNameLines.forEach((bnl) => {
      doc.text(bnl, COL_X[0] + leftW / 2, bY, { align: 'center' });
      bY += 4.5;
    });

    doc.setFontSize(10.5);
    const buyerAddrLines = (invoice.buyer_address || '').split('\n');
    buyerAddrLines.forEach((bal) => {
      if (bal.trim()) {
        const wrapped = doc.splitTextToSize(bal.trim(), leftW - 4);
        wrapped.forEach((wl) => {
          doc.text(wl, COL_X[0] + leftW / 2, bY, { align: 'center' });
          bY += 4.0;
        });
      }
    });

    if (invoice.buyer_gstin) {
      doc.text(`GSTIN:${invoice.buyer_gstin}`, COL_X[0] + leftW / 2, bY, { align: 'center' });
    }

    // Right Row 5 (17.7 mm): Despatched through | Destination
    let r2Y = y;
    drawBox(doc, COL_X[2], r2Y, COL_WIDTHS[2], row5H);
    drawBox(doc, COL_X[3], r2Y, deW, row5H);
    drawBox(doc, COL_X[5], r2Y, COL_WIDTHS[5], row5H);
    drawBox(doc, COL_X[6], r2Y, ghW, row5H);

    doc.text('Despatched through:', COL_X[2] + 1.5, r2Y + 4.8);
    if (invoice.despatched_through) {
      doc.text(doc.splitTextToSize(invoice.despatched_through, deW - 3), COL_X[3] + 2, r2Y + 4.8);
    }
    doc.text('Destination:', COL_X[5] + 1.5, r2Y + 4.8);
    if (invoice.destination) {
      doc.text(doc.splitTextToSize(invoice.destination, ghW - 3), COL_X[6] + 2, r2Y + 4.8);
    }
    r2Y += row5H;

    // Right Row 6 (20.1 mm): C:H merged "Terms of Delivery:" bold, centered, top-aligned, empty space below
    const rightW = COL_X[8] - COL_X[2]; // 133.4 mm
    drawBox(doc, COL_X[2], r2Y, rightW, row6H);
    doc.text('Terms of Delivery:', COL_X[2] + rightW / 2, r2Y + 4.8, { align: 'center' });
    if (invoice.terms_of_delivery) {
      doc.setFont(fontName, 'normal');
      doc.text(doc.splitTextToSize(invoice.terms_of_delivery, rightW - 6), COL_X[2] + rightW / 2, r2Y + 9.5, { align: 'center' });
      doc.setFont(fontName, 'bold');
    }

    y += block2H;

    // -------------------------------------------------------------
    // ITEMS TABLE HEADER ROW (9.3 mm): bold, centered both ways, boxed
    // SI. No | Description of Goods | HSN/SAC | TAX% | Quantity | Rate | Per | Amount
    // -------------------------------------------------------------
    const thH = 9.3;
    const headers = ['SI. No', 'Description of Goods', 'HSN/SAC', 'TAX%', 'Quantity', 'Rate', 'Per ', 'Amount'];
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);

    for (let c = 0; c < 8; c++) {
      drawBox(doc, COL_X[c], y, COL_WIDTHS[c], thH);
      doc.text(headers[c], COL_X[c] + COL_WIDTHS[c] / 2, y + 6.0, { align: 'center' });
    }
    y += thH;

    // -------------------------------------------------------------
    // ITEMS ROWS (min 7.1 mm each, grow if text wraps): EVERY cell boxed on all 4 sides.
    // Always show at least 5 item rows (pad with empty boxed rows).
    // Align: SI centered, Description left, HSN centered, TAX% right, Qty right, Rate right, Per left, Amount right.
    // -------------------------------------------------------------
    const minRowCount = isLast ? Math.max(5, currentLines.length) : currentLines.length;

    for (let r = 0; r < minRowCount; r++) {
      const line = currentLines[r];
      let rHeight = 7.1;

      let descLines = [''];
      if (line) {
        doc.setFont(fontName, 'normal');
        doc.setFontSize(11);
        descLines = doc.splitTextToSize(line.description || '', COL_WIDTHS[1] - 3);
        if (descLines.length > 1) {
          rHeight = Math.max(7.1, descLines.length * 4.4 + 2);
        }
      }

      // Draw all 8 cells for this row
      for (let c = 0; c < 8; c++) {
        drawBox(doc, COL_X[c], y, COL_WIDTHS[c], rHeight);
      }

      if (line) {
        const textY = y + 5.0;
        const lineNo = line.line_no !== undefined ? line.line_no : r + 1;
        const amountPaise = Number(
          line.amount_paise !== undefined && line.amount_paise !== null
            ? line.amount_paise
            : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
        );

        // Col A: SI. No (Centered)
        doc.setFont(fontName, 'normal');
        doc.text(String(lineNo), COL_X[0] + COL_WIDTHS[0] / 2, textY, { align: 'center' });

        // Col B: Description (Left)
        doc.text(descLines, COL_X[1] + 1.5, textY);

        // Col C: HSN/SAC (Centered)
        doc.text(String(line.hsn || '-'), COL_X[2] + COL_WIDTHS[2] / 2, textY, { align: 'center' });

        // Col D: TAX% (Right)
        const taxStr = line.gst_percent !== undefined ? `${line.gst_percent}%` : '-';
        doc.text(taxStr, COL_X[3] + COL_WIDTHS[3] - 1.5, textY, { align: 'right' });

        // Col E: Quantity (Right)
        doc.text(formatMilliToQuantity(line.qty_milli) || '0', COL_X[4] + COL_WIDTHS[4] - 1.5, textY, { align: 'right' });

        // Col F: Rate (Right, 2 decimals)
        doc.text(formatPlainAmount(line.rate_paise), COL_X[5] + COL_WIDTHS[5] - 1.5, textY, { align: 'right' });

        // Col G: Per (Left, lowercase)
        doc.text(String(line.unit || 'nos').toLowerCase(), COL_X[6] + 1.5, textY, { align: 'left' });

        // Col H: Amount (Right, 2 decimals)
        doc.text(formatPlainAmount(amountPaise), COL_X[7] + COL_WIDTHS[7] - 1.5, textY, { align: 'right' });
      }

      y += rHeight;
    }

    // Intermediate Page Continuation Message if multi-page
    if (!isLast) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(10);
      doc.text(`... Continued on Next Page (Page ${pIdx + 2} of ${totalPages}) ...`, COL_X[0] + CONTENT_WIDTH / 2, y + 8, { align: 'center' });
      continue;
    }

    // -------------------------------------------------------------
    // FINAL PAGE: CGST & SGST ROWS immediately after items
    // (label in Description, rate in TAX%, amount in Amount; other cells empty but boxed)
    // -------------------------------------------------------------
    const taxRowH = 7.1;

    rateGroups.forEach((group) => {
      // CGST Row
      for (let c = 0; c < 8; c++) drawBox(doc, COL_X[c], y, COL_WIDTHS[c], taxRowH);
      doc.setFont(fontName, 'normal');
      doc.setFontSize(11);
      doc.text('CGST', COL_X[1] + 1.5, y + 5.0);
      doc.text(`${group.cgstRate}%`, COL_X[3] + COL_WIDTHS[3] - 1.5, y + 5.0, { align: 'right' });
      doc.text(formatPlainAmount(group.cgstPaise), COL_X[7] + COL_WIDTHS[7] - 1.5, y + 5.0, { align: 'right' });
      y += taxRowH;

      // SGST Row
      for (let c = 0; c < 8; c++) drawBox(doc, COL_X[c], y, COL_WIDTHS[c], taxRowH);
      doc.text('SGST', COL_X[1] + 1.5, y + 5.0);
      doc.text(`${group.sgstRate}%`, COL_X[3] + COL_WIDTHS[3] - 1.5, y + 5.0, { align: 'right' });
      doc.text(formatPlainAmount(group.sgstPaise), COL_X[7] + COL_WIDTHS[7] - 1.5, y + 5.0, { align: 'right' });
      y += taxRowH;
    });

    // -------------------------------------------------------------
    // GRAND TOTAL(ROUND OFF) ROW (7.1 mm): A:B merged bold centered label;
    // C:H merged value right-aligned, vertically centered, boxed.
    // -------------------------------------------------------------
    const gtH = 7.1;
    drawBox(doc, COL_X[0], y, leftW, gtH);
    drawBox(doc, COL_X[2], y, rightW, gtH);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('Grand Total(round off)', COL_X[0] + leftW / 2, y + 5.0, { align: 'center' });
    doc.text(formatPlainAmount(invoice.payable_paise), COL_X[8] - 2, y + 5.0, { align: 'right' });
    y += gtH;

    // -------------------------------------------------------------
    // AMOUNT IN WORDS: ROW (10.1 mm): A:B bold, C:H text, left/top aligned,
    // TOP and BOTTOM borders only (no side borders).
    // -------------------------------------------------------------
    const wordsH = 10.1;
    doc.line(COL_X[0], y, COL_X[8], y); // Top border only
    doc.line(COL_X[0], y + wordsH, COL_X[8], y + wordsH); // Bottom border only

    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('Amount in words:', COL_X[0] + 1.5, y + 4.8);

    const wordsVal = invoice.amount_in_words || (invoice.payable_paise != null ? numberToWordsIndian(invoice.payable_paise) : '');
    const wrappedWords = doc.splitTextToSize(wordsVal.toUpperCase(), rightW - 4);
    doc.setFont(fontName, 'normal');
    doc.text(wrappedWords, COL_X[2] + 1.5, y + 4.8);
    y += wordsH;

    // -------------------------------------------------------------
    // HSN SUMMARY TABLE (Directly below, no gap)
    // 2 header rows (8.15 each), bold centered boxed:
    // A "HSN/SAC" and B "Taxable Value" merged over both rows;
    // C:E "Central Tax" over [C Rate | D:E Amount];
    // F:H "State Tax" over [F Rate | G:H Amount].
    // -------------------------------------------------------------
    const hsnH1 = 8.15;
    const hsnH2 = 8.15;
    const hsnHeaderH = hsnH1 + hsnH2; // 16.3 mm

    // Col A: HSN/SAC merged over both rows
    drawBox(doc, COL_X[0], y, COL_WIDTHS[0], hsnHeaderH);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(10.5);
    doc.text('HSN/SAC', COL_X[0] + COL_WIDTHS[0] / 2, y + 9.8, { align: 'center' });

    // Col B: Taxable Value merged over both rows
    drawBox(doc, COL_X[1], y, COL_WIDTHS[1], hsnHeaderH);
    doc.text('Taxable Value', COL_X[1] + COL_WIDTHS[1] / 2, y + 9.8, { align: 'center' });

    // Cols C:E: Central Tax
    const centralW = COL_X[5] - COL_X[2]; // 61.2 mm
    drawBox(doc, COL_X[2], y, centralW, hsnH1);
    doc.text('Central Tax', COL_X[2] + centralW / 2, y + 5.5, { align: 'center' });

    // Cols F:H: State Tax
    const stateW = COL_X[8] - COL_X[5]; // 72.2 mm
    drawBox(doc, COL_X[5], y, stateW, hsnH1);
    doc.text('State Tax', COL_X[5] + stateW / 2, y + 5.5, { align: 'center' });

    // Row 2 Subheaders:
    const subY = y + hsnH1;
    // Col C: Rate
    drawBox(doc, COL_X[2], subY, COL_WIDTHS[2], hsnH2);
    doc.text('Rate', COL_X[2] + COL_WIDTHS[2] / 2, subY + 5.5, { align: 'center' });

    // Cols D:E: Amount
    drawBox(doc, COL_X[3], subY, deW, hsnH2);
    doc.text('Amount', COL_X[3] + deW / 2, subY + 5.5, { align: 'center' });

    // Col F: Rate
    drawBox(doc, COL_X[5], subY, COL_WIDTHS[5], hsnH2);
    doc.text('Rate', COL_X[5] + COL_WIDTHS[5] / 2, subY + 5.5, { align: 'center' });

    // Cols G:H: Amount
    drawBox(doc, COL_X[6], subY, ghW, hsnH2);
    doc.text('Amount', COL_X[6] + ghW / 2, subY + 5.5, { align: 'center' });

    y += hsnHeaderH;

    // HSN Data Rows (8.15 mm each): all boxed
    // Align: HSN centered, taxable right, rates centered, amounts centered with 2 decimals
    doc.setFont(fontName, 'normal');
    doc.setFontSize(10.5);

    hsnSummary.rows.forEach((row) => {
      const dRowH = 8.15;
      drawBox(doc, COL_X[0], y, COL_WIDTHS[0], dRowH);
      drawBox(doc, COL_X[1], y, COL_WIDTHS[1], dRowH);
      drawBox(doc, COL_X[2], y, COL_WIDTHS[2], dRowH);
      drawBox(doc, COL_X[3], y, deW, dRowH);
      drawBox(doc, COL_X[5], y, COL_WIDTHS[5], dRowH);
      drawBox(doc, COL_X[6], y, ghW, dRowH);

      const rTextY = y + 5.5;
      doc.text(String(row.hsn), COL_X[0] + COL_WIDTHS[0] / 2, rTextY, { align: 'center' });
      doc.text(formatPlainAmount(row.taxablePaise), COL_X[1] + COL_WIDTHS[1] - 2, rTextY, { align: 'right' });
      doc.text(`${row.centralRate}%`, COL_X[2] + COL_WIDTHS[2] / 2, rTextY, { align: 'center' });
      doc.text(formatPlainAmount(row.centralTaxPaise), COL_X[3] + deW / 2, rTextY, { align: 'center' });
      doc.text(`${row.stateRate}%`, COL_X[5] + COL_WIDTHS[5] / 2, rTextY, { align: 'center' });
      doc.text(formatPlainAmount(row.stateTaxPaise), COL_X[6] + ghW / 2, rTextY, { align: 'center' });

      y += dRowH;
    });

    // Total(round off) row (8.15 mm): A:F merged label (regular weight), G:H merged total tax
    const hsnTotH = 8.15;
    const afW = COL_X[6] - COL_X[0]; // 146.0 mm
    drawBox(doc, COL_X[0], y, afW, hsnTotH);
    drawBox(doc, COL_X[6], y, ghW, hsnTotH);

    doc.setFont(fontName, 'normal');
    doc.text('Total(round off)', COL_X[0] + 2, y + 5.5);
    doc.text(formatPlainAmount(hsnSummary.totalTaxPaise), COL_X[6] + ghW / 2, y + 5.5, { align: 'center' });
    y += hsnTotH;

    // Amount in words row (8.15 mm): A:B bold, C:H text, TOP border only
    const taxWordsH = 8.15;
    doc.line(COL_X[0], y, COL_X[8], y); // Top border only

    doc.setFont(fontName, 'bold');
    doc.text('Amount in words', COL_X[0] + 1.5, y + 5.5);
    doc.setFont(fontName, 'normal');
    doc.text(hsnSummary.taxInWords.toUpperCase(), COL_X[2] + 1.5, y + 5.5);
    y += taxWordsH;

    // -------------------------------------------------------------
    // FOOTER (No borders):
    // Declaration (10pt, left). Then "For Khansa Enterprises" right-aligned (regular),
    // ~16mm blank space for signing, then "Customers Seal and Signature" at left
    // and "Authorised Signature" at right.
    // -------------------------------------------------------------
    y += 2.5;

    // Declaration: 10pt left
    doc.setFont(fontName, 'normal');
    doc.setFontSize(10);
    const decText = `Declaration: ${firm.declaration || DEFAULT_FIRM.declaration}`;
    doc.text(decText, COL_X[0], y + 3.5);
    y += 7.5;

    // "For Khansa Enterprises" (regular, right-aligned)
    doc.text(`For ${firm.name || 'Khansa Enterprises'}`, COL_X[8], y + 3.5, { align: 'right' });
    y += 18.0; // ~16mm blank space for signing

    // Signatures
    doc.setFont(fontName, 'bold');
    doc.setFontSize(10.5);
    doc.text('Customers Seal and Signature', COL_X[0], y);
    doc.text('Authorised Signature', COL_X[8], y, { align: 'right' });

    // Cancelled Watermark Stamp if invoice is cancelled
    if (isCancelled) {
      doc.saveGraphicsState();
      doc.setGState(new doc.GState({ opacity: 0.35 }));
      doc.setTextColor(220, 38, 38);
      doc.setFont(fontName, 'bold');
      doc.setFontSize(52);
      doc.text('CANCELLED', PAGE_WIDTH / 2, PAGE_HEIGHT / 2, { align: 'center', angle: 30 });
      doc.restoreGraphicsState();
    }
  }

  return doc;
}
