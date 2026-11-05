import fs from 'fs';
import puppeteer from 'puppeteer-core';

const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

async function main() {
  const rawHtml = fs.readFileSync('excel-sheet-230.html', 'utf8');

  // Wrap in A4 portrait container with exact Calibri styling matching Excel print
  const styledHtml = `
<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: A4; margin: 6.35mm; }
    body {
      margin: 0;
      padding: 6.35mm;
      background: #ffffff;
      font-family: 'Calibri', 'Carlito', Arial, sans-serif;
      font-size: 11pt;
      color: #000000;
    }
    table {
      border-collapse: collapse;
      width: 197.3mm;
      table-layout: fixed;
    }
    td, th {
      border: 0.5pt solid #000000;
      padding: 2px 4px;
      vertical-align: top;
      word-wrap: break-word;
      font-size: 11pt;
    }
  </style>
</head>
<body>
  ${rawHtml}
</body>
</html>
  `;

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 1300, deviceScaleFactor: 2 });
  await page.setContent(styledHtml);

  await page.screenshot({ path: 'excel-rendered-230.png' });
  console.log('Saved excel-rendered-230.png');

  // Copy to artifacts
  const artifactPath = 'C:/Users/Fazil/.gemini/antigravity/brain/3430c6e2-06ee-41bf-ab10-20eb0d3156bd/excel-rendered-230.png';
  fs.copyFileSync('excel-rendered-230.png', artifactPath);
  console.log('Copied to artifact:', artifactPath);

  await browser.close();
}

main().catch(console.error);
