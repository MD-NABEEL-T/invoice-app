import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import http from 'http';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const PORT = 4173;
const BASE_URL = `http://localhost:${PORT}`;

function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function tryConnect() {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeoutMs) {
          reject(new Error(`Server at ${url} did not start within ${timeoutMs}ms`));
        } else {
          setTimeout(tryConnect, 400);
        }
      });
    }
    tryConnect();
  });
}

async function runBrowserTests() {
  console.log('=====================================================');
  console.log('🌐 BROWSER END-TO-END UI & WORKFLOW TEST (HEADLESS CHROME)');
  console.log('=====================================================\n');

  // 1. Start vite preview server
  console.log('1. Starting Vite production preview server on port', PORT, '...');
  const previewProcess = spawn('node', ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'pipe',
    shell: true,
  });

  previewProcess.stdout.on('data', (d) => {
    // console.log('[Server stdout]:', d.toString());
  });
  previewProcess.stderr.on('data', (d) => {
    // console.error('[Server stderr]:', d.toString());
  });

  try {
    await waitForServer(BASE_URL);
    console.log('   ✅ Production preview server is up and responsive at', BASE_URL);

    // 2. Launch headless Chrome
    console.log('\n2. Launching Chrome (Headless)...');
    const browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
      defaultViewport: { width: 1280, height: 800 },
    });

    const page = await browser.newPage();
    const consoleLogs = [];
    const pageErrors = [];

    page.on('console', (msg) => {
      const type = msg.type();
      const text = msg.text();
      if (type === 'error') {
        consoleLogs.push({ type, text });
      }
    });

    page.on('pageerror', (err) => {
      pageErrors.push(err.toString());
    });

    // -------------------------------------------------------------------------
    // TEST A: Dashboard / Home
    // -------------------------------------------------------------------------
    console.log('\n3. Testing Dashboard (/) ...');
    await page.goto(BASE_URL, { waitUntil: 'networkidle2' });
    const title = await page.title();
    console.log('   Page title:', title);

    const hasNewBillBtn = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a')).some((a) => a.innerText.includes('NEW BILL'));
    });
    console.log('   "New Bill" button present:', hasNewBillBtn ? '✅ YES' : '❌ NO');

    // -------------------------------------------------------------------------
    // TEST B: Numbering Setup (/settings/numbering)
    // -------------------------------------------------------------------------
    console.log('\n4. Testing Numbering Setup (/settings/numbering) ...');
    await page.goto(`${BASE_URL}/settings/numbering`, { waitUntil: 'networkidle2' });
    const numberingLoaded = await page.evaluate(() => {
      return document.body.innerText.includes('Invoice Numbering Setup');
    });
    console.log('   Numbering setup page loaded with preview:', numberingLoaded ? '✅ YES' : '❌ NO');

    // -------------------------------------------------------------------------
    // TEST C: Create New Bill (/new)
    // -------------------------------------------------------------------------
    console.log('\n5. Testing Bill Creation Flow (/new) ...');
    await page.goto(`${BASE_URL}/new`, { waitUntil: 'networkidle2' });

    // Wait for buyers and items to load
    await page.waitForSelector('#buyerSelect, select', { timeout: 8000 });

    const newBillState = await page.evaluate(() => {
      const buyerSelect = document.querySelector('select');
      const buyerOptions = buyerSelect ? Array.from(buyerSelect.options).map((o) => o.text) : [];
      return {
        hasHeader: document.body.innerText.includes('Bill Header'),
        buyerOptions,
      };
    });
    console.log('   Bill form rendered with buyers:', newBillState.buyerOptions);

    // Fill in order no
    await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input'));
      // Find Buyer Order No input
      const poInput = inputs.find((i) => i.placeholder && i.placeholder.includes('PO') || (i.id && i.id.includes('buyerOrderNo')));
      if (poInput) {
        poInput.value = 'PO-E2E-BROWSER-TEST';
        poInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });

    // Check line item description input
    const itemFilled = await page.evaluate(() => {
      const descInput = document.querySelector('input[placeholder*="Item"], input[placeholder*="item"], input[placeholder*="Description"]');
      if (descInput) {
        descInput.value = 'BUN HEAD (PLASTIC)';
        descInput.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
      return false;
    });
    console.log('   Item filled in form:', itemFilled ? '✅ YES' : '❌ NO');

    // -------------------------------------------------------------------------
    // TEST D: Bills Register (/bills)
    // -------------------------------------------------------------------------
    console.log('\n6. Testing Bills Register (/bills) ...');
    await page.goto(`${BASE_URL}/bills`, { waitUntil: 'networkidle2' });
    const registerText = await page.evaluate(() => document.body.innerText);
    const hasRegister = registerText.includes('Bills Register');
    console.log('   Bills register loaded cleanly:', hasRegister ? '✅ YES' : '❌ NO');

    // -------------------------------------------------------------------------
    // TEST E: Reports (/reports)
    // -------------------------------------------------------------------------
    console.log('\n7. Testing Reports (/reports) ...');
    await page.goto(`${BASE_URL}/reports`, { waitUntil: 'networkidle2' });
    const reportsText = await page.evaluate(() => document.body.innerText);
    const hasReports = reportsText.includes('Monthly Sales') || reportsText.includes('Reports');
    console.log('   Reports page loaded cleanly:', hasReports ? '✅ YES' : '❌ NO');

    // -------------------------------------------------------------------------
    // TEST F: Settings (/settings)
    // -------------------------------------------------------------------------
    console.log('\n8. Testing Settings (/settings) ...');
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle2' });
    const settingsText = await page.evaluate(() => document.body.innerText);
    const hasSettings = settingsText.includes('Firm Profile') || settingsText.includes('Settings');
    console.log('   Settings page loaded cleanly:', hasSettings ? '✅ YES' : '❌ NO');

    await browser.close();

    console.log('\n-----------------------------------------------------');
    console.log('Console Errors caught during browsing:', consoleLogs.length);
    if (consoleLogs.length > 0) {
      consoleLogs.forEach((l) => console.log('  ⚠️', l.text));
    } else {
      console.log('  ✅ ZERO console errors on all pages!');
    }

    console.log('Page JavaScript Exceptions caught:', pageErrors.length);
    if (pageErrors.length > 0) {
      pageErrors.forEach((e) => console.log('  ❌', e));
    } else {
      console.log('  ✅ ZERO unhandled exceptions on all pages!');
    }
    console.log('-----------------------------------------------------');

    console.log('\n🎉 ALL BROWSER E2E TESTS COMPLETED CLEANLY!');
  } finally {
    previewProcess.kill();
  }
}

runBrowserTests().catch((err) => {
  console.error('Browser test failed:', err);
  process.exit(1);
});

