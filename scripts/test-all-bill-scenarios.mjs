import fs from 'fs';
import { buildVectorInvoicePdf } from '../src/lib/vectorPdfGenerator.js';

// 1. One-item bill
const oneItemBill = {
  invoice_no: '245/26-27',
  invoice_date: '2026-11-04',
  buyer_order_no: 'PO-991',
  buyer_order_date: '01/11/2026',
  buyer_name: 'TEST BUYER ONE',
  buyer_address: '123 Test Street, Chennai',
  buyer_gstin: '33AAACT1234A1Z5',
  taxable_paise: 100000,
  cgst_paise: 9000,
  sgst_paise: 9000,
  payable_paise: 118000,
  lines: [
    { line_no: 1, description: 'SURF EXCEL EASY WASH 1KG', hsn: '3402', gst_percent: 18, qty_milli: 10000, rate_paise: 10000, unit: 'pcs', amount_paise: 100000 },
  ],
};

// 2. Two-rate bill (5% and 18%)
const twoRateBill = {
  invoice_no: '246/26-27',
  invoice_date: '2026-11-04',
  buyer_order_no: 'PO-992',
  buyer_name: 'TEST BUYER TWO',
  buyer_address: '456 Test Ave, Vellore',
  taxable_paise: 200000,
  cgst_paise: 11500,
  sgst_paise: 11500,
  payable_paise: 223000,
  lines: [
    { line_no: 1, description: 'Cleaning Compound A', hsn: '3402', gst_percent: 5, qty_milli: 10000, rate_paise: 10000, unit: 'kg', amount_paise: 100000 },
    { line_no: 2, description: 'Detergent Grade B', hsn: '3809', gst_percent: 18, qty_milli: 10000, rate_paise: 10000, unit: 'kg', amount_paise: 100000 },
  ],
};

// 3. Twelve-item multi-page bill
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

console.log('Testing Scenario 1 (1-item bill)...');
const doc1 = buildVectorInvoicePdf(oneItemBill);
console.log('1-item bill pages:', doc1.getNumberOfPages());
if (doc1.getNumberOfPages() !== 1) throw new Error('1-item bill should be 1 page');

console.log('Testing Scenario 2 (2-rate bill)...');
const doc2 = buildVectorInvoicePdf(twoRateBill);
console.log('2-rate bill pages:', doc2.getNumberOfPages());
if (doc2.getNumberOfPages() !== 1) throw new Error('2-rate bill should be 1 page');

console.log('Testing Scenario 3 (12-item bill)...');
const doc3 = buildVectorInvoicePdf(twelveItemBill);
console.log('12-item bill pages:', doc3.getNumberOfPages());
if (doc3.getNumberOfPages() !== 2) throw new Error('12-item bill should be 2 pages');

console.log('ALL 3 SCENARIOS PASSED WITH PERFECT PAGE COUNTS!');
