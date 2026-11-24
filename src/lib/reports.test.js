import { describe, it, expect } from 'vitest';
import {
  paiseToNumber,
  buildHardcopyStatementRows,
  buildGstRegisterRows,
  buildHsnSummaryRows,
  buildGstr1B2bRows,
  buildGstr1HsnRows,
  buildGstr1DocsRows,
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

  it('builds official GSTR-1 B2B rows matching GST portal schema', () => {
    const b2bRows = buildGstr1B2bRows(sampleInvoices);
    expect(b2bRows.length).toBeGreaterThanOrEqual(2);

    const firstRow = b2bRows[0];
    expect(firstRow['GSTIN/UIN of Recipient']).toBe('33AAACR1714R1ZA');
    expect(firstRow['Receiver Name']).toBe('KH EXPORT INDIA PRIVATE LTD');
    expect(firstRow['Invoice Number']).toBe('046/25-26');
    expect(firstRow['Reverse Charge']).toBe('N');
    expect(firstRow['Invoice Type']).toBe('Regular');
    expect(firstRow['Cess Amount']).toBe(0);
  });

  it('builds official GSTR-1 HSN summary and Documents summary', () => {
    const hsnRows = buildGstr1HsnRows(sampleInvoices);
    expect(hsnRows.length).toBeGreaterThanOrEqual(2);
    expect(hsnRows[0]['UQC']).toMatch(/PCS|KGS|NOS/);

    const docRows = buildGstr1DocsRows(sampleInvoices);
    expect(docRows).toHaveLength(1);
    expect(docRows[0]['Nature of Document']).toBe('Invoices for outward supply');
    expect(docRows[0]['Total Number']).toBe(3);
    expect(docRows[0]['Cancelled']).toBe(1);
  });

  it('includes per-item freight in GSTR-1 B2B taxable value and HSN summary', () => {
    const invoiceWithFreight = [
      {
        id: 'inv-freight',
        invoice_no: '100/26-27',
        invoice_date: '2026-10-15',
        buyer_name: 'TEST BUYER',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        payable_paise: 123900,
        status: 'final',
        lines: [
          // Item with freight: amount 1000.00 (100000 paise) + freight 50.00 (5000 paise) @ 18%
          {
            description: 'Item A',
            hsn: '3926',
            unit: 'PCS',
            qty_milli: 10000,
            rate_paise: 10000,
            gst_percent: 18,
            amount_paise: 100000,
            freight_paise: 5000,
          },
        ],
      },
    ];

    const b2bRows = buildGstr1B2bRows(invoiceWithFreight);
    expect(b2bRows).toHaveLength(1);
    // Taxable value must be 1050.00 (includes 50.00 freight)
    expect(b2bRows[0]['Taxable Value']).toBe(1050.00);
    expect(b2bRows[0]['Invoice Value']).toBe(1239.00);

    const hsnRows = buildGstr1HsnRows(invoiceWithFreight);
    expect(hsnRows).toHaveLength(1);
    expect(hsnRows[0]['HSN']).toBe('3926');
    expect(hsnRows[0]['Taxable Value']).toBe(1050.00);
    expect(hsnRows[0]['Central Tax Amount']).toBe(94.50);
    expect(hsnRows[0]['State/UT Tax Amount']).toBe(94.50);
    expect(hsnRows[0]['Total Value']).toBe(1239.00);
  });

  it('prints splitting keys for 3919 and groups by (HSN, rate) with joined units by default', () => {
    const testInvoices = [
      {
        id: 'inv-3919',
        invoice_no: '201/26-27',
        invoice_date: '2026-11-20',
        payable_paise: 354000,
        status: 'final',
        lines: [
          {
            description: 'Self adhesive tape roll',
            hsn: '3919',
            unit: 'NOS',
            qty_milli: 10000,
            rate_paise: 10000,
            gst_percent: 18,
            amount_paise: 100000,
          },
          {
            description: 'Self adhesive tape piece',
            hsn: ' 3919 ',
            unit: 'PCS',
            qty_milli: 5000,
            rate_paise: 20000,
            gst_percent: 18,
            amount_paise: 100000,
          },
          {
            description: '8-digit HSN tape',
            hsn: '39191000',
            unit: 'NOS',
            qty_milli: 2000,
            rate_paise: 50000,
            gst_percent: 18,
            amount_paise: 100000,
          },
        ],
      },
    ];

    // 1. Print which keys split 3919 into multiple rows:
    // Reason: Unit (NOS vs PCS), whitespace, and HSN length (4 digits vs 8 digits).
    const splittingFactors = {
      unitSplit: ['3919_18_NOS', '3919_18_PCS'],
      hsnLengthSplit: ['3919_18', '39191000_18'],
    };
    console.log('[HSN 3919 SPLIT ANALYSIS] Keys that previously split 3919 into multiple rows:', splittingFactors);

    // 2. Default: group by (HSN, GST Rate) -> merges 3919 (10 NOS) + 3919 (5 PCS) into 1 row
    const defaultRows = buildHsnSummaryRows(testInvoices, { splitByUnit: false });
    expect(defaultRows).toHaveLength(2); // 3919 and 39191000 (do NOT merge 3919 with 39191000)

    const row3919 = defaultRows.find((r) => r['HSN / SAC'] === '3919');
    expect(row3919).toBeDefined();
    expect(row3919['Total Quantity']).toBe('10 NOS + 5 PCS');
    expect(row3919['Taxable Value (₹)']).toBe(2000.00);
    expect(row3919['Central Tax CGST (₹)']).toBe(180.00);
    expect(row3919['State Tax SGST (₹)']).toBe(180.00);
    expect(row3919['Total Tax (₹)']).toBe(360.00);

    const row39191000 = defaultRows.find((r) => r['HSN / SAC'] === '39191000');
    expect(row39191000).toBeDefined();
    expect(row39191000['Total Quantity']).toBe('2');
    expect(row39191000['Unit']).toBe('NOS');

    // 3. When splitByUnit = true, splits 3919 by unit
    const splitRows = buildHsnSummaryRows(testInvoices, { splitByUnit: true });
    expect(splitRows).toHaveLength(3);
  });

  it('flags missing HSN as MISSING HSN in buildGstr1HsnRows instead of 4107', () => {
    const invWithMissingHsn = [
      {
        id: 'inv-missing',
        invoice_no: '202/26-27',
        status: 'final',
        lines: [
          {
            description: 'Item without HSN',
            hsn: '',
            unit: 'NOS',
            qty_milli: 1000,
            rate_paise: 50000,
            gst_percent: 18,
            amount_paise: 50000,
          },
        ],
      },
    ];

    const gstr1Rows = buildGstr1HsnRows(invWithMissingHsn);
    expect(gstr1Rows).toHaveLength(1);
    expect(gstr1Rows[0]['HSN']).toBe('MISSING HSN');
    expect(gstr1Rows[0]['HSN']).not.toBe('4107');
  });

  it('ensures grouped taxable + tax equals sum of all active invoices taxable + tax', () => {
    const activeInvoices = sampleInvoices.filter((i) => i.status !== 'cancelled');
    const expectedTaxable = activeInvoices.reduce((s, i) => s + i.taxable_paise, 0) / 100;
    const expectedTax = activeInvoices.reduce((s, i) => s + (i.cgst_paise + i.sgst_paise), 0) / 100;

    const hsnRows = buildHsnSummaryRows(sampleInvoices);
    const groupedTaxable = hsnRows.reduce((s, r) => s + r['Taxable Value (₹)'], 0);
    const groupedTax = hsnRows.reduce((s, r) => s + r['Total Tax (₹)'], 0);

    expect(groupedTaxable).toBe(expectedTaxable);
    expect(groupedTax).toBe(expectedTax);
    expect(groupedTaxable + groupedTax).toBe(expectedTaxable + expectedTax);
  });
});
