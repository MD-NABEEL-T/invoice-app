/**
 * Google Apps Script for Khansa Enterprises GST Invoicing App
 *
 * How to setup:
 * 1. Go to https://script.google.com/home/start
 * 2. Click "New project"
 * 3. Delete everything in Code.gs, paste this entire file, and click Save (Ctrl+S)
 * 4. Click "Deploy" (top right) -> "New deployment"
 * 5. Select type: "Web app"
 * 6. Set Description: "Khansa Invoice Dispatcher"
 * 7. Set "Execute as": "Me"
 * 8. Set "Who has access": "Anyone" (CRITICAL: must be Anyone so the app can POST)
 * 9. Click "Deploy", authorize access with your Google account
 * 10. Copy the Web App URL (starts with https://script.google.com/macros/s/...)
 * 11. Paste it into the Settings page of Khansa Invoices App!
 */

function doPost(e) {
  try {
    var raw = e.postData && e.postData.contents ? e.postData.contents : '{}';
    var data = JSON.parse(raw);

    // Test ping from Settings
    if (data.isTest) {
      var testTo = data.email_to || 'khansaenterprises19@gmail.com';
      MailApp.sendEmail({
        to: testTo,
        subject: 'Test Email: Khansa Invoices App Connected Successfully',
        htmlBody: '<div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">' +
          '<h2 style="color: #0f172a; margin-top: 0;">Khansa Invoices - Email Connected!</h2>' +
          '<p>This test email confirms that your Google Apps Script webhook is working perfectly.</p>' +
          '<p>Recipient: <strong>' + testTo + '</strong></p>' +
          '<p>Timestamp: <strong>' + new Date().toLocaleString() + '</strong></p>' +
          '<p style="color: #16a34a; font-weight: bold;">You will now automatically receive every finalized bill copy in your inbox.</p>' +
          '</div>'
      });
      return ContentService.createTextOutput(JSON.stringify({ status: 'ok', message: 'Test email sent' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var invoiceNo = data.invoice_no || 'Draft';
    var action = data.action || 'New Bill Created';
    var recipient = data.email_to || 'khansaenterprises19@gmail.com';
    var buyerName = data.buyer_name || 'Buyer';
    var billDate = data.date || '';
    var payableRupees = data.payable_rupees || '0.00';
    var words = data.amount_in_words || '';
    var lines = data.lines || [];

    // Build items HTML table
    var rowsHtml = '';
    for (var i = 0; i < lines.length; i++) {
      var item = lines[i];
      rowsHtml += '<tr>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">' + (i + 1) + '</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1;">' + (item.description || '') + '</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">' + (item.hsn || '-') + '</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">' + (item.quantity || '') + ' ' + (item.unit || '') + '</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Rs. ' + (item.rate || '') + '</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">' + (item.gst_percent || '') + '%</td>' +
        '<td style="padding: 8px; border: 1px solid #cbd5e1; text-align: right; font-weight: bold;">Rs. ' + (item.amount_rupees || '') + '</td>' +
        '</tr>';
    }

    var emailHtml = '<div style="font-family: Arial, Calibri, sans-serif; max-width: 650px; margin: 0 auto; color: #1e293b; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">' +
      '<div style="background-color: #0f172a; color: #ffffff; padding: 18px 24px;">' +
        '<h2 style="margin: 0; font-size: 20px; font-weight: 800;">KHANSA ENTERPRISES</h2>' +
        '<p style="margin: 4px 0 0; font-size: 13px; opacity: 0.9;">' + action + ' - Invoice #' + invoiceNo + '</p>' +
      '</div>' +
      '<div style="padding: 20px;">' +
        '<table style="width: 100%; margin-bottom: 16px; font-size: 13px;">' +
          '<tr>' +
            '<td style="vertical-align: top; width: 60%;">' +
              '<strong>Buyer:</strong><br/>' +
              '<span style="font-size: 14px; font-weight: bold; color: #0f172a;">' + buyerName + '</span><br/>' +
              (data.buyer_address ? data.buyer_address.replace(/\n/g, '<br/>') + '<br/>' : '') +
              (data.buyer_gstin ? '<strong>GSTIN:</strong> ' + data.buyer_gstin : '') +
            '</td>' +
            '<td style="vertical-align: top; width: 40%; text-align: right;">' +
              '<strong>Invoice No:</strong> ' + invoiceNo + '<br/>' +
              '<strong>Date:</strong> ' + billDate + '<br/>' +
              (data.buyer_order_no ? '<strong>Buyer Order:</strong> ' + data.buyer_order_no + '<br/>' : '') +
              (data.delivery_no ? '<strong>Delivery No:</strong> ' + data.delivery_no + '<br/>' : '') +
            '</td>' +
          '</tr>' +
        '</table>' +
        '<table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 16px;">' +
          '<thead>' +
            '<tr style="background-color: #f1f5f9; text-align: left;">' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">#</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1;">Description</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">HSN</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Qty</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Rate</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: center;">Tax</th>' +
              '<th style="padding: 8px; border: 1px solid #cbd5e1; text-align: right;">Amount</th>' +
            '</tr>' +
          '</thead>' +
          '<tbody>' + rowsHtml + '</tbody>' +
        '</table>' +
        '<table style="width: 100%; font-size: 13px; margin-bottom: 16px;">' +
          '<tr>' +
            '<td style="width: 60%; vertical-align: top;">' +
              '<strong>Amount in words:</strong><br/>' + words +
            '</td>' +
            '<td style="width: 40%; text-align: right;">' +
              'Taxable: Rs. ' + (data.taxable_rupees || '0.00') + '<br/>' +
              'CGST: Rs. ' + (data.cgst_rupees || '0.00') + '<br/>' +
              'SGST: Rs. ' + (data.sgst_rupees || '0.00') + '<br/>' +
              '<div style="margin-top: 8px; padding-top: 6px; border-top: 2px solid #0f172a; font-size: 16px; font-weight: bold; color: #0f172a;">' +
                'Grand Total: Rs. ' + payableRupees +
              '</div>' +
            '</td>' +
          '</tr>' +
        '</table>' +
        '<p style="font-size: 11px; color: #64748b; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 10px;">' +
          'This is an automated bill copy dispatched from Khansa Enterprises GST Invoicing System.' +
        '</p>' +
      '</div>' +
    '</div>';

    MailApp.sendEmail({
      to: recipient,
      subject: action + ': Khansa Enterprises - Invoice #' + invoiceNo + ' (' + buyerName + ')',
      htmlBody: emailHtml
    });

    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', invoice_no: invoiceNo }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput('Khansa Invoices Webhook is Online and Ready!')
    .setMimeType(ContentService.MimeType.TEXT);
}

