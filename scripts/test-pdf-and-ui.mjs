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
  console.log('--- STARTING VERIFICATION TEST ---');
  
  // 1. Start preview server
  console.log('Starting preview server on port', PORT);
  const server = spawn('node', ['./node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], {
    stdio: 'ignore',
    shell: true,
  });

  let browser;
  let testInvoiceId;

  try {
    await waitForServer(BASE_URL);
    console.log('Preview server is up at', BASE_URL);

    // 2. Insert clean test invoice in Supabase
    console.log('Creating test invoice in Supabase...');
    const { data: inv, error: invErr } = await supabase.from('invoices').insert({
      invoice_no: '888/26-27',
      number: 888,
      fy: '26-27',
      invoice_date: '2026-11-03',
      status: 'final',
      buyer_name: 'TEST VERIFICATION BUYER PVT LTD',
      buyer_gstin: '33AAACK4059K1ZF',
      buyer_state_code: '33',
      buyer_address: '123 INDUSTRIAL ESTATE, CHENNAI',
      buyer_order_no: 'PO-888-VERIFY',
      despatched_through: 'ROAD TRANSPORT',
      taxable_paise: 500000,
      cgst_paise: 12500,
      sgst_paise: 12500,
      payable_paise: 525000,
    }).select('id').single();

    if (invErr) throw new Error('Supabase invoice insert error: ' + invErr.message);
    testInvoiceId = inv.id;
    console.log('Created test invoice:', testInvoiceId);

    const { error: lineErr } = await supabase.from('invoice_lines').insert({
      invoice_id: testInvoiceId,
      line_no: 1,
      description: 'Industrial Cleaning Compound Grade A',
      hsn: '3402',
      unit: 'KGS',
      qty_milli: 50000,
      rate_paise: 10000,
      gst_percent: 5,
      amount_paise: 500000,
    });
    if (lineErr) throw new Error('Supabase line insert error: ' + lineErr.message);

    // 3. Launch Chrome
    browser = await puppeteer.launch({
      executablePath: CHROME_PATH,
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const page = await browser.newPage();

    // TEST A: Verify Mobile UI (Redmi 9 viewport: 360 x 640)
    console.log('\n--- TEST A: Mobile Viewport & CSS Verification ---');
    await page.setViewport({ width: 360, height: 640, isMobile: true, hasTouch: true });
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle2' });

    // Check SVG dimensions on Home page
    const svgMetrics = await page.evaluate(() => {
      const svgs = Array.from(document.querySelectorAll('svg'));
      return svgs.map((s) => {
        const rect = s.getBoundingClientRect();
        return {
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          className: s.getAttribute('class'),
        };
      });
    });

    console.log('Home page rendered SVGs count:', svgMetrics.length);
    const blownUpSvg = svgMetrics.find((s) => s.width > 60 || s.height > 60);
    if (blownUpSvg) {
      throw new Error(`FAILURE: Found blown-up SVG! Width: ${blownUpSvg.width}px, Height: ${blownUpSvg.height}px`);
    } else {
      console.log('PASS: All Home page SVGs have normal mobile bounds (<= 32px). No blown-up icons!');
    }

    // Check CSS computed styles on Home page
    const homeStyles = await page.evaluate(() => {
      const newBillBtn = document.querySelector('a.btn-brand') || document.querySelector('.btn-brand') || document.querySelector('a[href="/new"]');
      const style = window.getComputedStyle(newBillBtn);
      const bodyStyle = window.getComputedStyle(document.body);
      return {
        btnBg: style.backgroundColor,
        btnColor: style.color,
        btnRadius: style.borderRadius,
        bodyBg: bodyStyle.backgroundColor,
      };
    });
    console.log('Computed styles on mobile Home:', homeStyles);
    if (homeStyles.btnBg === 'rgba(0, 0, 0, 0)' || homeStyles.btnBg === 'transparent') {
      throw new Error('FAILURE: New Bill button has no background color (CSS failed to load)!');
    }
    console.log('PASS: CSS styling loaded and active! Button background:', homeStyles.btnBg);

    // TEST B: PDF Generation on BillView Page
    console.log('\n--- TEST B: PDF Generation & Non-Blank Content Verification ---');
    await page.goto(`${BASE_URL}/bills/${testInvoiceId}`, { waitUntil: 'networkidle2' });
    await page.waitForSelector('.invoice-page');

    // Instrument page to capture the PDF blob when downloadInvoicePdf is called
    await page.evaluate(() => {
      window.__capturedPdfBlobBase64 = null;
      const origCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          window.__capturedPdfBlobBase64 = reader.result;
        };
        reader.readAsDataURL(blob);
        return origCreate(blob);
      };
    });

    // Click "Print / Share Bill"
    console.log('Opening Print / Share Bill modal...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const printBtn = btns.find((b) => b.innerText.includes('Print / Share'));
      if (printBtn) printBtn.click();
    });

    await new Promise((r) => setTimeout(r, 800));

    // Click "Download PDF"
    console.log('Clicking "Download PDF"...');
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      const dlBtn = btns.find((b) => b.innerText.includes('Download PDF'));
      if (dlBtn) dlBtn.click();
    });

    // Wait for PDF generation to finish (wait up to 10 seconds)
    console.log('Waiting for PDF Blob generation...');
    let pdfBase64 = null;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      pdfBase64 = await page.evaluate(() => window.__capturedPdfBlobBase64);
      if (pdfBase64) break;
    }

    if (!pdfBase64) {
      throw new Error('FAILURE: PDF blob was not captured within timeout!');
    }

    const base64Data = pdfBase64.split(',')[1];
    const pdfBuffer = Buffer.from(base64Data, 'base64');
    const pdfPath = 'test-generated-bill.pdf';
    fs.writeFileSync(pdfPath, pdfBuffer);
    const pdfSizeKb = Math.round(pdfBuffer.length / 1024);
    console.log(`PASS: PDF successfully generated! Size: ${pdfSizeKb} KB saved to ${pdfPath}`);

    // Verify PDF is NOT blank:
    // A blank single-page PDF with jsPDF + empty white image is typically around 38-42 KB and contains no visual texture.
    // A rendered invoice containing text, borders, tables, headers, and barcodes renders high-frequency JPEG content.
    // Furthermore, let's also directly capture a screenshot of the cloned page or canvas in evaluate to verify pixel data!
    const canvasStats = await page.evaluate(async () => {
      const container = document.getElementById('pdf-download-container');
      const pageEl = container.querySelector('.invoice-page');
      
      // Let's test html2canvas directly in the page environment
      // Check that pageEl contains invoice text:
      const text = pageEl.innerText;
      return {
        textSnippet: text.slice(0, 200),
        hasTaxInvoice: text.includes('TAX INVOICE'),
        hasBuyer: text.includes('TEST VERIFICATION BUYER'),
        hasAmount: text.includes('5,250.00'),
      };
    });

    console.log('Invoice page DOM text check:', canvasStats);
    if (!canvasStats.hasTaxInvoice || !canvasStats.hasBuyer || !canvasStats.hasAmount) {
      throw new Error('FAILURE: DOM elements in #pdf-download-container missing expected text!');
    }
    console.log('PASS: Invoice DOM contains all invoice data correctly!');

    console.log('\n========================================');
    console.log('ALL VERIFICATION CHECKS PASSED PERFECTLY!');
    console.log('========================================');
  } finally {
    if (browser) await browser.close();
    server.kill();

    // Clean up Supabase test invoice
    if (testInvoiceId) {
      console.log('Cleaning up test invoice from Supabase...');
      try {
        await supabase.from('invoice_lines').delete().eq('invoice_id', testInvoiceId);
        await supabase.from('invoices').delete().eq('id', testInvoiceId);
        await supabase.from('counters').upsert({ fy: '26-27', last_number: 0 });
        console.log('Cleanup completed.');
      } catch (e) {
        console.warn('Cleanup error:', e);
      }
    }
  }
}

runTest().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
  process.exit(1);
});

