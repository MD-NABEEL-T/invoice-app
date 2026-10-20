import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as xlsxModule from 'xlsx';
const xlsx = xlsxModule.default || xlsxModule;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const dataDir = path.join(rootDir, 'data');

export function makeItemSheet() {
  if (!fs.existsSync(dataDir)) {
    throw new Error(`Data directory not found at: ${dataDir}`);
  }

  // 1. Extract Item Descriptions from all templates / workbooks in data/
  const candidateFiles = [
    'SINGLE FORMAT.xlsm',
    '2BILLTAX FORMAT.xlsm',
  ];

  const rawItems = [];
  for (const fileName of candidateFiles) {
    const filePath = path.join(dataDir, fileName);
    if (!fs.existsSync(filePath)) continue;

    const wb = xlsx.readFile(filePath);
    const sheet = wb.Sheets['Dublicate1'];
    if (sheet) {
      const data = xlsx.utils.sheet_to_json(sheet, { header: 1 });
      // Row 0 is header 'Discription'
      for (let i = 1; i < data.length; i++) {
        const val = data[i]?.[0];
        if (val !== undefined && val !== null) {
          const str = String(val).trim();
          if (str.length > 0) {
            rawItems.push({ original: str, source: fileName });
          }
        }
      }
    }
  }

  // Deduplicate case-insensitively while preserving original casing of first occurrence
  const seenMap = new Map();
  const uniqueItems = [];
  const removedDuplicates = [];

  for (const item of rawItems) {
    const key = item.original.toLowerCase();
    if (seenMap.has(key)) {
      removedDuplicates.push({
        'Duplicate Name': item.original,
        'Original Kept': seenMap.get(key),
        'Source File': item.source,
      });
    } else {
      seenMap.set(key, item.original);
      uniqueItems.push(item.original);
    }
  }

  // Sort unique items alphabetically
  uniqueItems.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

  // Sheet 1: "Items"
  // Columns: Items, Unit, HSN code, GST %, Usual rate (Rs), Confirmed (Y)
  // Per requirement: DO NOT suggest or fill any HSN or GST value
  const itemsSheetData = uniqueItems.map((name) => ({
    'Items': name,
    'Unit': '',
    'HSN code': '',
    'GST %': '',
    'Usual rate (Rs)': '',
    'Confirmed (Y)': '',
  }));

  // Sheet 2: "HSN codes seen" from August 2026 sales workbook
  const augFile = fs.readdirSync(dataDir).find((f) => f.toLowerCase().includes('aug') && (f.endsWith('.xlsx') || f.endsWith('.XLsx')));
  const hsnMap = new Map();

  if (augFile) {
    const augWb = xlsx.readFile(path.join(dataDir, augFile));
    const hsnSheet = augWb.Sheets['GST HSN CODE'];
    if (hsnSheet) {
      const rows = xlsx.utils.sheet_to_json(hsnSheet, { header: 1 });
      // Header is at row index 2
      for (let i = 3; i < rows.length; i++) {
        const row = rows[i];
        if (!row) continue;
        const invNo = row[1];
        const rawHsn = row[3];
        const rawPct = row[6];

        if (invNo && rawHsn !== undefined && rawHsn !== null && rawHsn !== '') {
          const code = String(rawHsn).trim();
          let pct = rawPct;
          if (typeof pct === 'number' && pct <= 1) {
            pct = Math.round(pct * 100);
          }

          if (!hsnMap.has(code)) {
            hsnMap.set(code, { pcts: new Set(), lines: 0 });
          }
          const info = hsnMap.get(code);
          info.lines += 1;
          if (pct !== undefined && pct !== null) {
            info.pcts.add(pct);
          }
        }
      }
    }
  }

  const hsnSheetData = [];
  for (const [code, info] of hsnMap.entries()) {
    const isLenValid = code.length === 4 || code.length === 6 || code.length === 8;
    const isDigits = /^\d+$/.test(code);
    let warning = '';
    if (!isDigits) {
      warning = 'Non-digit characters';
    } else if (!isLenValid) {
      warning = `Not 4, 6 or 8 digits (${code.length} digits)`;
    } else {
      warning = 'Valid length';
    }

    const pctsArr = Array.from(info.pcts).sort((a, b) => a - b);
    hsnSheetData.push({
      'HSN Code': code,
      'GST % Seen': pctsArr.join(', '),
      'Number of Lines': info.lines,
      'Length & Format Flag': warning,
    });
  }

  // Sort HSN codes by number of lines descending
  hsnSheetData.sort((a, b) => b['Number of Lines'] - a['Number of Lines']);

  // Sheet 3: "How to fill" - 5 short lines in simple English
  const howToFillData = [
    { 'Step': 1, 'Instructions': 'Open the "Items" sheet to view all products sold.' },
    { 'Step': 2, 'Instructions': 'Fill the 4, 6, or 8 digit HSN code and GST % (0, 5, 18, 40) for each active item.' },
    { 'Step': 3, 'Instructions': 'Fill the Unit (PCS, KG, MTR, BOX, etc.) and usual rate in Rupees if known.' },
    { 'Step': 4, 'Instructions': 'Type Y in "Confirmed (Y)" column only when HSN and GST rate have been verified.' },
    { 'Step': 5, 'Instructions': 'Save this Excel file and upload it in the app under Items -> Import.' },
  ];

  // Sheet 4: "Removed Duplicates"
  const duplicatesData = removedDuplicates;

  // Build workbook
  const outWb = xlsx.utils.book_new();

  const wsItems = xlsx.utils.json_to_sheet(itemsSheetData);
  xlsx.utils.book_append_sheet(outWb, wsItems, 'Items');

  const wsHsn = xlsx.utils.json_to_sheet(hsnSheetData);
  xlsx.utils.book_append_sheet(outWb, wsHsn, 'HSN codes seen');

  const wsHowTo = xlsx.utils.json_to_sheet(howToFillData);
  xlsx.utils.book_append_sheet(outWb, wsHowTo, 'How to fill');

  const wsDupes = xlsx.utils.json_to_sheet(duplicatesData);
  xlsx.utils.book_append_sheet(outWb, wsDupes, 'Removed Duplicates');

  const outPath = path.join(dataDir, 'item-sheet-for-son.xlsx');
  xlsx.writeFile(outWb, outPath);

  console.log(`Generated: ${outPath}`);
  console.log(`- Unique items: ${itemsSheetData.length}`);
  console.log(`- HSN codes seen: ${hsnSheetData.length}`);
  console.log(`- Duplicates removed: ${duplicatesData.length}`);

  return {
    outPath,
    itemCount: itemsSheetData.length,
    hsnCount: hsnSheetData.length,
    dupeCount: duplicatesData.length,
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  makeItemSheet();
}
