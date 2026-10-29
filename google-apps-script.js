/**
 * =============================================================================
 * Khansa Enterprises - Google Apps Script Invoice Webhook
 * =============================================================================
 *
 * HOW TO DEPLOY:
 * 1. Open Google Sheets (or script.google.com).
 * 2. Click "Extensions" > "Apps Script".
 * 3. Replace all code in Code.gs with this file.
 * 4. Set DEFAULT_RECIPIENT_EMAIL below to your desired email address.
 * 5. Click "Deploy" > "New deployment".
 * 6. Select type: "Web app".
 * 7. Set:
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"  <-- CRITICAL!
 * 8. Click "Deploy", authorize permissions, and copy the Web App URL:
 *    (e.g., https://script.google.com/macros/s/.../exec)
 * 9. Paste that URL into Settings > Google Apps Script Webhook in your invoice app.
 * =============================================================================
 */

// Fallback recipient email (can also be passed dynamically in the webhook payload)
const DEFAULT_RECIPIENT_EMAIL = 'khansaenterprises19@gmail.com';

function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: 'active',
      app: 'Khansa Enterprises GST Invoicing Webhook',
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
    const recipient = data.email_to || DEFAULT_RECIPIENT_EMAIL;
    const action = data.action || 'Bill Saved';
    const invoiceNo = data.invoice_no || 'Draft';
    const date = data.date || new Date().toISOString().slice(0, 10);
    const buyerName = data.buyer_name || 'KH EXPORT INDIA PVT LTD';
    const buyerAddress = data.buyer_address || '';
    const buyerOrderNo = data.buyer_order_no || '-';
    const despatchedThrough = data.despatched_through || '-';
    const payableRupees = data.payable_rupees || (data.payable_paise ? (data.payable_paise / 100).toFixed(2) : '0.00');
    const taxableRupees = data.taxable_rupees || (data.taxable_paise ? (data.taxable_paise / 100).toFixed(2) : '0.00');
    const cgstRupees = data.cgst_rupees || (data.cgst_paise ? (data.cgst_paise / 100).toFixed(2) : '0.00');
    const sgstRupees = data.sgst_rupees || (data.sgst_paise ? (data.sgst_paise / 100).toFixed(2) : '0.00');
    const lines = data.lines || [];

    // 1. Build Line Items HTML rows
    let linesHtml = '';
    if (lines.length > 0) {
      linesHtml = lines.map(function(item, idx) {
        const rateFormatted = item.rate || (item.rate_paise ? (item.rate_paise / 100).toFixed(2) : '-');
        const amountFormatted = item.amount_rupees || (item.taxable_value_paise ? (item.taxable_value_paise / 100).toFixed(2) : '-');
        return (
          '<tr style="border-bottom: 1px solid #e2e8f0;">' +
            '<td style="padding: 10px 8px; text-align: center; color: #64748b; font-weight: bold;">' + (idx + 1) + '</td>' +
            '<td style="padding: 10px 8px; font-weight: bold; color: #0f172a;">' + (item.description || '-') + '</td>' +
            '<td style="padding: 10px 8px; text-align: center; font-family: monospace; color: #475569;">' + (item.hsn || '-') + '</td>' +
            '<td style="padding: 10px 8px; text-align: center; color: #334155;">' + (item.quantity || 1) + ' ' + (item.unit || 'PCS') + '</td>' +
            '<td style="padding: 10px 8px; text-align: right; font-family: monospace; color: #334155;">₹' + rateFormatted + '</td>' +
            '<td style="padding: 10px 8px; text-align: center; color: #334155;">' + (item.gst_percent ? item.gst_percent + '%' : '-') + '</td>' +
            '<td style="padding: 10px 8px; text-align: right; font-family: monospace; font-weight: bold; color: #0f172a;">₹' + amountFormatted + '</td>' +
          '</tr>'
        );
      }).join('');
    } else {
      linesHtml = '<tr><td colspan="7" style="padding: 12px; text-align: center; color: #64748b;">No line items detailed</td></tr>';
    }

    // 2. Build Full Responsive HTML Email
    const emailSubject = '[' + action + '] Invoice #' + invoiceNo + ' (' + buyerName + ') - ₹' + payableRupees;

    const emailHtml = (
      '<!DOCTYPE html>' +
      '<html>' +
      '<head><meta charset="utf-8"></head>' +
      '<body style="margin: 0; padding: 20px; font-family: Arial, -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f1f5f9; color: #0f172a;">' +
        '<div style="max-width: 680px; margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #cbd5e1;">' +
          
          // Header Banner
          '<div style="background-color: #0f172a; padding: 24px; color: #ffffff;">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
              '<tr>' +
                '<td>' +
                  '<div style="font-size: 11px; font-weight: bold; letter-spacing: 0.1em; color: #94a3b8; text-transform: uppercase;">GST Tax Invoice Copy</div>' +
                  '<div style="font-size: 22px; font-weight: 900; margin-top: 4px; letter-spacing: 0.05em; text-transform: uppercase;">Khansa Enterprises</div>' +
                  '<div style="font-size: 11px; color: #cbd5e1; margin-top: 2px;">Melvisharam-632509, Tamil Nadu &bull; GSTIN: 33AGXPF4947Q1ZH</div>' +
                '</td>' +
                '<td align="right" valign="top">' +
                  '<span style="background-color: #2563eb; color: #ffffff; font-size: 12px; font-weight: 800; padding: 6px 14px; border-radius: 9999px; text-transform: uppercase; display: inline-block;">' +
                    action +
                  '</span>' +
                '</td>' +
              '</tr>' +
            '</table>' +
          '</div>' +

          // Main Summary Grid
          '<div style="padding: 24px;">' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 24px;">' +
              '<tr>' +
                '<td style="padding: 14px 16px; border-right: 1px solid #e2e8f0; width: 50%;" valign="top">' +
                  '<div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Invoice Number</div>' +
                  '<div style="font-size: 18px; font-weight: 900; color: #0f172a; font-family: monospace; margin-top: 2px;">' + invoiceNo + '</div>' +
                  '<div style="font-size: 11px; color: #64748b; margin-top: 6px;">Date: <b style="color: #0f172a;">' + date + '</b></div>' +
                '</td>' +
                '<td style="padding: 14px 16px; width: 50%;" valign="top">' +
                  '<div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Buyer Order (PO)</div>' +
                  '<div style="font-size: 16px; font-weight: 800; color: #0f172a; margin-top: 2px;">' + buyerOrderNo + '</div>' +
                  '<div style="font-size: 11px; color: #64748b; margin-top: 6px;">Despatched Via: <b style="color: #0f172a;">' + despatchedThrough + '</b></div>' +
                '</td>' +
              '</tr>' +
              '<tr style="border-top: 1px solid #e2e8f0;">' +
                '<td colspan="2" style="padding: 14px 16px;">' +
                  '<div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase;">Billed &amp; Delivered To</div>' +
                  '<div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">' + buyerName + '</div>' +
                  (buyerAddress ? '<div style="font-size: 12px; color: #475569; margin-top: 4px; white-space: pre-line;">' + buyerAddress + '</div>' : '') +
                '</td>' +
              '</tr>' +
            '</table>' +

            // Line Items Table
            '<div style="font-size: 14px; font-weight: 900; color: #0f172a; margin-bottom: 10px; text-transform: uppercase; letter-spacing: 0.05em;">' +
              'Invoice Items (' + lines.length + ')' +
            '</div>' +
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; margin-bottom: 24px; font-size: 12px;">' +
              '<thead style="background-color: #f1f5f9; border-bottom: 2px solid #cbd5e1;">' +
                '<tr>' +
                  '<th style="padding: 10px 8px; text-align: center; color: #475569; font-weight: 800;">#</th>' +
                  '<th style="padding: 10px 8px; text-align: left; color: #475569; font-weight: 800;">Description</th>' +
                  '<th style="padding: 10px 8px; text-align: center; color: #475569; font-weight: 800;">HSN</th>' +
                  '<th style="padding: 10px 8px; text-align: center; color: #475569; font-weight: 800;">Qty</th>' +
                  '<th style="padding: 10px 8px; text-align: right; color: #475569; font-weight: 800;">Rate</th>' +
                  '<th style="padding: 10px 8px; text-align: center; color: #475569; font-weight: 800;">GST</th>' +
                  '<th style="padding: 10px 8px; text-align: right; color: #475569; font-weight: 800;">Taxable (₹)</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody>' +
                linesHtml +
              '</tbody>' +
            '</table>' +

            // Grand Total Summary Box
            '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #f8fafc; border: 2px solid #0f172a; border-radius: 12px; padding: 16px;">' +
              '<tr>' +
                '<td style="font-size: 13px; color: #475569; padding: 4px 0;">Taxable Value:</td>' +
                '<td align="right" style="font-size: 14px; font-family: monospace; font-weight: bold; color: #0f172a; padding: 4px 0;">₹' + taxableRupees + '</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-size: 13px; color: #475569; padding: 4px 0;">CGST (Central Tax):</td>' +
                '<td align="right" style="font-size: 14px; font-family: monospace; font-weight: bold; color: #0f172a; padding: 4px 0;">₹' + cgstRupees + '</td>' +
              '</tr>' +
              '<tr>' +
                '<td style="font-size: 13px; color: #475569; padding: 4px 0;">SGST (State Tax):</td>' +
                '<td align="right" style="font-size: 14px; font-family: monospace; font-weight: bold; color: #0f172a; padding: 4px 0;">₹' + sgstRupees + '</td>' +
              '</tr>' +
              '<tr style="border-top: 2px solid #0f172a;">' +
                '<td style="font-size: 16px; font-weight: 900; color: #0f172a; padding-top: 10px;">TOTAL PAYABLE:</td>' +
                '<td align="right" style="font-size: 22px; font-family: monospace; font-weight: 900; color: #1e3a8a; padding-top: 10px;">₹' + payableRupees + '</td>' +
              '</tr>' +
            '</table>' +
          '</div>' +

          // Footer
          '<div style="background-color: #f8fafc; border-top: 1px solid #e2e8f0; padding: 16px; text-align: center; font-size: 11px; color: #64748b;">' +
            'Automated invoice notification sent by Khansa Enterprises GST Invoicing System.<br>' +
            'For questions or accounts reconciliation, contact Khansa Enterprises, Melvisharam.' +
          '</div>' +

        '</div>' +
      '</body>' +
      '</html>'
    );

    // Plain text alternative
    const plainTextBody = (
      action + ': Invoice #' + invoiceNo + '\n' +
      'Date: ' + date + '\n' +
      'Buyer: ' + buyerName + '\n' +
      'PO Number: ' + buyerOrderNo + '\n' +
      'Taxable Value: ₹' + taxableRupees + '\n' +
      'CGST: ₹' + cgstRupees + '\n' +
      'SGST: ₹' + sgstRupees + '\n' +
      'Total Payable: ₹' + payableRupees + '\n\n' +
      'This is an automated invoice dispatch from Khansa Enterprises.'
    );

    // 3. Send Email via Google Apps Script MailApp
    MailApp.sendEmail({
      to: recipient,
      subject: emailSubject,
      body: plainTextBody,
      htmlBody: emailHtml,
      name: 'Khansa Enterprises Invoicing',
    });

    // 4. Optionally append row to active Google Sheet (if bound to a Sheet)
    try {
      const activeSheet = SpreadsheetApp.getActiveSpreadsheet();
      if (activeSheet) {
        let sheet = activeSheet.getSheetByName('Invoices');
        if (!sheet) {
          sheet = activeSheet.getActiveSheet();
        }
        sheet.appendRow([
          new Date(),
          action,
          invoiceNo,
          date,
          buyerName,
          buyerAddress,
          buyerOrderNo,
          despatchedThrough,
          Number(taxableRupees),
          Number(cgstRupees),
          Number(sgstRupees),
          Number(payableRupees),
          recipient,
        ]);
      }
    } catch (sheetErr) {
      console.warn('Google Sheet append skipped or not available:', sheetErr);
    }

    return ContentService.createTextOutput(
      JSON.stringify({
        status: 'success',
        invoice_no: invoiceNo,
        sent_to: recipient,
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
