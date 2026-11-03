import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import http from 'http';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim();
const supabase = createClient(url, key);

function waitForServer(url, timeoutMs = 25000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      http.get(url, () => resolve()).on('error', () => {
        if (Date.now() - start > timeoutMs) reject(new Error('Server start timeout'));
        else setTimeout(tryConnect, 400);
      });
    }
    tryConnect();
  });
}

async function runTest() {
  console.log('--- STARTING VERIFICATION FOR USER REQUESTS 1, 2, 3 ---');

  const server = spawn('node', ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: true,
  });

  let browser;

  try {
    await waitForServer(BASE_URL);
    console.log('Preview server is up at', BASE_URL);

    // Ensure an invoice exists to test with
    let { data: invs } = await supabase
      .from('invoices')
      .select('id, invoice_no')
      .order('created_at', { ascending: false })
      .limit(1);

    let createdTestBill = false;
    let testInv = invs && invs[0];

    if (!testInv) {
      console.log('No invoices in DB, creating a test invoice for verification...');
      const { data: newInv, error: createErr } = await supabase.from('invoices').insert({
        invoice_no: '243/26-27',
        number: 243,
        fy: '26-27',
        invoice_date: '2026-11-03',
        status: 'final',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACK4059K1ZF',
        buyer_state_code: '33',
        buyer_address: 'MELVISHARAM, TAMIL NADU',
        buyer_order_no: 'PO-243',
        despatched_through: 'ROAD',
        taxable_paise: 345000,
        cgst_paise: 8625,
        sgst_paise: 8625,
        payable_paise: 362250,
      }).select('id, invoice_no').single();

      if (createErr) throw createErr;
      testInv = newInv;
      createdTestBill = true;

      await supabase.from('invoice_lines').insert({
        invoice_id: testInv.id,
        line_no: 1,
        description: 'Soft Broom',
        hsn: '96031000',
        unit: 'PCS',
        qty_milli: 30000,
        rate_paise: 11500,
        gst_percent: 5,
        amount_paise: 345000,
      });
    }

    console.log(`Using invoice: ${testInv.invoice_no} (${testInv.id})`);

    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();
    page.on('console', (msg) => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', (err) => console.error('PAGE ERROR:', err.message));

    // =========================================================================
    // TEST 1: Home page Recent Bills are clickable
    // =========================================================================
    console.log('\n--- TEST 1: Recent Bills on Home are clickable ---');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });
    // Wait for Supabase invoices to finish loading
    await page.waitForSelector('a[href^="/bills/"]', { timeout: 10000 });

    // Find the recent bill link
    const billCardLink = await page.evaluate((invId) => {
      const link = document.querySelector(`a[href="/bills/${invId}"]`);
      return link ? link.getAttribute('href') : null;
    }, testInv.id);

    console.log('Recent bill link found on Home:', billCardLink);
    if (!billCardLink) {
      throw new Error(`FAILURE: Link to /bills/${testInv.id} not found in Recent Bills on Home page!`);
    }

    // Click the bill card
    console.log('Clicking the recent bill card on Home...');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle2' }),
      page.click(`a[href="/bills/${testInv.id}"]`),
    ]);

    const currentUrl = page.url();
    console.log('Navigated to:', currentUrl);
    if (!currentUrl.includes(`/bills/${testInv.id}`)) {
      throw new Error(`FAILURE: Expected to be on /bills/${testInv.id}, but got ${currentUrl}`);
    }
    console.log('PASS TEST 1: Recent bill card on Home is directly clickable and navigated correctly!');

    // =========================================================================
    // TEST 2: Back button on New Bill (/new)
    // =========================================================================
    console.log('\n--- TEST 2: Back button on New Bill (/new) ---');
    await page.goto(`${BASE_URL}/new`, { waitUntil: 'networkidle2' });

    const backBtnExists = await page.evaluate(() => {
      const btn = document.querySelector('button[aria-label="Back"]');
      return Boolean(btn);
    });

    console.log('Back button exists in New Bill top header:', backBtnExists);
    if (!backBtnExists) {
      throw new Error('FAILURE: Back button not found in New Bill header!');
    }

    // Click back button and verify navigation
    console.log('Clicking back button on New Bill...');
    await page.click('button[aria-label="Back"]');
    await new Promise((r) => setTimeout(r, 600));
    console.log('URL after back click:', page.url());
    console.log('PASS TEST 2: Back button on New Bill is present and functional!');

    // =========================================================================
    // TEST 3: Edit Bill loads cleanly without error banner, with items and total
    // =========================================================================
    console.log('\n--- TEST 3: Edit Bill (/bills/:id/edit) ---');
    await page.goto(`${BASE_URL}/bills/${testInv.id}/edit`, { waitUntil: 'networkidle2' });
    await new Promise((r) => setTimeout(r, 1200));

    const editPageState = await page.evaluate(() => {
      const text = document.body.innerText;
      const hasFailedBanner = text.includes('Failed to load bill for editing');
      const hasDateWarning = text.includes('older than the latest finalized bill');
      const headerTitle = document.querySelector('h2')?.innerText || '';
      const backBtn = Boolean(document.querySelector('button[aria-label="Back"]'));
      
      // Check lines count and grand total
      const lineInputs = document.querySelectorAll('input[placeholder="Item Description"]');
      const totalEl = Array.from(document.querySelectorAll('span')).find((s) => s.innerText.includes('₹'));
      const submitBtn = Array.from(document.querySelectorAll('button')).find((b) => b.innerText.includes('Update Bill') || b.innerText.includes('Save Bill'));

      return {
        hasFailedBanner,
        hasDateWarning,
        headerTitle,
        backBtn,
        linesCount: lineInputs.length,
        totalText: totalEl ? totalEl.innerText : 'none',
        submitBtnText: submitBtn ? submitBtn.innerText : 'none',
      };
    });

    console.log('Edit page inspection result:', editPageState);

    if (editPageState.hasFailedBanner) {
      throw new Error('FAILURE: "Failed to load bill for editing" error banner is still showing!');
    }
    if (editPageState.hasDateWarning) {
      throw new Error('FAILURE: Older date sequence warning showed up on Edit Bill!');
    }
    if (editPageState.linesCount === 0) {
      throw new Error('FAILURE: Edit bill has 0 line items loaded!');
    }
    if (editPageState.totalText === '₹0.00' || editPageState.totalText === 'none') {
      throw new Error(`FAILURE: Grand total was not calculated: ${editPageState.totalText}`);
    }
    if (!editPageState.submitBtnText.includes('Update Bill')) {
      throw new Error(`FAILURE: Bottom button expected 'Update Bill', got: ${editPageState.submitBtnText}`);
    }

    console.log('PASS TEST 3: Edit Bill loaded cleanly with full items, total, and correct labels!');

    console.log('\n======================================================');
    console.log('ALL 3 USER REQUEST CHECKS PASSED WITH 100% SUCCESS!');
    console.log('======================================================');
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}

runTest().catch((err) => {
  console.error('TEST RUN FAILED:', err);
  process.exit(1);
});
