import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { buildVectorInvoicePdf } from '../src/lib/vectorPdfGenerator.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const testInvoice = {
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
  lines: [
    { line_no: 1, description: 'Oil Cane Pasting ', hsn: '3926', gst_percent: 18, qty_milli: 120000, rate_paise: 800, unit: 'nos', amount_paise: 96000 },
    { line_no: 2, description: 'Duracell Battery AAA', hsn: '85068090', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 3, description: 'Duracell Battery AA', hsn: '85068090', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 4, description: 'Filter Mesh', hsn: '39231010', gst_percent: 18, qty_milli: 24000, rate_paise: 2500, unit: 'nos', amount_paise: 60000 },
    { line_no: 5, description: 'Goggle (Eye Glass)', hsn: '9004', gst_percent: 18, qty_milli: 80000, rate_paise: 2500, unit: 'nos', amount_paise: 200000 },
  ],
};

async function test() {
  console.log('Generating test PDF with buildVectorInvoicePdf...');
  const doc = buildVectorInvoicePdf(testInvoice);
  const pdfBytes = doc.output('arraybuffer');
  const pdfBuffer = Buffer.from(pdfBytes);
  fs.writeFileSync('test-vector-invoice-230.pdf', pdfBuffer);
  console.log(`Saved test-vector-invoice-230.pdf (${Math.round(pdfBuffer.length / 1024)} KB)`);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });

  const pdfBase64 = pdfBuffer.toString('base64');
  const html = `
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
  <style>
    body { margin: 0; background: #e2e8f0; display: flex; justify-content: center; padding: 20px; }
    canvas { box-shadow: 0 4px 20px rgba(0,0,0,0.15); background: #fff; }
  </style>
</head>
<body>
  <canvas id="pdf-canvas"></canvas>
  <script>
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const pdfData = atob('${pdfBase64}');
    pdfjsLib.getDocument({ data: pdfData }).promise.then(async (pdf) => {
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.getElementById('pdf-canvas');
      const ctx = canvas.getContext('2d');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: ctx, viewport }).promise;
      window.__rendered = true;
    });
  </script>
</body>
</html>
  `;

  await page.setContent(html);
  await page.waitForFunction('window.__rendered === true', { timeout: 15000 });

  const canvasEl = await page.$('#pdf-canvas');
  await canvasEl.screenshot({ path: 'test-rendered-page1.png' });
  console.log('Saved test-rendered-page1.png!');

  // Copy to artifacts directory so user and system can view it
  const artifactPath = 'C:/Users/Fazil/.gemini/antigravity/brain/3430c6e2-06ee-41bf-ab10-20eb0d3156bd/test-rendered-page1.png';
  fs.copyFileSync('test-rendered-page1.png', artifactPath);
  console.log('Copied to artifact:', artifactPath);

  await browser.close();
}

test().catch(console.error);
