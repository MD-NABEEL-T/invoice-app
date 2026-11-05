import fs from 'fs';
import puppeteer from 'puppeteer-core';
import { buildVectorInvoicePdf } from '../src/lib/vectorPdfGenerator.js';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const ARTIFACT_DIR = 'C:/Users/Fazil/.gemini/antigravity/brain/3430c6e2-06ee-41bf-ab10-20eb0d3156bd';

const firm = {
  name: 'KHANSA ENTERPRISES',
  address: '#158,Pudhupet 3rd Street,\nMELVISHARAM-632509\nRanipet District\nTamil Nadu.',
  gstin: '33AGXPF4947Q1ZH',
  email: 'mohammedafzalarni@yahoo.com',
  phone: '8300533896/9342614838',
  declaration: 'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct',
};

// Bill with Freight ₹200, Round Off -0.25, and EMPTY Buyer Order No
const freightBill = {
  invoice_no: '246/26-27',
  invoice_date: '2026-11-05',
  buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
  buyer_address: 'LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509',
  buyer_gstin: '33AAACR1714R1ZA',
  buyer_order_no: '', // EMPTY -> hidden!
  buyer_order_date: null,
  delivery_no: '0000',
  delivery_date: '2026-11-05',
  despatched_through: 'Lorry / Transport',
  destination: 'Melvisharam',
  terms_of_delivery: 'Immediate',
  freight_paise: 20000, // ₹200.00
  round_off_paise: -25, // -₹0.25
  taxable_paise: 112500,
  cgst_paise: 6062,
  sgst_paise: 6063,
  payable_paise: 144600, // Rounded to nearest whole rupee: ₹1446.00
  amount_in_words: 'RUPEES ONE THOUSAND FOUR HUNDRED AND FORTY SIX ONLY',
  lines: [
    { line_no: 1, description: 'HAIR CAP NET', hsn: '6505', gst_percent: 5, qty_milli: 1000, rate_paise: 62500, unit: 'PCS', amount_paise: 62500 },
    { line_no: 2, description: 'NOZZLE', hsn: '8481', gst_percent: 18, qty_milli: 1000, rate_paise: 50000, unit: 'PCS', amount_paise: 50000 },
  ],
};

async function run() {
  console.log('Building Freight & Round-off PDF...');
  const doc = buildVectorInvoicePdf(freightBill, firm);
  const pdfBase64 = doc.output('datauristring').split(',')[1];

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 1 });

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"></script>
        <style>
          body { margin: 0; background: #525659; display: flex; flex-direction: column; align-items: center; padding: 20px; }
          canvas { box-shadow: 0 4px 8px rgba(0,0,0,0.3); background: #fff; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <canvas id="the-canvas"></canvas>
        <script>
          const pdfData = atob("${pdfBase64}");
          const loadingTask = pdfjsLib.getDocument({ data: pdfData });
          loadingTask.promise.then(pdf => {
            return pdf.getPage(1).then(page => {
              const viewport = page.getViewport({ scale: 2.0 });
              const canvas = document.getElementById('the-canvas');
              const context = canvas.getContext('2d');
              canvas.height = viewport.height;
              canvas.width = viewport.width;
              return page.render({ canvasContext: context, viewport: viewport }).promise;
            });
          }).then(() => {
            window.__rendered = true;
          });
        </script>
      </body>
    </html>
  `;

  await page.setContent(html);
  await page.waitForFunction('window.__rendered === true', { timeout: 30000 });

  const canvas = await page.$('#the-canvas');
  const outPath = `${ARTIFACT_DIR}/test-freight-roundoff-page1.png`;
  await canvas.screenshot({ path: outPath });
  console.log('Saved screenshot to:', outPath);

  await browser.close();
}

run().catch(console.error);
