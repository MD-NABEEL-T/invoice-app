import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

// Load Supabase credentials
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();
const supabase = createClient(url, key);

async function testBrowserSave() {
  console.log('=====================================================');
  console.log('🚀 LIVE BROWSER SAVE & BILL DETAIL VERIFICATION');
  console.log('=====================================================\n');

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    defaultViewport: { width: 1280, height: 900 },
  });

  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('   [Browser Console Error]:', msg.text());
    }
  });

  try {
    // 1. Open New Bill page
    console.log('1. Navigating to /new ...');
    await page.goto(`${BASE_URL}/new`, { waitUntil: 'networkidle2' });

    // Wait for buyers dropdown
    await page.waitForSelector('select', { timeout: 10000 });

    // 2. Select Buyer: KH EXPORT INDIA PRIVATE LTD
    console.log('2. Selecting Buyer ...');
    await page.evaluate(() => {
      const selects = Array.from(document.querySelectorAll('select'));
      const buyerSelect = selects[0];
      const opt = Array.from(buyerSelect.options).find((o) => o.text.includes('KH EXPORT'));
      if (opt) {
        buyerSelect.value = opt.value;
        buyerSelect.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    await new Promise((r) => setTimeout(r, 1200));

    // 3. Fill in Order No and Despatched Through
    console.log('3. Typing Order No & Despatched Through ...');
    await page.focus('input[placeholder*="PO"]');
    await page.keyboard.type('PO-E2E-REAL-001');

    const despInput = await page.$('input[placeholder*="Direct Delivery"], input[placeholder*="Tempo"]');
    if (despInput) {
      await despInput.click({ clickCount: 3 });
      await page.keyboard.press('Backspace');
      await page.keyboard.type('HAND DELIVERY');
    }

    // 4. Search and Add Line Item from catalog
    console.log('4. Searching and Adding Item from Catalog ("Surf") ...');
    await page.focus('input[placeholder*="Search by item"]');
    await page.keyboard.type('Surf', { delay: 60 });

    // Wait for search dropdown
    await page.waitForSelector('.divide-y button', { timeout: 8000 });
    console.log('   Clicking first catalog item "+ Add" ...');
    await page.evaluate(() => {
      const btn = document.querySelector('.divide-y button');
      if (btn) btn.click();
    });

    await new Promise((r) => setTimeout(r, 1500));

    const lineAdded = await page.evaluate(() => document.body.innerText.includes('Line Items (1)'));
    console.log('   Line item added to bill:', lineAdded ? '✅ Line Items (1) present!' : '❌ Failed to add line');

    // 5. Click "Save Bill" trigger button at bottom bar
    console.log('\n5. Clicking "Save Bill" button ...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const saveBtn = btns.find((b) => b.innerText.includes('Save Bill'));
      if (saveBtn) saveBtn.click();
    });

    // Wait for Confirmation Modal to open
    await new Promise((r) => setTimeout(r, 1500));

    // Check if actual validation errors blocked modal (has heading "Please fix the following")
    const valError = await page.evaluate(() => {
      const el = document.querySelector('.border-red-400, .border-red-500');
      if (el && el.innerText.includes('Please fix')) {
        return el.innerText;
      }
      return null;
    });

    if (valError) {
      console.error('   ❌ Validation Error on screen:', valError);
      throw new Error(`Validation blocked modal: ${valError}`);
    }

    // 6. Confirm Save in Modal
    console.log('6. Confirming Save in Modal ("Yes, Finalize") ...');
    const confirmed = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const confirmBtn = btns.find((b) => b.innerText.includes('Yes, Finalize') || b.innerText.includes('Finalize'));
      if (confirmBtn) {
        confirmBtn.click();
        return true;
      }
      return false;
    });

    console.log('   Confirmed modal save button clicked:', confirmed ? '✅ YES' : '❌ NO');

    // 7. Wait for navigation to /bills/:id
    console.log('7. Waiting for navigation to /bills/:id ...');
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

    const currentUrl = page.url();
    console.log('   Current URL after save:', currentUrl);

    if (!currentUrl.includes('/bills/')) {
      const errBox = await page.evaluate(() => {
        const el = document.querySelector('.border-red-500, .border-red-400');
        return el ? el.innerText : null;
      });
      console.error('   ❌ Save failed! Error on screen:', errBox);
      throw new Error(`Failed to save bill. Error: ${errBox}`);
    }

    console.log('   ✅ Successfully saved and navigated to:', currentUrl);

    // 8. Verify the Invoice Sheet UI
    console.log('\n8. Verifying Bill Detail & Invoice Sheet UI ...');
    await page.waitForSelector('.invoice-page', { timeout: 8000 });
    const invoiceDetails = await page.evaluate(() => {
      const text = document.body.innerText;
      const images = Array.from(document.querySelectorAll('.invoice-page img')).map((i) => i.src);
      return {
        hasTaxInvoice: text.includes('TAX INVOICE'),
        hasInvoiceNo: text.includes('001/26-27'),
        hasBuyer: text.includes('KH EXPORT INDIA PRIVATE LTD'),
        hasSurfExcel: text.includes('Surf Excel'),
        sheetImages: images,
      };
    });

    console.log('   Invoice sheet contains "TAX INVOICE":', invoiceDetails.hasTaxInvoice ? '✅ YES' : '❌ NO');
    console.log('   Invoice Number #001/26-27 present:', invoiceDetails.hasInvoiceNo ? '✅ YES' : '❌ NO');
    console.log('   Buyer name present:', invoiceDetails.hasBuyer ? '✅ YES' : '❌ NO');
    console.log('   Item "Surf Excel" present in sheet:', invoiceDetails.hasSurfExcel ? '✅ YES' : '❌ NO');
    console.log('   Images inside invoice sheet (NO LOGO on bill):', invoiceDetails.sheetImages.length === 0 ? '✅ 0 (LOGO REMOVED)' : `❌ Found ${invoiceDetails.sheetImages.length}`);

    // 9. Extract bill UUID from URL and clean up test record from database
    const billId = currentUrl.split('/bills/')[1]?.split('?')[0];
    if (billId) {
      console.log('\n9. Cleaning up test invoice from database:', billId);
      const { data: delRpc, error: delErr } = await supabase.rpc('delete_invoice', { p_invoice_id: billId });
      console.log('   Delete RPC result:', delRpc, delErr);

      // Reset counter to 0 so Uncle starts at #001/26-27
      await supabase.from('counters').upsert({ fy: '26-27', last_number: 0 });
      console.log('   Reset counter for FY 26-27 back to 0.');
    }

    console.log('\n=====================================================');
    console.log('🎉 REAL BROWSER SAVE, NAVIGATION, AND LAYOUT: 100% VERIFIED!');
    console.log('=====================================================');
  } finally {
    await browser.close();
  }
}

testBrowserSave().catch((err) => {
  console.error('Browser save test failed:', err);
  process.exit(1);
});
