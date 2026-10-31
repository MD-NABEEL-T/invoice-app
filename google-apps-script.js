/**
 * =============================================================================
 * Khansa Enterprises - Google Apps Script Invoice Webhook with PDF Attachment
 * =============================================================================
 *
 * Automatically generates a professional A4 GST Tax Invoice PDF and emails it
 * directly to the owners whenever a bill is saved or edited.
 *
 * HOW TO UPDATE YOUR DEPLOYMENT:
 * 1. Open your Google Sheet (Extensions > Apps Script) or https://script.google.com
 * 2. Select all existing code in Code.gs and replace it with this file.
 * 3. Click "Save" (disk icon or Ctrl+S).
 * 4. Click "Deploy" > "Manage deployments".
 * 5. Click the pencil icon (Edit) on your Active deployment.
 * 6. Under "Version", select "New version".
 * 7. Click "Deploy" and "Done".
 *
 * (You can also test it immediately inside Apps Script by selecting
 *  'testSendSampleInvoiceWithPdf' from the function dropdown and clicking 'Run'!)
 * =============================================================================
 */

// Both emails will receive the email notification and attached PDF
const DEFAULT_RECIPIENT_EMAIL = 'khansaenterprises19@gmail.com,mohammedfazfaz@gmail.com';

const FIRM = {
  name: 'KHANSA ENTERPRISES',
  address: '1/19, MOSQUE STREET, MELVISHARAM - 632 509,\nRANIPET DIST., TAMIL NADU',
  gstin: '33AGXPF4947Q1ZH',
  state: 'Tamil Nadu',
  stateCode: '33',
  bankName: 'INDIAN OVERSEAS BANK',
  branch: 'MELVISHARAM',
  accountNo: '005402000001850',
  ifsc: 'IOBA0000054',
};

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'active',
      app: 'Khansa Enterprises GST Invoicing Webhook with PDF',
      timestamp: new Date().toISOString(),
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(
        JSON.stringify({ status: 'error', message: 'No payload received' })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    const data = JSON.parse(e.postData.contents);
    const action = data.action || 'Bill Saved';
    const invoiceNo = data.invoice_no || 'Draft';
    const date = data.date || new Date().toISOString().slice(0, 10);
    const buyerName = data.buyer_name || 'KH EXPORT INDIA PVT LTD';
    const payableRupees = data.payable_rupees || (data.payable_paise ? (data.payable_paise / 100).toFixed(2) : '0.00');

    // 1. Determine recipients (ensure both configured emails receive it)
    let recipient = DEFAULT_RECIPIENT_EMAIL;
    if (data.email_to && data.email_to !== DEFAULT_RECIPIENT_EMAIL) {
      const existing = DEFAULT_RECIPIENT_EMAIL.split(',').map(function(s) { return s.trim(); });
      if (existing.indexOf(data.email_to.trim()) === -1) {
        recipient = DEFAULT_RECIPIENT_EMAIL + ',' + data.email_to.trim();
      }
    }

    // 2. Build the A4 GST Tax Invoice PDF
    let attachments = [];
    if (data.pdf_base64) {
      try {
        const decoded = Utilities.base64Decode(data.pdf_base64);
        const clientBlob = Utilities.newBlob(decoded, 'application/pdf', getPdfFilename(invoiceNo));
        attachments.push(clientBlob);
      } catch (decodeErr) {
        console.warn('Client base64 decode failed, generating PDF from template:', decodeErr);
      }
    }

    if (attachments.length === 0) {
      const pdfHtml = buildInvoicePdfHtml(data);
      const pdfBlob = Utilities.newBlob(pdfHtml, 'text/html', 'Invoice.html')
        .getAs('application/pdf')
        .setName(getPdfFilename(invoiceNo));
      attachments.push(pdfBlob);
    }

    // 3. Build Responsive HTML Notification Body
    const emailHtml = buildNotificationEmailHtml(data, action);
    const emailSubject = '[' + action + '] Invoice #' + invoiceNo + ' - ' + buyerName + ' (₹' + payableRupees + ')';

    // 4. Send Email via Google Apps Script MailApp with attached PDF
    MailApp.sendEmail({
      to: recipient,
      subject: emailSubject,
      htmlBody: emailHtml,
      attachments: attachments,
      name: 'Khansa Enterprises Invoicing',
    });

    // 5. Optionally record in Google Sheet if this script is linked to a Sheet
    try {
      const activeSheet = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSheet) {
        let sheet = activeSheet.getSheetByName('Invoices') || activeSheet.getActiveSheet();
        sheet.appendRow([
          new Date(),
          action,
          invoiceNo,
          date,
          buyerName,
          data.buyer_address || '',
          data.buyer_order_no || '',
          data.despatched_through || '',
          Number(data.taxable_rupees || 0),
          Number(data.cgst_rupees || 0),
          Number(data.sgst_rupees || 0),
          Number(payableRupees),
          recipient,
        ]);
      }
    } catch (sheetErr) {
      console.warn('Sheet append skipped or not available:', sheetErr);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        invoice_no: invoiceNo,
        sent_to: recipient,
        pdf_attached: true,
      })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'error',
        error: err.toString(),
      })
    ).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Generate a clean safe filename for the PDF attachment
 */
