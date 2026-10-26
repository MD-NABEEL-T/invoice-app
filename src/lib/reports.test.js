import { describe, it, expect } from 'vitest';
import {
  paiseToNumber,
  buildHardcopyStatementRows,
  buildGstRegisterRows,
  buildHsnSummaryRows,
} from './reports.js';

describe('Month-End Reports Engine', () => {
  const sampleInvoices = [
    {
      id: 'inv-1',
      invoice_no: '046/25-26',
      invoice_date: '2025-04-10',
      buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
      buyer_gstin: '33AAACR1714R1ZA',
      buyer_order_no: 'PO-991',
      buyer_order_date: '2025-04-09',
      delivery_no: 'DC-101',
      delivery_date: '2025-04-10',
      taxable_paise: 112500,
      cgst_paise: 6062,
      sgst_paise: 6063,
      payable_paise: 124625,
      status: 'final',
      lines: [
        {
          description: 'Hair Cap Net',
          hsn: '6505',
          unit: 'PCS',
          qty_milli: 1000,
          rate_paise: 62500,
          gst_percent: 5,
          amount_paise: 62500,
        },
        {
          description: 'Nozzle',
          hsn: '8424',
          unit: 'PCS',
          qty_milli: 1000,
          rate_paise: 50000,
          gst_percent: 18,
          amount_paise: 50000,
        },
      ],
    },
    {
      id: 'inv-2',
      invoice_no: '047/25-26',
      invoice_date: '2025-04-12',
      buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
      buyer_gstin: '33AAACR1714R1ZA',
      buyer_order_no: 'PO-992',
      buyer_order_date: '2025-04-11',
      delivery_no: 'DC-102',
      delivery_date: '2025-04-12',
      taxable_paise: 287500,
      cgst_paise: 25875,
      sgst_paise: 25875,
      payable_paise: 339250,
      status: 'final',
      lines: [
        {
          description: 'Cleaning Detergent',
          hsn: '3402',
          unit: 'KG',
          qty_milli: 1000,
          rate_paise: 287500,
          gst_percent: 18,
          amount_paise: 287500,
        },
      ],
    },
    {
      id: 'inv-3',
      invoice_no: '048/25-26',
      invoice_date: '2025-04-15',
      buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
      buyer_gstin: '33AAACR1714R1ZA',
      buyer_order_no: 'PO-993',
      taxable_paise: 100000,
      cgst_paise: 9000,
      sgst_paise: 9000,
      payable_paise: 118000,
      status: 'cancelled',
      lines: [],
    },
  ];

  it('converts paise to clean decimal number', () => {
    expect(paiseToNumber(124625)).toBe(1246.25);
    expect(paiseToNumber(0)).toBe(0);
    expect(paiseToNumber(null)).toBe(0);
  });

  it('builds HARDCOPY buyer statement rows and marks cancelled bills', () => {
    const rows = buildHardcopyStatementRows(sampleInvoices);
    expect(rows).toHaveLength(3);

    // Bill 1
    expect(rows[0]['Invoice No']).toBe('046/25-26');
    expect(rows[0]['Taxable Value (₹)']).toBe(1125.00);
    expect(rows[0]['Total Amount (₹)']).toBe(1246.25);
    expect(rows[0]['Status']).toBe('FINAL');

    // Bill 3 (Cancelled) has 0 amounts in statement totals
    expect(rows[2]['Invoice No']).toBe('048/25-26');
    expect(rows[2]['Total Amount (₹)']).toBe(0);
    expect(rows[2]['Status']).toBe('CANCELLED');
  });

  it('builds GST Sales Register excluding cancelled bills', () => {
    const rows = buildGstRegisterRows(sampleInvoices);
    expect(rows).toHaveLength(2); // Cancelled bill excluded

    // Bill 1 has mixed 5% and 18%
    expect(rows[0]['Invoice No']).toBe('046/25-26');
    expect(rows[0]['5% Taxable (₹)']).toBe(625.00);
    expect(rows[0]['18% Taxable (₹)']).toBe(500.00);
    expect(rows[0]['Total Taxable (₹)']).toBe(1125.00);
    expect(rows[0]['Invoice Total (₹)']).toBe(1246.25);

    // Bill 2 has 18% only
    expect(rows[1]['Invoice No']).toBe('047/25-26');
    expect(rows[1]['5% Taxable (₹)']).toBe(0);
    expect(rows[1]['18% Taxable (₹)']).toBe(2875.00);
    expect(rows[1]['Invoice Total (₹)']).toBe(3392.50);
  });

  it('builds HSN summary rows grouped across active invoices', () => {
    const rows = buildHsnSummaryRows(sampleInvoices);
    expect(rows.length).toBeGreaterThanOrEqual(3);

    const hsn6505 = rows.find((r) => r['HSN / SAC'] === '6505');
    expect(hsn6505).toBeDefined();
    expect(hsn6505['GST Rate']).toBe('5%');
    expect(hsn6505['Taxable Value (₹)']).toBe(625.00);

    const hsn3402 = rows.find((r) => r['HSN / SAC'] === '3402');
    expect(hsn3402).toBeDefined();
    expect(hsn3402['Taxable Value (₹)']).toBe(2875.00);
  });
});
