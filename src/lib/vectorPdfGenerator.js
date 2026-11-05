import { jsPDF } from 'jspdf';
import { registerCarlitoFont } from './fonts/carlito.js';
import { formatDisplayDate } from './billUtils.js';
import { formatMilliToQuantity, numberToWordsIndian } from './billPayload.js';
import { getHsnSummaryRows, getRateGroupSummary, formatPlainAmount, paginateInvoiceLines, normalizeLinesWithFreight } from './invoiceLayout.js';

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
 * Safely measures and wraps text to a max width (accounting for padding),
 * ensuring text is never clipped or drawn outside its cell bounds.
 * Prevents splitting single words (e.g. "Destination:" or 8-digit HSN codes).
 */
function getWrappedLines(doc, textOrLines, maxWidth, cellWidth = null) {
  if (textOrLines === null || textOrLines === undefined) return [];
  const maxW = Math.max(3, maxWidth);
  let result = [];

  const processString = (str) => {
    const trimmed = str.trim();
    if (!trimmed) return;
    // Single word fits within cell width - don't let splitTextToSize split it across 2 lines
    if (cellWidth && !trimmed.includes(' ')) {
      const fullW = doc.getTextWidth(trimmed);
      if (fullW <= cellWidth - 0.8) {
        result.push(trimmed);
        return;
      }
    }
    const split = doc.splitTextToSize(trimmed, maxW);
    result.push(...split);
  };

  if (Array.isArray(textOrLines)) {
    textOrLines.forEach((item) => {
      const s = String(item ?? '');
      if (s.includes('\n')) s.split('\n').forEach(processString);
      else processString(s);
    });
  } else {
    const s = String(textOrLines ?? '');
    if (s.includes('\n')) s.split('\n').forEach(processString);
    else processString(s);
  }
  return result;
}

/**
 * Draws text inside a cell with 1.5mm padding on all sides.
 * Supports align: 'left' | 'center' | 'right' and valign: 'top' | 'middle'.
 */