function getPdfFilename(invoiceNo) {
  const clean = (invoiceNo || 'Draft').replace(/[/\\?%*:|"<>]/g, '_');
  return 'Invoice-' + clean + '.pdf';
}

/**
 * Escape HTML to ensure safe rendering
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Converts a number to Indian currency words
 */
function numberToWordsIndian(num) {
  if (!num || isNaN(num)) return '';
  const rounded = Math.round(Number(num));
  if (rounded === 0) return 'Zero';

  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convert(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 !== 0 ? ' and ' + convert(n % 100) : '');
    if (n < 100000) return convert(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 !== 0 ? ' ' + convert(n % 1000) : '');
    if (n < 10000000) return convert(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 !== 0 ? ' ' + convert(n % 100000) : '');
    return convert(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 !== 0 ? ' ' + convert(n % 10000000) : '');
  }

  return convert(rounded);
}

/**
 * Build the exact A4 GST Tax Invoice HTML for conversion to PDF
 */
function buildInvoicePdfHtml(data) {
  const invoiceNo = escapeHtml(data.invoice_no || 'Draft');
  const date = escapeHtml(data.date || new Date().toISOString().slice(0, 10));
  const buyerName = escapeHtml(data.buyer_name || 'KH EXPORT INDIA PVT LTD');
  const buyerAddress = escapeHtml(data.buyer_address || '').replace(/\n/g, '<br>');
  const buyerGstin = escapeHtml(data.buyer_gstin || '-');
  const buyerState = escapeHtml(data.buyer_state || 'Tamil Nadu');
  const buyerStateCode = escapeHtml(data.buyer_state_code || '33');
  const buyerOrderNo = escapeHtml(data.buyer_order_no || '-');
  const buyerOrderDate = escapeHtml(data.buyer_order_date || '-');
  const despatchedThrough = escapeHtml(data.despatched_through || '-');
  const destination = escapeHtml(data.destination || '-');
  const termsOfDelivery = escapeHtml(data.terms_of_delivery || '-');

  const payableRupees = data.payable_rupees || (data.payable_paise ? (data.payable_paise / 100).toFixed(2) : '0.00');
  const taxableRupees = data.taxable_rupees || (data.taxable_paise ? (data.taxable_paise / 100).toFixed(2) : '0.00');
  const cgstRupees = data.cgst_rupees || (data.cgst_paise ? (data.cgst_paise / 100).toFixed(2) : '0.00');
  const sgstRupees = data.sgst_rupees || (data.sgst_paise ? (data.sgst_paise / 100).toFixed(2) : '0.00');
  const amountWords = data.amount_in_words || ('INR ' + numberToWordsIndian(payableRupees) + ' Only');

  const lines = data.lines || [];

  // Group by HSN for HSN summary table
  const hsnMap = {};
  lines.forEach(function(l) {
    const hsnKey = l.hsn || 'MISC';
    const rateVal = parseFloat(l.gst_percent || 5);
    const halfRate = (rateVal / 2).toFixed(1);
    const taxable = parseFloat(l.amount_rupees || 0);

    if (!hsnMap[hsnKey]) {
      hsnMap[hsnKey] = {
        hsn: hsnKey,
        taxable: 0,
        rateHalf: halfRate,
        cgst: 0,
        sgst: 0,
      };
    }
    hsnMap[hsnKey].taxable += taxable;
  });

  let totalTaxableSummary = 0;
  let totalCgstSummary = 0;
  let totalSgstSummary = 0;

  const hsnSummaryRows = Object.keys(hsnMap).map(function(k) {
    const item = hsnMap[k];
    const cgstAmt = (item.taxable * parseFloat(item.rateHalf) / 100);
    const sgstAmt = cgstAmt;
    totalTaxableSummary += item.taxable;
    totalCgstSummary += cgstAmt;
    totalSgstSummary += sgstAmt;

    return (
      '<tr>' +
        '<td style="border:1px solid #000; padding:4px; text-align:center;">' + item.hsn + '</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:right;">₹' + item.taxable.toFixed(2) + '</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:center;">' + item.rateHalf + '%</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:right;">₹' + cgstAmt.toFixed(2) + '</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:center;">' + item.rateHalf + '%</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:right;">₹' + sgstAmt.toFixed(2) + '</td>' +
        '<td style="border:1px solid #000; padding:4px; text-align:right; font-weight:bold;">₹' + (cgstAmt + sgstAmt).toFixed(2) + '</td>' +
      '</tr>'
    );
  }).join('');

  // Items rows
  let itemsRows = '';
  lines.forEach(function(l, idx) {
    const rateFormatted = l.rate || (l.rate_paise ? (l.rate_paise / 100).toFixed(2) : '-');
    const amtFormatted = l.amount_rupees || (l.taxable_value_paise ? (l.taxable_value_paise / 100).toFixed(2) : '-');
    itemsRows += (
      '<tr>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:center;">' + (idx + 1) + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; font-weight:bold;">' + escapeHtml(l.description || '-') + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:center;">' + escapeHtml(l.hsn || '-') + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:center;">' + (l.quantity || 1) + ' ' + escapeHtml(l.unit || 'PCS') + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:right;">' + rateFormatted + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:center;">' + escapeHtml(l.unit || 'PCS') + '</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:4px 6px; text-align:right; font-weight:bold;">₹' + amtFormatted + '</td>' +
      '</tr>'
    );
  });

  // Empty spacer rows to maintain A4 invoice grid proportions
  const emptyCount = Math.max(0, 6 - lines.length);
  for (let s = 0; s < emptyCount; s++) {
    itemsRows += (
      '<tr>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
        '<td style="border-left:1px solid #000; border-right:1px solid #000; padding:8px;">&nbsp;</td>' +
      '</tr>'
    );
  }

  // Complete HTML document for Google Apps Script HTML-to-PDF engine
  return (
    '<!DOCTYPE html>' +
    '<html>' +
    '<head>' +
      '<meta charset="utf-8">' +
      '<title>Invoice #' + invoiceNo + '</title>' +
      '<style>' +
        '@page { size: A4 portrait; margin: 8mm 8mm 8mm 8mm; }' +
        'body { font-family: Arial, "Helvetica Neue", Helvetica, sans-serif; font-size: 10px; color: #000000; margin: 0; padding: 0; }' +
        '.invoice-card { border: 2px solid #000000; width: 100%; box-sizing: border-box; }' +
        'table { width: 100%; border-collapse: collapse; }' +
      '</style>' +
    '</head>' +
    '<body>' +
      '<div class="invoice-card">' +

        // Top Header
        '<div style="text-align:center; padding: 6px; border-bottom: 2px solid #000000;">' +
          '<div style="font-size: 14px; font-weight: bold; letter-spacing: 1px;">TAX INVOICE</div>' +
          '<div style="font-size: 9px; font-style: italic;">(Original for Recipient)</div>' +
        '</div>' +

        // Supplier and Invoice Details Table
        '<table style="width: 100%; border-bottom: 2px solid #000000;">' +
          '<tr>' +
            // Supplier Box
            '<td style="width: 52%; vertical-align: top; border-right: 1px solid #000000; padding: 6px;">' +
              '<div style="font-size: 13px; font-weight: bold; text-transform: uppercase;">' + FIRM.name + '</div>' +
              '<div style="font-size: 9px; margin-top: 3px; line-height: 1.3;">' + FIRM.address.replace(/\n/g, '<br>') + '</div>' +
              '<div style="font-size: 9px; margin-top: 4px;">' +
                '<b>GSTIN/UIN:</b> ' + FIRM.gstin + '<br>' +
                '<b>State Name:</b> ' + FIRM.state + ', <b>Code:</b> ' + FIRM.stateCode +
              '</div>' +
            '</td>' +

            // Invoice Metadata Box
            '<td style="width: 48%; vertical-align: top; padding: 0;">' +
              '<table style="width: 100%;">' +
                '<tr>' +
                  '<td style="width: 50%; border-right: 1px solid #000000; border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Invoice No.</div>' +
                    '<div style="font-size: 11px; font-weight: bold;">' + invoiceNo + '</div>' +
                  '</td>' +
                  '<td style="width: 50%; border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Dated</div>' +
                    '<div style="font-size: 10px; font-weight: bold;">' + date + '</div>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="border-right: 1px solid #000000; border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Buyer’s Order No.</div>' +
                    '<div style="font-size: 10px; font-weight: bold;">' + buyerOrderNo + '</div>' +
                  '</td>' +
                  '<td style="border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Order Dated</div>' +
                    '<div style="font-size: 10px;">' + buyerOrderDate + '</div>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td style="border-right: 1px solid #000000; border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Despatched through</div>' +
                    '<div style="font-size: 10px;">' + despatchedThrough + '</div>' +
                  '</td>' +
                  '<td style="border-bottom: 1px solid #000000; padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Destination</div>' +
                    '<div style="font-size: 10px;">' + destination + '</div>' +
                  '</td>' +
                '</tr>' +
                '<tr>' +
                  '<td colspan="2" style="padding: 4px;">' +
                    '<div style="font-size: 8px; color: #555;">Terms of Delivery</div>' +
                    '<div style="font-size: 9px;">' + termsOfDelivery + '</div>' +
                  '</td>' +
                '</tr>' +
              '</table>' +
            '</td>' +
          '</tr>' +

          // Buyer Section
          '<tr>' +
            '<td colspan="2" style="border-top: 1px solid #000000; padding: 6px; background-color: #fbfbfb;">' +
              '<div style="font-size: 8px; font-weight: bold; text-transform: uppercase; color: #555;">Buyer (Bill to)</div>' +
              '<div style="font-size: 11px; font-weight: bold; text-transform: uppercase; margin-top: 1px;">' + buyerName + '</div>' +
              (buyerAddress ? '<div style="font-size: 9px; margin-top: 2px;">' + buyerAddress + '</div>' : '') +
              '<div style="font-size: 9px; margin-top: 2px;">' +
                '<b>GSTIN/UIN:</b> ' + buyerGstin + ' &nbsp;&nbsp;|&nbsp;&nbsp; ' +
                '<b>State Name:</b> ' + buyerState + ', <b>Code:</b> ' + buyerStateCode +
              '</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +

        // Line Items Table
        '<table style="width: 100%; border-bottom: 2px solid #000000;">' +
          '<thead>' +
            '<tr style="background-color: #f0f0f0; border-bottom: 1px solid #000000;">' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 5%; text-align: center;">S.No</th>' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 45%; text-align: left;">Description of Goods</th>' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 12%; text-align: center;">HSN/SAC</th>' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 12%; text-align: center;">Quantity</th>' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 9%; text-align: right;">Rate</th>' +
              '<th style="border-right: 1px solid #000000; padding: 5px; width: 5%; text-align: center;">per</th>' +
              '<th style="padding: 5px; width: 12%; text-align: right;">Amount (₹)</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' +
            itemsRows +
            // Subtotal / Taxable Row
            '<tr style="border-top: 1px solid #000000;">' +
              '<td colspan="6" style="border-right: 1px solid #000000; padding: 4px 6px; text-align: right; font-weight: bold;">Taxable Value:</td>' +
              '<td style="padding: 4px 6px; text-align: right; font-weight: bold;">₹' + taxableRupees + '</td>' +
            '</tr>' +
            // CGST Row
            '<tr>' +
              '<td colspan="6" style="border-right: 1px solid #000000; padding: 3px 6px; text-align: right; color: #444;">Output CGST:</td>' +
              '<td style="padding: 3px 6px; text-align: right;">₹' + cgstRupees + '</td>' +
            '</tr>' +
            // SGST Row
            '<tr>' +
              '<td colspan="6" style="border-right: 1px solid #000000; padding: 3px 6px; text-align: right; color: #444;">Output SGST:</td>' +
              '<td style="padding: 3px 6px; text-align: right;">₹' + sgstRupees + '</td>' +
            '</tr>' +
            // Total Row
            '<tr style="border-top: 2px solid #000000; background-color: #f7f7f7;">' +
              '<td colspan="6" style="border-right: 1px solid #000000; padding: 5px 6px; text-align: right; font-size: 11px; font-weight: bold;">TOTAL:</td>' +
              '<td style="padding: 5px 6px; text-align: right; font-size: 12px; font-weight: bold;">₹' + payableRupees + '</td>' +
            '</tr>' +
          '</tbody>' +
        '</table>' +

        // Amount in Words
        '<div style="padding: 6px 8px; border-bottom: 1px solid #000000; font-size: 10px;">' +
          '<b>Amount Chargeable (in words):</b><br>' +
          '<span style="font-weight: bold; text-transform: uppercase;">' + escapeHtml(amountWords) + '</span>' +
        '</div>' +

        // HSN Summary Section
        '<div style="padding: 6px 8px; border-bottom: 1px solid #000000;">' +
          '<div style="font-size: 9px; font-weight: bold; margin-bottom: 4px; text-transform: uppercase;">Tax Amount (in words): HSN/SAC Breakdown</div>' +
          '<table style="width: 100%; border: 1px solid #000000; font-size: 9px;">' +
            '<thead>' +
              '<tr style="background-color: #f0f0f0;">' +
                '<th rowspan="2" style="border: 1px solid #000; padding: 3px;">HSN/SAC</th>' +
                '<th rowspan="2" style="border: 1px solid #000; padding: 3px;">Taxable Value</th>' +
                '<th colspan="2" style="border: 1px solid #000; padding: 3px;">Central Tax</th>' +
                '<th colspan="2" style="border: 1px solid #000; padding: 3px;">State Tax</th>' +
                '<th rowspan="2" style="border: 1px solid #000; padding: 3px;">Total Tax</th>' +
              '</tr>' +
              '<tr style="background-color: #f0f0f0;">' +
                '<th style="border: 1px solid #000; padding: 2px;">Rate</th>' +
                '<th style="border: 1px solid #000; padding: 2px;">Amount</th>' +
                '<th style="border: 1px solid #000; padding: 2px;">Rate</th>' +
                '<th style="border: 1px solid #000; padding: 2px;">Amount</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody>' +
              hsnSummaryRows +
              '<tr style="font-weight: bold; background-color: #f7f7f7;">' +
                '<td style="border: 1px solid #000; padding: 3px; text-align: center;">Total</td>' +
                '<td style="border: 1px solid #000; padding: 3px; text-align: right;">₹' + totalTaxableSummary.toFixed(2) + '</td>' +
                '<td style="border: 1px solid #000; padding: 3px;">&nbsp;</td>' +
                '<td style="border: 1px solid #000; padding: 3px; text-align: right;">₹' + totalCgstSummary.toFixed(2) + '</td>' +
                '<td style="border: 1px solid #000; padding: 3px;">&nbsp;</td>' +
                '<td style="border: 1px solid #000; padding: 3px; text-align: right;">₹' + totalSgstSummary.toFixed(2) + '</td>' +
                '<td style="border: 1px solid #000; padding: 3px; text-align: right;">₹' + (totalCgstSummary + totalSgstSummary).toFixed(2) + '</td>' +
              '</tr>' +
            '</tbody>' +
          '</table>' +
        '</div>' +

        // Bank Details & Declaration
        '<table style="width: 100%; border-bottom: 2px solid #000000;">' +
          '<tr>' +
            '<td style="width: 50%; vertical-align: top; border-right: 1px solid #000000; padding: 6px; font-size: 9px;">' +
              '<b>Company’s Bank Details:</b><br>' +
              'Bank Name: <b>' + FIRM.bankName + '</b><br>' +
              'A/c No.: <b>' + FIRM.accountNo + '</b><br>' +
              'Branch & IFS Code: <b>' + FIRM.branch + ' &amp; ' + FIRM.ifsc + '</b>' +
            '</td>' +
            '<td style="width: 50%; vertical-align: top; padding: 6px; font-size: 8.5px; color: #444;">' +
              '<b>Declaration:</b><br>' +
              'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.' +
            '</td>' +
          '</tr>' +
        '</table>' +

        // Signatures (Pinned at bottom)
        '<table style="width: 100%; height: 90px;">' +
          '<tr>' +
            '<td style="width: 50%; vertical-align: bottom; border-right: 1px solid #000000; padding: 8px; font-size: 9px; font-weight: bold;">' +
              'Customer’s Seal and Signature' +
            '</td>' +
            '<td style="width: 50%; vertical-align: bottom; text-align: right; padding: 8px; font-size: 9px;">' +
              '<div style="margin-bottom: 40px; font-weight: bold;">for ' + FIRM.name + '</div>' +
              '<div style="font-weight: bold;">Authorised Signatory</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +

      '</div>' +
    '</body>' +
    '</html>'
  );
}

/**
 * Mobile-friendly notification body for the email view
 */
function buildNotificationEmailHtml(data, action) {
  const invoiceNo = escapeHtml(data.invoice_no || 'Draft');
  const date = escapeHtml(data.date || new Date().toISOString().slice(0, 10));
  const buyerName = escapeHtml(data.buyer_name || 'KH EXPORT INDIA PVT LTD');
  const buyerAddress = escapeHtml(data.buyer_address || '');
  const payableRupees = data.payable_rupees || (data.payable_paise ? (data.payable_paise / 100).toFixed(2) : '0.00');
  const taxableRupees = data.taxable_rupees || (data.taxable_paise ? (data.taxable_paise / 100).toFixed(2) : '0.00');
  const cgstRupees = data.cgst_rupees || (data.cgst_paise ? (data.cgst_paise / 100).toFixed(2) : '0.00');
  const sgstRupees = data.sgst_rupees || (data.sgst_paise ? (data.sgst_paise / 100).toFixed(2) : '0.00');
  const lines = data.lines || [];

  let linesHtml = lines.map(function(item, idx) {
    const rate = item.rate || (item.rate_paise ? (item.rate_paise / 100).toFixed(2) : '-');
    const amt = item.amount_rupees || (item.taxable_value_paise ? (item.taxable_value_paise / 100).toFixed(2) : '-');
    return (
      '<tr style="border-bottom:1px solid #e2e8f0;">' +
        '<td style="padding:8px;text-align:center;">' + (idx + 1) + '</td>' +
        '<td style="padding:8px;font-weight:bold;">' + escapeHtml(item.description || '-') + '</td>' +
        '<td style="padding:8px;text-align:center;">' + escapeHtml(item.hsn || '-') + '</td>' +
        '<td style="padding:8px;text-align:center;">' + (item.quantity || 1) + ' ' + escapeHtml(item.unit || 'PCS') + '</td>' +
        '<td style="padding:8px;text-align:right;">₹' + rate + '</td>' +
        '<td style="padding:8px;text-align:center;">' + (item.gst_percent ? item.gst_percent + '%' : '-') + '</td>' +
        '<td style="padding:8px;text-align:right;font-weight:bold;">₹' + amt + '</td>' +
      '</tr>'
    );
  }).join('');

  return (
    '<div style="font-family:Arial,sans-serif;max-width:650px;margin:auto;border:1px solid #cbd5e1;border-radius:12px;overflow:hidden;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);">' +
      '<div style="background:#0f172a;color:#ffffff;padding:20px;">' +
        '<h2 style="margin:0;font-size:18px;letter-spacing:0.5px;">KHANSA ENTERPRISES</h2>' +
        '<p style="margin:4px 0 0;font-size:12px;color:#94a3b8;">' +
          action + ' — Invoice #' + invoiceNo + ' (' + date + ')' +
        '</p>' +
      '</div>' +

      '<div style="padding:14px 20px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:13px;">' +
        '<strong>Billed To:</strong> ' + buyerName + '<br>' +
        (buyerAddress ? '<span style="color:#64748b;font-size:12px;white-space:pre-line;">' + buyerAddress + '</span>' : '') +
      '</div>' +

      '<div style="padding:16px 20px;">' +
        '<div style="font-size:12px;font-weight:bold;color:#475569;margin-bottom:8px;text-transform:uppercase;">Invoice Items</div>' +
        '<table style="width:100%;border-collapse:collapse;font-size:12px;">' +
          '<thead>' +
            '<tr style="background:#f1f5f9;color:#475569;">' +
              '<th style="padding:6px;text-align:center;">#</th>' +
              '<th style="padding:6px;text-align:left;">Description</th>' +
              '<th style="padding:6px;text-align:center;">HSN</th>' +
              '<th style="padding:6px;text-align:center;">Qty</th>' +
              '<th style="padding:6px;text-align:right;">Rate</th>' +
              '<th style="padding:6px;text-align:center;">GST</th>' +
              '<th style="padding:6px;text-align:right;">Amount</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + linesHtml + '</tbody>' +
        '</table>' +
      '</div>' +

      '<div style="padding:16px 20px;background:#f8fafc;border-top:1px solid #e2e8f0;text-align:right;font-size:13px;">' +
        '<div>Taxable: ₹' + taxableRupees + ' | CGST: ₹' + cgstRupees + ' | SGST: ₹' + sgstRupees + '</div>' +
        '<div style="font-size:20px;font-weight:bold;color:#1e3a8a;margin-top:6px;">Total Payable: ₹' + payableRupees + '</div>' +
      '</div>' +

      '<div style="padding:12px 20px;background:#e2e8f0;text-align:center;font-size:11px;color:#334155;">' +
        '📎 <b>The official GST Tax Invoice PDF is attached to this email.</b>' +
      '</div>' +
    '</div>'
  );
}

/**
 * Run this test function directly inside Google Apps Script editor
 * to verify the email and PDF attachment immediately!
 */
function testSendSampleInvoiceWithPdf() {
  const sampleData = {
    action: 'Test Dispatch',
    invoice_no: 'TEST/001/26-27',
    date: '2026-10-31',
    buyer_name: 'KH EXPORT INDIA PRIVATE LIMITED',
    buyer_address: 'DIVISION UNIT-2, PLOT NO.67-72, PHASE-1, SIPCOT\nRANIPET - 632 403',
    buyer_gstin: '33AAACK4841R1ZA',
    buyer_state: 'Tamil Nadu',
    buyer_state_code: '33',
    buyer_order_no: 'PO/2026/99',
    buyer_order_date: '2026-10-30',
    despatched_through: 'Lorry / By Road',
    destination: 'SIPCOT RANIPET',
    terms_of_delivery: 'Immediate',
    taxable_rupees: '2635.33',
    cgst_rupees: '65.88',
    sgst_rupees: '65.88',
    payable_rupees: '2767.10',
    amount_in_words: 'INR Two Thousand Seven Hundred Sixty Seven and Ten Paise Only',
    lines: [
      {
        description: 'BUN HEAD (PLASTIC)',
        hsn: '39269099',
        quantity: '24.000',
        unit: 'PCS',
        rate: '10.50',
        gst_percent: '5',
        amount_rupees: '252.00',
      },
      {
        description: 'CHEST ROLLER BUSH',
        hsn: '84539000',
        quantity: '50.000',
        unit: 'PCS',
        rate: '47.66',
        gst_percent: '5',
        amount_rupees: '2383.33',
      },
    ],
  };

  const fakeEvent = {
    postData: {
      contents: JSON.stringify(sampleData),
    },
  };

  const result = doPost(fakeEvent);
  Logger.log('Result: ' + result.getContent());
}
