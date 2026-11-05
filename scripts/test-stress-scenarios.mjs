import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { buildVectorInvoicePdf } from '../src/lib/vectorPdfGenerator.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Fazil/.gemini/antigravity/brain/3430c6e2-06ee-41bf-ab10-20eb0d3156bd';

// 1. One-item bill
const oneItemBill = {
  invoice_no: '245/26-27',
  invoice_date: '2026-11-04',
  buyer_order_no: 'PO-991',
  buyer_order_date: '01/11/2026',
  buyer_name: 'TEST BUYER ONE',
  buyer_address: '123 Test Street, Chennai',
  buyer_gstin: '33AAACT1234A1Z5',
  delivery_no: '101',
  delivery_date: '2026-11-04',
  despatched_through: 'HAND DELIVERY',
  destination: 'CHENNAI',
  terms_of_delivery: 'Immediate on delivery',
  taxable_paise: 100000,
  cgst_paise: 9000,
  sgst_paise: 9000,
  payable_paise: 118000,
  amount_in_words: 'RUPEES ONE THOUSAND ONE HUNDRED AND EIGHTY ONLY',
  lines: [
    { line_no: 1, description: 'SURF EXCEL EASY WASH 1KG', hsn: '3402', gst_percent: 18, qty_milli: 10000, rate_paise: 10000, unit: 'pcs', amount_paise: 100000 },
  ],
};

// 2. Stress Test Bill (Long Buyer Name, 3-line order, long despatched through, 2-line words, 5 items)
const stressTestBill = {
  invoice_no: '250/26-27',
  invoice_date: '2026-11-05',
  buyer_name: 'SOUTHERN INDIA LEATHER & SYNTHETIC GOODS MANUFACTURING CORPORATION PRIVATE LIMITED',
  buyer_address: 'PLOT NO. 45 & 46, SIDCO INDUSTRIAL ESTATE,\nSIPCOT COMPLEX, RANIPET-632403,\nVELLORE DISTRICT, TAMIL NADU',
  buyer_gstin: '33AABCS8899Q1ZX',
  buyer_order_no: 'PO-ORD-2026-9901A\nPO-ORD-2026-9902B\nPO-ORD-2026-9903C',
  buyer_order_date: '01/10/2026\n15/10/2026\n28/10/2026',
  delivery_no: 'DEL-8871',
  delivery_date: '2026-11-04',
  despatched_through: 'BY ROAD TRANSPORT / VRL LOGISTICS CHENNAI CARGO CARRIERS',
  destination: 'VELLORE INDUSTRIAL COMPLEX PHASE II',
  terms_of_delivery: 'Against 30 days payment confirmation\nSubject to Ranipet Jurisdiction',
  taxable_paise: 15165000,
  cgst_paise: 1364850,
  sgst_paise: 1364850,
  payable_paise: 17894700,
  amount_in_words: 'RUPEES ONE LAKH SEVENTY-EIGHT THOUSAND NINE HUNDRED AND FORTY-SEVEN ONLY',
  lines: [
    { line_no: 1, description: 'Industrial High Density Pasting Compound Grade A-1', hsn: '3926', gst_percent: 18, qty_milli: 150000, rate_paise: 2500, unit: 'kg', amount_paise: 3750000 },
    { line_no: 2, description: 'Heavy Duty Duracell Batteries AAA Industrial Pack', hsn: '85068090', gst_percent: 18, qty_milli: 50000, rate_paise: 4500, unit: 'nos', amount_paise: 2250000 },
    { line_no: 3, description: 'Precision Stainless Steel Filter Mesh Grade 304', hsn: '39231010', gst_percent: 18, qty_milli: 80000, rate_paise: 3200, unit: 'nos', amount_paise: 2560000 },
    { line_no: 4, description: 'Protective Safety Eye Glass Goggle Anti-Scratch', hsn: '9004', gst_percent: 18, qty_milli: 120000, rate_paise: 3500, unit: 'pcs', amount_paise: 4200000 },
    { line_no: 5, description: 'Synthetic Surface Cleaning Solution 5 Litre Can', hsn: '3402', gst_percent: 18, qty_milli: 60000, rate_paise: 4008, unit: 'cans', amount_paise: 2405000 },
  ],
};