function drawCell(doc, textOrLines, x, y, w, h, options = {}) {
  const {
    align = 'left',
    padding = 1.5,
    fontSize = 11,
    fontStyle = 'normal',
    valign = 'top',
    fontName = 'Carlito',
  } = options;

  doc.setFont(fontName, fontStyle);
  doc.setFontSize(fontSize);

  const innerW = Math.max(3, w - padding * 2);
  const lines = getWrappedLines(doc, textOrLines, innerW, w);
  if (lines.length === 0) return lines;

  const lineH = Math.max(3.6, fontSize * 0.3528 * 1.15);
  const textAscent = fontSize * 0.3528 * 0.80;

  let startY = y + padding + textAscent;
  if (valign === 'middle') {
    const totalH = (lines.length - 1) * lineH + textAscent;
    startY = y + (h - totalH) / 2 + textAscent;
  }

  lines.forEach((line, i) => {
    let curX = x + padding;
    if (align === 'center') curX = x + w / 2;
    else if (align === 'right') curX = x + w - padding;
    doc.text(line, curX, startY + i * lineH, { align });
  });

  return lines;
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

  const rawLines = invoice?.lines || [];
  const lines = normalizeLinesWithFreight(rawLines, invoice?.freight_paise || 0);
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
    // ROW 1: "TAX INVOICE" 14pt bold, centered across A:H, bottom border only
    // -------------------------------------------------------------
    const row1H = 5.6;
    doc.line(COL_X[0], y + row1H, COL_X[8], y + row1H); // bottom border only
    doc.setFont(fontName, 'bold');
    doc.setFontSize(14);
    doc.text('TAX INVOICE', COL_X[0] + CONTENT_WIDTH / 2, y + 4.2, { align: 'center' });
    y += row1H;

    // -------------------------------------------------------------
    // ROWS 2-4: Left block A:B merged & Right block C:H
    // Left: Firm name 15pt bold, address lines 11pt bold, GSTIN 11pt bold, email 10pt bold, cell 11pt bold
    // Right: 4 fully boxed cells per row [C][D:E][F][G:H]
    // Row 2: INVOICE No: (11pt bold) | no (14pt bold) ; Dated: (11pt bold) | date (13pt bold)
    // Row 3: Buyer Order: (11pt bold) | order no (12pt bold) ; Dated: (11pt bold) | date (12pt bold)
    // Row 4: Delivery No: (11pt bold) | no (12pt bold) ; Delivery Dt: (11pt bold) | date (12pt bold)
    // -------------------------------------------------------------
    const leftW = COL_X[2] - COL_X[0]; // 63.9 mm (A:B)
    const rightW = COL_X[8] - COL_X[2]; // 133.4 mm (C:H)
    const deW = COL_WIDTHS[3] + COL_WIDTHS[4]; // 37.2 mm (D:E)
    const ghW = COL_WIDTHS[6] + COL_WIDTHS[7]; // 51.3 mm (G:H)

    // Row 2 heights:
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    const r2LabelC = getWrappedLines(doc, 'INVOICE No:', COL_WIDTHS[2] - 2.0, COL_WIDTHS[2]);
    doc.setFontSize(14);
    const r2ValDE = getWrappedLines(doc, invoice.invoice_no || '-', deW - 2.4, deW);
    doc.setFontSize(11);
    const r2LabelF = getWrappedLines(doc, 'Dated:', COL_WIDTHS[5] - 2.0, COL_WIDTHS[5]);
    doc.setFontSize(13);
    const r2ValGH = getWrappedLines(doc, toDisplayDate(invoice.invoice_date), ghW - 2.4, ghW);
    const r2MaxLines = Math.max(1, r2LabelC.length, r2ValDE.length, r2LabelF.length, r2ValGH.length);
    const row2H = Math.max(14.0, r2MaxLines * 4.8 + 2.5);

    // Row 3 heights (Buyer order & date, supports multiline; hidden if empty):
    const hasBuyerOrder = Boolean(invoice.buyer_order_no && String(invoice.buyer_order_no).trim());
    doc.setFontSize(11);
    const r3LabelC = getWrappedLines(doc, hasBuyerOrder ? 'Buyer Order:' : '', COL_WIDTHS[2] - 2.0, COL_WIDTHS[2]);
    doc.setFontSize(12);
    const r3ValDE = getWrappedLines(doc, hasBuyerOrder ? invoice.buyer_order_no : '', deW - 2.4, deW);
    doc.setFontSize(11);
    const r3LabelF = getWrappedLines(doc, hasBuyerOrder && invoice.buyer_order_date ? 'Dated:' : '', COL_WIDTHS[5] - 2.0, COL_WIDTHS[5]);
    doc.setFontSize(12);
    const r3ValGH = getWrappedLines(doc, hasBuyerOrder && invoice.buyer_order_date ? toDisplayDate(invoice.buyer_order_date) : '', ghW - 2.4, ghW);
    const r3MaxLines = Math.max(1, r3LabelC.length, r3ValDE.length, r3LabelF.length, r3ValGH.length);
    const row3H = Math.max(14.0, r3MaxLines * 4.6 + 2.5);

    // Row 4 heights (Delivery No & Dt):
    doc.setFontSize(11);
    const r4LabelC = getWrappedLines(doc, 'Delivery No:', COL_WIDTHS[2] - 2.0, COL_WIDTHS[2]);
    doc.setFontSize(12);
    const r4ValDE = getWrappedLines(doc, invoice.delivery_no || '-', deW - 2.4, deW);
    doc.setFontSize(11);
    const r4LabelF = getWrappedLines(doc, 'Delivery Dt:', COL_WIDTHS[5] - 2.0, COL_WIDTHS[5]);
    doc.setFontSize(12);
    const r4ValGH = getWrappedLines(doc, invoice.delivery_date ? toDisplayDate(invoice.delivery_date) : '-', ghW - 2.4, ghW);
    const r4MaxLines = Math.max(1, r4LabelC.length, r4ValDE.length, r4LabelF.length, r4ValGH.length);
    const row4H = Math.max(8.5, r4MaxLines * 4.6 + 2.0);

    const block1RightH = row2H + row3H + row4H;

    // Firm Profile height check:
    doc.setFontSize(15);
    const firmNameLines = getWrappedLines(doc, (firm.name || 'KHANSA ENTERPRISES').toUpperCase(), leftW - 3);
    doc.setFontSize(11);
    const firmAddrLines = getWrappedLines(doc, firm.address || '', leftW - 3);
    const firmReqH = (firmNameLines.length * 5.2) + (firmAddrLines.length * 4.2) + 4.2 + (firm.email ? 3.8 : 0) + (firm.phone ? 4.0 : 0) + 4.5;

    const block1H = Math.max(block1RightH, firmReqH, 37.0);
    const finalRow4H = row4H + (block1H - block1RightH); // Absorbs extra height so left & right stay aligned

    // Draw Left Block 1 Box
    drawBox(doc, COL_X[0], y, leftW, block1H);

    // Render Firm Profile (Centered, bold, top-aligned)
    let fY = y + 1.5;
    firmNameLines.forEach((fnl) => {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(15);
      doc.text(fnl, COL_X[0] + leftW / 2, fY + 4.0, { align: 'center' });
      fY += 5.2;
    });

    doc.setFontSize(11);
    firmAddrLines.forEach((al) => {
      doc.text(al, COL_X[0] + leftW / 2, fY + 3.2, { align: 'center' });
      fY += 4.2;
    });

    doc.text(`GSTIN/UIN:${firm.gstin || '33AGXPF4947Q1ZH'}`, COL_X[0] + leftW / 2, fY + 3.2, { align: 'center' });
    fY += 4.2;

    if (firm.email) {
      doc.setFontSize(10);
      doc.text(`Email:${firm.email}`, COL_X[0] + leftW / 2, fY + 3.0, { align: 'center' });
      fY += 3.8;
    }
    if (firm.phone) {
      doc.setFontSize(11);
      doc.text(`Cell:${firm.phone}`, COL_X[0] + leftW / 2, fY + 3.2, { align: 'center' });
    }

    // Render Right Block 1 Cells
    let curRY = y;

    // Row 2 Cells:
    drawBox(doc, COL_X[2], curRY, COL_WIDTHS[2], row2H);
    drawBox(doc, COL_X[3], curRY, deW, row2H);
    drawBox(doc, COL_X[5], curRY, COL_WIDTHS[5], row2H);
    drawBox(doc, COL_X[6], curRY, ghW, row2H);

    drawCell(doc, r2LabelC, COL_X[2], curRY, COL_WIDTHS[2], row2H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r2ValDE, COL_X[3], curRY, deW, row2H, { fontSize: 14, fontStyle: 'bold', fontName, padding: 1.2 });
    drawCell(doc, r2LabelF, COL_X[5], curRY, COL_WIDTHS[5], row2H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r2ValGH, COL_X[6], curRY, ghW, row2H, { fontSize: 13, fontStyle: 'bold', fontName, padding: 1.2 });
    curRY += row2H;

    // Row 3 Cells:
    drawBox(doc, COL_X[2], curRY, COL_WIDTHS[2], row3H);
    drawBox(doc, COL_X[3], curRY, deW, row3H);
    drawBox(doc, COL_X[5], curRY, COL_WIDTHS[5], row3H);
    drawBox(doc, COL_X[6], curRY, ghW, row3H);

    drawCell(doc, r3LabelC, COL_X[2], curRY, COL_WIDTHS[2], row3H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r3ValDE, COL_X[3], curRY, deW, row3H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });
    drawCell(doc, r3LabelF, COL_X[5], curRY, COL_WIDTHS[5], row3H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r3ValGH, COL_X[6], curRY, ghW, row3H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });
    curRY += row3H;

    // Row 4 Cells:
    drawBox(doc, COL_X[2], curRY, COL_WIDTHS[2], finalRow4H);
    drawBox(doc, COL_X[3], curRY, deW, finalRow4H);
    drawBox(doc, COL_X[5], curRY, COL_WIDTHS[5], finalRow4H);
    drawBox(doc, COL_X[6], curRY, ghW, finalRow4H);

    drawCell(doc, r4LabelC, COL_X[2], curRY, COL_WIDTHS[2], finalRow4H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r4ValDE, COL_X[3], curRY, deW, finalRow4H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });
    drawCell(doc, r4LabelF, COL_X[5], curRY, COL_WIDTHS[5], finalRow4H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r4ValGH, COL_X[6], curRY, ghW, finalRow4H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });

    y += block1H;

    // -------------------------------------------------------------
    // ROWS 5-6: Left block A:B merged & Right block C:H
    // Left: "Buyer:" alone on first line (top-left, 11pt bold).
    // Start buyer name (13pt bold) / address / GSTIN (11pt bold) BELOW it, centered.
    // Right: Row 5: Despatched through: (11pt bold) | value (12pt bold) ; Destination: (11pt bold) | value (12pt bold)
    // Row 6: Terms of Delivery: (11pt bold, centered)
    // -------------------------------------------------------------
    doc.setFontSize(11);
    const r5LabelC = getWrappedLines(doc, 'Despatched through:', COL_WIDTHS[2] - 2.0, COL_WIDTHS[2]);
    doc.setFontSize(12);
    const r5ValDE = getWrappedLines(doc, invoice.despatched_through || '-', deW - 2.4, deW);
    doc.setFontSize(11);
    const r5LabelF = getWrappedLines(doc, 'Destination:', COL_WIDTHS[5] - 1.0, COL_WIDTHS[5]);
    doc.setFontSize(12);
    const r5ValGH = getWrappedLines(doc, invoice.destination || '-', ghW - 2.4, ghW);
    const r5MaxLines = Math.max(1, r5LabelC.length, r5ValDE.length, r5LabelF.length, r5ValGH.length);
    const row5H = Math.max(14.0, r5MaxLines * 4.6 + 2.5);

    doc.setFontSize(11);
    const r6TermsLines = getWrappedLines(doc, invoice.terms_of_delivery || '', rightW - 6, rightW);
    const row6BaseH = Math.max(14.0, r6TermsLines.length * 4.4 + 5.5);

    // Buyer block height calculation:
    // "Buyer:" alone on first line
    doc.setFontSize(13);
    const buyerNameLines = getWrappedLines(doc, (invoice.buyer_name || '').toUpperCase(), leftW - 3);
    doc.setFontSize(11);
    const buyerAddrLines = getWrappedLines(doc, invoice.buyer_address || '', leftW - 3);
    const buyerReqH = 5.0 + (buyerNameLines.length * 4.8) + (buyerAddrLines.length * 4.0) + (invoice.buyer_gstin ? 4.2 : 0) + 3.0;

    const block2RightH = row5H + row6BaseH;
    const block2H = Math.max(block2RightH, buyerReqH, 36.0);
    const finalRow6H = row6BaseH + (block2H - block2RightH);

    // Draw Left Block 2 Box
    drawBox(doc, COL_X[0], y, leftW, block2H);

    // "Buyer:" alone on the first line (top-left, 11pt bold)
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('Buyer:', COL_X[0] + 1.5, y + 4.2);

    // Start buyer details strictly BELOW "Buyer:" line, centered
    let curBY = y + 5.2;
    doc.setFontSize(13);
    buyerNameLines.forEach((bnl) => {
      doc.text(bnl, COL_X[0] + leftW / 2, curBY + 3.4, { align: 'center' });
      curBY += 4.8;
    });

    doc.setFontSize(11);
    buyerAddrLines.forEach((bal) => {
      doc.text(bal, COL_X[0] + leftW / 2, curBY + 3.0, { align: 'center' });
      curBY += 4.0;
    });

    if (invoice.buyer_gstin) {
      doc.text(`GSTIN:${invoice.buyer_gstin}`, COL_X[0] + leftW / 2, curBY + 3.2, { align: 'center' });
    }

    // Render Right Block 2 Cells
    let curR2Y = y;

    // Row 5 Cells:
    drawBox(doc, COL_X[2], curR2Y, COL_WIDTHS[2], row5H);
    drawBox(doc, COL_X[3], curR2Y, deW, row5H);
    drawBox(doc, COL_X[5], curR2Y, COL_WIDTHS[5], row5H);
    drawBox(doc, COL_X[6], curR2Y, ghW, row5H);

    drawCell(doc, r5LabelC, COL_X[2], curR2Y, COL_WIDTHS[2], row5H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 1.0 });
    drawCell(doc, r5ValDE, COL_X[3], curR2Y, deW, row5H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });
    drawCell(doc, r5LabelF, COL_X[5], curR2Y, COL_WIDTHS[5], row5H, { fontSize: 11, fontStyle: 'bold', fontName, padding: 0.8 });
    drawCell(doc, r5ValGH, COL_X[6], curR2Y, ghW, row5H, { fontSize: 12, fontStyle: 'bold', fontName, padding: 1.2 });
    curR2Y += row5H;

    // Row 6: Terms of Delivery: (C:H merged, 11pt bold, centered, top-aligned)
    drawBox(doc, COL_X[2], curR2Y, rightW, finalRow6H);
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11);
    doc.text('Terms of Delivery:', COL_X[2] + rightW / 2, curR2Y + 4.2, { align: 'center' });
    if (r6TermsLines.length > 0) {
      let tY = curR2Y + 8.5;
      r6TermsLines.forEach((tl) => {
        doc.text(tl, COL_X[2] + rightW / 2, tY, { align: 'center' });
        tY += 4.4;
      });
    }

    y += block2H;

    // -------------------------------------------------------------
    // ITEMS TABLE HEADER ROW (8.5 mm): 11.5pt bold, centered both ways, boxed
    // SI. No | Description of Goods | HSN/SAC | TAX% | Quantity | Rate | Per | Amount
    // -------------------------------------------------------------
    const thH = 8.5;
    const headers = ['SI. No', 'Description of Goods', 'HSN/SAC', 'TAX%', 'Quantity', 'Rate', 'Per ', 'Amount'];

    for (let c = 0; c < 8; c++) {
      drawBox(doc, COL_X[c], y, COL_WIDTHS[c], thH);
      drawCell(doc, headers[c], COL_X[c], y, COL_WIDTHS[c], thH, {
        fontSize: 11.5,
        fontStyle: 'bold',
        align: 'center',
        valign: 'middle',
        fontName,
        padding: 0.8,
      });
    }
    y += thH;

    // -------------------------------------------------------------
    // ITEMS ROWS: 12pt regular (min row 8mm, grows if text wraps).
    // EVERY cell boxed on all 4 sides. Always show at least 5 item rows.
    // If an item has per-item freight > 0, an extra row is shown directly below it
    // with the same HSN and GST rate.
    // -------------------------------------------------------------
    const renderedItemRows = [];
    currentLines.forEach((line, idx) => {
      renderedItemRows.push({ type: 'item', line, index: idx });
      const freightPaise = Number(line.freight_paise || line.freightPaise || 0);
      if (freightPaise > 0) {
        renderedItemRows.push({ type: 'freight', line, freightPaise });
      }
    });

    const minRowCount = isLast ? Math.max(5, renderedItemRows.length) : renderedItemRows.length;

    for (let r = 0; r < minRowCount; r++) {
      const rowItem = renderedItemRows[r];
      let rHeight = 8.0;

      let descLines = [];
      if (rowItem && rowItem.type === 'item') {
        doc.setFont(fontName, 'normal');
        doc.setFontSize(12);
        descLines = getWrappedLines(doc, rowItem.line.description || '', COL_WIDTHS[1] - 2.4, COL_WIDTHS[1]);
        if (descLines.length > 1) {
          rHeight = Math.max(8.0, descLines.length * 4.2 + 2.0);
        }
      }

      // Draw all 8 cells for this row
      for (let c = 0; c < 8; c++) {
        drawBox(doc, COL_X[c], y, COL_WIDTHS[c], rHeight);
      }

      if (rowItem) {
        if (rowItem.type === 'item') {
          const line = rowItem.line;
          const lineNo = line.line_no !== undefined ? line.line_no : rowItem.index + 1;
          const amountPaise = Number(
            line.amount_paise !== undefined && line.amount_paise !== null
              ? line.amount_paise
              : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
          );

          // Col A: SI. No (Centered)
          drawCell(doc, String(lineNo), COL_X[0], y, COL_WIDTHS[0], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'center',
            valign: 'middle',
            fontName,
            padding: 0.8,
          });

          // Col B: Description (Left)
          drawCell(doc, descLines, COL_X[1], y, COL_WIDTHS[1], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'left',
            valign: descLines.length > 1 ? 'top' : 'middle',
            fontName,
            padding: 1.2,
          });

          // Col C: HSN/SAC (Centered)
          drawCell(doc, String(line.hsn || '-'), COL_X[2], y, COL_WIDTHS[2], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'center',
            valign: 'middle',
            fontName,
            padding: 0.8,
          });

          // Col D: TAX% (Right)
          const taxStr = line.gst_percent !== undefined ? `${line.gst_percent}%` : '-';
          drawCell(doc, taxStr, COL_X[3], y, COL_WIDTHS[3], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.0,
          });

          // Col E: Quantity (Right)
          drawCell(doc, formatMilliToQuantity(line.qty_milli) || '0', COL_X[4], y, COL_WIDTHS[4], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });

          // Col F: Rate (Right, 2 decimals)
          drawCell(doc, formatPlainAmount(line.rate_paise), COL_X[5], y, COL_WIDTHS[5], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });

          // Col G: Per (Left, lowercase)
          drawCell(doc, String(line.unit || 'nos').toLowerCase(), COL_X[6], y, COL_WIDTHS[6], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'left',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });

          // Col H: Amount (Right, 2 decimals)
          drawCell(doc, formatPlainAmount(amountPaise), COL_X[7], y, COL_WIDTHS[7], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });
        } else if (rowItem.type === 'freight') {
          const line = rowItem.line;
          // Col B: Description = Freight
          drawCell(doc, 'Freight', COL_X[1], y, COL_WIDTHS[1], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'left',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });

          // Col C: HSN/SAC (same HSN)
          drawCell(doc, String(line.hsn || '-'), COL_X[2], y, COL_WIDTHS[2], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'center',
            valign: 'middle',
            fontName,
            padding: 0.8,
          });

          // Col D: TAX% (same TAX%)
          const taxStr = line.gst_percent !== undefined ? `${line.gst_percent}%` : '-';
          drawCell(doc, taxStr, COL_X[3], y, COL_WIDTHS[3], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.0,
          });

          // Col H: Amount = freight amount
          drawCell(doc, formatPlainAmount(rowItem.freightPaise), COL_X[7], y, COL_WIDTHS[7], rHeight, {
            fontSize: 12,
            fontStyle: 'normal',
            align: 'right',
            valign: 'middle',
            fontName,
            padding: 1.2,
          });
        }
      }

      y += rHeight;
    }

    // Intermediate Page Continuation Message if multi-page
    if (!isLast) {
      doc.setFont(fontName, 'bold');
      doc.setFontSize(11);
      doc.text(`... Continued on Next Page (Page ${pIdx + 2} of ${totalPages}) ...`, COL_X[0] + CONTENT_WIDTH / 2, y + 8, { align: 'center' });
      continue;
    }

    // -------------------------------------------------------------
    // FINAL PAGE: CGST & SGST ROWS (12pt, min row 7.5mm) immediately after items
    // (label in Description, rate in TAX%, amount in Amount; other cells empty but boxed)
    // -------------------------------------------------------------
    const taxRowH = 7.5;

    rateGroups.forEach((group) => {
      // CGST Row
      for (let c = 0; c < 8; c++) drawBox(doc, COL_X[c], y, COL_WIDTHS[c], taxRowH);
      drawCell(doc, 'CGST', COL_X[1], y, COL_WIDTHS[1], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'left', valign: 'middle', fontName, padding: 1.2 });
      drawCell(doc, `${group.cgstRate}%`, COL_X[3], y, COL_WIDTHS[3], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.0 });
      drawCell(doc, formatPlainAmount(group.cgstPaise), COL_X[7], y, COL_WIDTHS[7], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.2 });
      y += taxRowH;

      // SGST Row
      for (let c = 0; c < 8; c++) drawBox(doc, COL_X[c], y, COL_WIDTHS[c], taxRowH);
      drawCell(doc, 'SGST', COL_X[1], y, COL_WIDTHS[1], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'left', valign: 'middle', fontName, padding: 1.2 });
      drawCell(doc, `${group.sgstRate}%`, COL_X[3], y, COL_WIDTHS[3], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.0 });
      drawCell(doc, formatPlainAmount(group.sgstPaise), COL_X[7], y, COL_WIDTHS[7], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.2 });
      y += taxRowH;
    });

    // Round Off row (+/- paise so numbers add up)
    const totalTaxPaise = rateGroups.reduce((acc, g) => acc + (g.cgstPaise || 0) + (g.sgstPaise || 0), 0);
    const lineTaxableSum = lines.reduce((acc, l) => {
      const q = l.qty_milli || 0;
      const r = l.rate_paise || 0;
      const base = l.amount_paise != null ? Number(l.amount_paise) : Math.round((q * r) / 1000);
      const fr = Number(l.freight_paise || l.freightPaise || 0);
      return acc + base + fr;
    }, 0);
    const subtotalBeforeRound = lineTaxableSum + totalTaxPaise;
    const roundOffPaise = invoice.round_off_paise != null
      ? Number(invoice.round_off_paise)
      : (invoice.payable_paise != null ? (Number(invoice.payable_paise) - subtotalBeforeRound) : 0);

    if (roundOffPaise !== 0) {
      for (let c = 0; c < 8; c++) drawBox(doc, COL_X[c], y, COL_WIDTHS[c], taxRowH);
      drawCell(doc, 'Round Off', COL_X[1], y, COL_WIDTHS[1], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'left', valign: 'middle', fontName, padding: 1.2 });
      const sign = roundOffPaise > 0 ? '+' : '';
      const roundOffFormatted = `${sign}${(roundOffPaise / 100).toFixed(2)}`;
      drawCell(doc, roundOffFormatted, COL_X[7], y, COL_WIDTHS[7], taxRowH, { fontSize: 12, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.2 });
      y += taxRowH;
    }

    // -------------------------------------------------------------
    // GRAND TOTAL(ROUND OFF) ROW (7.5mm): A:B merged 12pt bold centered label;
    // C:H merged 14pt bold value right-aligned, vertically centered, boxed.
    // -------------------------------------------------------------
    const gtH = 7.5;
    drawBox(doc, COL_X[0], y, leftW, gtH);
    drawBox(doc, COL_X[2], y, rightW, gtH);
    drawCell(doc, 'Grand Total(round off)', COL_X[0], y, leftW, gtH, { fontSize: 12, fontStyle: 'bold', align: 'center', valign: 'middle', fontName });
    drawCell(doc, formatPlainAmount(invoice.payable_paise), COL_X[2], y, rightW, gtH, { fontSize: 14, fontStyle: 'bold', align: 'right', valign: 'middle', fontName, padding: 1.5 });
    y += gtH;

    // -------------------------------------------------------------
    // AMOUNT IN WORDS: ROW: A:B 11pt bold, C:H 11.5pt bold text.
    // Wrap to 2 lines if needed, grow row height, 1.5mm padding top & bottom.
    // TOP and BOTTOM borders only (no side borders).
    // -------------------------------------------------------------
    const wordsVal = invoice.amount_in_words || (invoice.payable_paise != null ? numberToWordsIndian(invoice.payable_paise) : '');
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11.5);
    const wordsLines = getWrappedLines(doc, wordsVal.toUpperCase(), rightW - 3.0, rightW);
    const wordsH = Math.max(8.0, wordsLines.length * 4.6 + 2.4);

    doc.line(COL_X[0], y, COL_X[8], y); // Top border only
    doc.line(COL_X[0], y + wordsH, COL_X[8], y + wordsH); // Bottom border only

    drawCell(doc, 'Amount in words:', COL_X[0], y, leftW, wordsH, { fontSize: 11, fontStyle: 'bold', align: 'left', fontName, padding: 1.2 });
    drawCell(doc, wordsLines, COL_X[2], y, rightW, wordsH, { fontSize: 11.5, fontStyle: 'bold', align: 'left', fontName, padding: 1.2 });
    y += wordsH;

    // -------------------------------------------------------------
    // HSN SUMMARY TABLE (Directly below, no gap)
    // 2 header rows (7mm each): 11pt bold centered boxed.
    // Data rows (7mm each): 11pt regular, all boxed.
    // Total(round off) row (7mm): 11.5pt regular label, 11.5pt bold total tax.
    // Amount in words row: 11pt bold label, 11.5pt bold text, top border only.
    // -------------------------------------------------------------
    const hsnH1 = 7.0;
    const hsnH2 = 7.0;
    const hsnHeaderH = hsnH1 + hsnH2; // 14.0 mm

    // Col A: HSN/SAC merged over both rows
    drawBox(doc, COL_X[0], y, COL_WIDTHS[0], hsnHeaderH);
    drawCell(doc, 'HSN/SAC', COL_X[0], y, COL_WIDTHS[0], hsnHeaderH, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    // Col B: Taxable Value merged over both rows
    drawBox(doc, COL_X[1], y, COL_WIDTHS[1], hsnHeaderH);
    drawCell(doc, 'Taxable Value', COL_X[1], y, COL_WIDTHS[1], hsnHeaderH, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    // Cols C:E: Central Tax
    const centralW = COL_X[5] - COL_X[2]; // 61.2 mm
    drawBox(doc, COL_X[2], y, centralW, hsnH1);
    drawCell(doc, 'Central Tax', COL_X[2], y, centralW, hsnH1, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName });

    // Cols F:H: State Tax
    const stateW = COL_X[8] - COL_X[5]; // 72.2 mm
    drawBox(doc, COL_X[5], y, stateW, hsnH1);
    drawCell(doc, 'State Tax', COL_X[5], y, stateW, hsnH1, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName });

    // Row 2 Subheaders:
    const subY = y + hsnH1;
    // Col C: Rate
    drawBox(doc, COL_X[2], subY, COL_WIDTHS[2], hsnH2);
    drawCell(doc, 'Rate', COL_X[2], subY, COL_WIDTHS[2], hsnH2, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    // Cols D:E: Amount
    drawBox(doc, COL_X[3], subY, deW, hsnH2);
    drawCell(doc, 'Amount', COL_X[3], subY, deW, hsnH2, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    // Col F: Rate
    drawBox(doc, COL_X[5], subY, COL_WIDTHS[5], hsnH2);
    drawCell(doc, 'Rate', COL_X[5], subY, COL_WIDTHS[5], hsnH2, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    // Cols G:H: Amount
    drawBox(doc, COL_X[6], subY, ghW, hsnH2);
    drawCell(doc, 'Amount', COL_X[6], subY, ghW, hsnH2, { fontSize: 11, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 0.8 });

    y += hsnHeaderH;

    // HSN Data Rows (7.0 mm each): all boxed, 10.5pt to safely fit 8-digit codes
    hsnSummary.rows.forEach((row) => {
      const dRowH = 7.0;
      drawBox(doc, COL_X[0], y, COL_WIDTHS[0], dRowH);
      drawBox(doc, COL_X[1], y, COL_WIDTHS[1], dRowH);
      drawBox(doc, COL_X[2], y, COL_WIDTHS[2], dRowH);
      drawBox(doc, COL_X[3], y, deW, dRowH);
      drawBox(doc, COL_X[5], y, COL_WIDTHS[5], dRowH);
      drawBox(doc, COL_X[6], y, ghW, dRowH);

      drawCell(doc, String(row.hsn), COL_X[0], y, COL_WIDTHS[0], dRowH, { fontSize: 10.5, fontStyle: 'normal', align: 'center', valign: 'middle', fontName, padding: 0.8 });
      drawCell(doc, formatPlainAmount(row.taxablePaise), COL_X[1], y, COL_WIDTHS[1], dRowH, { fontSize: 11, fontStyle: 'normal', align: 'right', valign: 'middle', fontName, padding: 1.0 });
      drawCell(doc, `${row.centralRate}%`, COL_X[2], y, COL_WIDTHS[2], dRowH, { fontSize: 11, fontStyle: 'normal', align: 'center', valign: 'middle', fontName, padding: 0.8 });
      drawCell(doc, formatPlainAmount(row.centralTaxPaise), COL_X[3], y, deW, dRowH, { fontSize: 11, fontStyle: 'normal', align: 'center', valign: 'middle', fontName, padding: 0.8 });
      drawCell(doc, `${row.stateRate}%`, COL_X[5], y, COL_WIDTHS[5], dRowH, { fontSize: 11, fontStyle: 'normal', align: 'center', valign: 'middle', fontName, padding: 0.8 });
      drawCell(doc, formatPlainAmount(row.stateTaxPaise), COL_X[6], y, ghW, dRowH, { fontSize: 11, fontStyle: 'normal', align: 'center', valign: 'middle', fontName, padding: 0.8 });

      y += dRowH;
    });

    // Total(round off) row (7.0 mm): A:F merged 11.5pt regular label, G:H merged 11.5pt bold total tax
    const hsnTotH = 7.0;
    const afW = COL_X[6] - COL_X[0]; // 146.0 mm
    drawBox(doc, COL_X[0], y, afW, hsnTotH);
    drawBox(doc, COL_X[6], y, ghW, hsnTotH);

    drawCell(doc, 'Total(round off)', COL_X[0], y, afW, hsnTotH, { fontSize: 11.5, fontStyle: 'normal', align: 'left', valign: 'middle', fontName, padding: 1.2 });
    drawCell(doc, formatPlainAmount(hsnSummary.totalTaxPaise), COL_X[6], y, ghW, hsnTotH, { fontSize: 11.5, fontStyle: 'bold', align: 'center', valign: 'middle', fontName, padding: 1.2 });
    y += hsnTotH;

    // Amount in words row: A:B 11pt bold label, C:H 11.5pt bold text, TOP border only
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11.5);
    const taxWordsLines = getWrappedLines(doc, hsnSummary.taxInWords.toUpperCase(), rightW - 3.0, rightW);
    const taxWordsH = Math.max(7.5, taxWordsLines.length * 4.6 + 2.4);

    doc.line(COL_X[0], y, COL_X[8], y); // Top border only
    drawCell(doc, 'Amount in words', COL_X[0], y, leftW, taxWordsH, { fontSize: 11, fontStyle: 'bold', align: 'left', fontName, padding: 1.2 });
    drawCell(doc, taxWordsLines, COL_X[2], y, rightW, taxWordsH, { fontSize: 11.5, fontStyle: 'bold', align: 'left', fontName, padding: 1.2 });
    y += taxWordsH;

    // -------------------------------------------------------------
    // FOOTER (No borders):
    // Declaration (10pt, left). Then "For Khansa Enterprises" (11pt, right-aligned),
    // ~15mm blank space for signing, then "Customers Seal and Signature" at left (11pt bold)
    // and "Authorised Signature" at right (11pt bold).
    // -------------------------------------------------------------
    y += 2.5;

    // Declaration: 11pt left
    doc.setFont(fontName, 'normal');
    doc.setFontSize(11);
    const decText = `Declaration: ${firm.declaration || DEFAULT_FIRM.declaration}`;
    doc.text(decText, COL_X[0], y + 3.2);
    y += 7.0;

    // "For Khansa Enterprises" (11.5pt bold, right-aligned)
    doc.setFont(fontName, 'bold');
    doc.setFontSize(11.5);
    doc.text(`For ${firm.name || 'Khansa Enterprises'}`, COL_X[8], y + 3.2, { align: 'right' });
    y += 16.0; // ~15mm blank space for signing

    // Signatures (12pt bold)
    doc.setFont(fontName, 'bold');
    doc.setFontSize(12);
    doc.text('Customers Seal and Signature', COL_X[0], y);
    doc.text('Authorised Signatory', COL_X[8], y, { align: 'right' });

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