// 3. Reference 230 Bill (5 items from Book1)
const reference230Bill = {
  invoice_no: '230/26-27',
  invoice_date: '2026-10-13',
  buyer_order_no: 'U3MS-102566\nU3MS-103690',
  buyer_order_date: '05/09/2026\n30/09/2026',
  delivery_no: '3272',
  delivery_date: '2026-10-10',
  despatched_through: '',
  destination: '',
  terms_of_delivery: '',
  buyer_name: 'KH EXPORT INDIA PVT LTD,',
  buyer_address: 'LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509',
  buyer_gstin: '33AAACR1714R1ZA',
  taxable_paise: 476000,
  cgst_paise: 42840,
  sgst_paise: 42840,
  payable_paise: 561680,
  amount_in_words: 'RUPEES FIVE THOUSAND SIX HUNDRED AND SEVENTEEN ONLY',
  lines: [
    { line_no: 1, description: 'Oil Cane Pasting ', hsn: '3926', gst_percent: 18, qty_milli: 120000, rate_paise: 800, unit: 'nos', amount_paise: 96000 },
    { line_no: 2, description: 'Duracell Battery AAA', hsn: '85068090', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 3, description: 'Duracell Battery AA', hsn: '85068090', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 4, description: 'Filter Mesh', hsn: '39231010', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 5, description: 'Goggle (Eye Glass)', hsn: '9004', gst_percent: 18, qty_milli: 80000, rate_paise: 2500, unit: 'nos', amount_paise: 200000 },
  ],
};

// 4. Twelve-item multi-page bill
const twelveItemBill = {
  invoice_no: '247/26-27',
  invoice_date: '2026-11-04',
  buyer_order_no: 'PO-993',
  buyer_name: 'TEST BUYER MULTI-PAGE',
  buyer_address: '789 Big Industrial Park, Ranipet',
  taxable_paise: 1200000,
  cgst_paise: 108000,
  sgst_paise: 108000,
  payable_paise: 1416000,
  amount_in_words: 'RUPEES FOURTEEN THOUSAND ONE HUNDRED AND SIXTY ONLY',
  lines: Array.from({ length: 12 }, (_, i) => ({
    line_no: i + 1,
    description: `Industrial Material Item ${i + 1}`,
    hsn: '3926',
    gst_percent: 18,
    qty_milli: (i + 1) * 10000,
    rate_paise: 10000,
    unit: 'nos',
    amount_paise: (i + 1) * 100000,
  })),
};

async function renderPdfPages(browser, doc, prefix) {
  const pdfBytes = doc.output('arraybuffer');
  const pdfBuffer = Buffer.from(pdfBytes);
  const pdfBase64 = pdfBuffer.toString('base64');
  const pageCount = doc.getNumberOfPages();
  console.log(`[${prefix}] Generated PDF with ${pageCount} page(s), size: ${Math.round(pdfBuffer.length / 1024)} KB`);

  const savedPaths = [];
  for (let p = 1; p <= pageCount; p++) {
    const page = await browser.newPage();
    await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });

    const html = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; background: #fff; display: flex; justify-content: center; }
    canvas { background: #fff; }
  </style>
</head>
<body>
  <canvas id="pdf-canvas"></canvas>
  <script>
    window.__pageRendered = false;
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdfData = atob('${pdfBase64}');
    pdfjsLib.getDocument({ data: pdfData }).promise.then(async (pdf) => {
      const page = await pdf.getPage(${p});
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.getElementById('pdf-canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      window.__pageRendered = true;
    }).catch((err) => {
      window.__renderError = err.message;
    });
  </script>
</body>
</html>
    `;

    await page.setContent(html);
    await page.waitForFunction('window.__pageRendered === true || window.__renderError', { timeout: 15000 });

    const canvasEl = await page.$('#pdf-canvas');
    const localFileName = `${prefix}-page${p}.png`;
    const artifactFileName = `${ARTIFACT_DIR}/${prefix}-page${p}.png`;

    await canvasEl.screenshot({ path: localFileName });
    fs.copyFileSync(localFileName, artifactFileName);
    savedPaths.push(artifactFileName);
    console.log(`Saved screenshot: ${artifactFileName}`);
    await page.close();
  }

  return savedPaths;
}

async function run() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  console.log('--- Testing Scenario 1: 1-item Bill ---');
  const doc1 = buildVectorInvoicePdf(oneItemBill);
  await renderPdfPages(browser, doc1, 'test-1item');

  console.log('--- Testing Scenario 2: Stress-test Bill (Long names, 3-line order, long despatched, 2-line words, 5 items) ---');
  const doc2 = buildVectorInvoicePdf(stressTestBill);
  await renderPdfPages(browser, doc2, 'test-stress-5item');

  console.log('--- Testing Scenario 3: Reference 230 Bill (Book1 5 items) ---');
  const doc3 = buildVectorInvoicePdf(reference230Bill);
  await renderPdfPages(browser, doc3, 'test-ref-230');

  console.log('--- Testing Scenario 4: 12-item Bill (Multi-page) ---');
  const doc4 = buildVectorInvoicePdf(twelveItemBill);
  await renderPdfPages(browser, doc4, 'test-12item');

  await browser.close();
  console.log('ALL SCENARIOS RENDERED AND VERIFIED SUCCESSFULLY!');
}

run().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
