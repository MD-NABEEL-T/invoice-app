import { describe, it, expect } from 'vitest';
import {
  rupeesToPaise,
  paiseToRupees,
  calcInvoice,
  amountInWords,
  financialYear,
  formatInvoiceNo,
} from './tax.js';

describe('GST Tax Calculation Engine', () => {
  // Test A: 625.00 @ 5% + 500.00 @ 18%
  it('A) calculates mixed-rate invoice correctly (Invoice 046 sample)', () => {
    const lines = [
      { qtyMilli: 1000, ratePaise: rupeesToPaise(625.0), gstPercent: 5 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(500.0), gstPercent: 18 },
    ];

    const result = calcInvoice(lines);

    expect(result.totalTaxablePaise).toBe(112500);
    expect(paiseToRupees(result.totalTaxablePaise)).toBe('1125.00');

    // 5% group: tax is 31.25 -> CGST 15.62, SGST 15.63
    const g5 = result.rateGroups.find((g) => g.gstPercent === 5);
    expect(g5.taxPaise).toBe(3125);
    expect(paiseToRupees(g5.taxPaise)).toBe('31.25');
    expect(g5.cgstPaise).toBe(1562);
    expect(g5.sgstPaise).toBe(1563);

    // 18% group: tax is 90.00 -> CGST 45.00, SGST 45.00
    const g18 = result.rateGroups.find((g) => g.gstPercent === 18);
    expect(g18.taxPaise).toBe(9000);
    expect(paiseToRupees(g18.taxPaise)).toBe('90.00');
    expect(g18.cgstPaise).toBe(4500);
    expect(g18.sgstPaise).toBe(4500);

    // Total tax & split
    expect(result.totalTaxPaise).toBe(12125);
    expect(paiseToRupees(result.totalTaxPaise)).toBe('121.25');
    expect(result.totalCgstPaise + result.totalSgstPaise).toBe(12125);

    // Grand total
    expect(result.grandTotalPaise).toBe(124625);
    expect(paiseToRupees(result.grandTotalPaise)).toBe('1246.25');
  });

  // Test B: 200.00 + 1100.00 + 1575.00 @ 18%
  it('B) calculates single-rate multi-line invoice correctly (Invoice 047 sample)', () => {
    const lines = [
      { qtyMilli: 1000, ratePaise: rupeesToPaise(200.0), gstPercent: 18 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(1100.0), gstPercent: 18 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(1575.0), gstPercent: 18 },
    ];

    const result = calcInvoice(lines);

    expect(result.totalTaxablePaise).toBe(287500);
    expect(paiseToRupees(result.totalTaxablePaise)).toBe('2875.00');

    expect(result.totalTaxPaise).toBe(51750);
    expect(paiseToRupees(result.totalTaxPaise)).toBe('517.50');

    expect(result.totalCgstPaise).toBe(25875);
    expect(paiseToRupees(result.totalCgstPaise)).toBe('258.75');

    expect(result.totalSgstPaise).toBe(25875);
    expect(paiseToRupees(result.totalSgstPaise)).toBe('258.75');

    expect(result.grandTotalPaise).toBe(339250);
    expect(paiseToRupees(result.grandTotalPaise)).toBe('3392.50');
  });

  // Test C: roundToRupee flag
  it('C) rounds to nearest rupee when roundToRupee is true', () => {
    const lines = [
      { qtyMilli: 1000, ratePaise: rupeesToPaise(625.0), gstPercent: 5 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(500.0), gstPercent: 18 },
    ];

    const result = calcInvoice(lines, { roundToRupee: true });

    expect(result.grandTotalPaise).toBe(124625);
    expect(result.roundOffPaise).toBe(-25);
    expect(paiseToRupees(result.roundOffPaise)).toBe('-0.25');
    expect(result.payablePaise).toBe(124600);
    expect(paiseToRupees(result.payablePaise)).toBe('1246.00');
  });

  // Test D: interstate sales (IGST)
  it('D) routes entire tax to IGST with zero CGST/SGST for interstate sales', () => {
    const lines = [
      { qtyMilli: 1000, ratePaise: rupeesToPaise(200.0), gstPercent: 18 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(1100.0), gstPercent: 18 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(1575.0), gstPercent: 18 },
    ];

    const result = calcInvoice(lines, { interState: true });

    expect(result.totalTaxablePaise).toBe(287500);
    expect(result.totalCgstPaise).toBe(0);
    expect(result.totalSgstPaise).toBe(0);
    expect(result.totalIgstPaise).toBe(51750);
    expect(paiseToRupees(result.totalIgstPaise)).toBe('517.50');
    expect(result.totalTaxPaise).toBe(51750);
  });

  it('supports optional freight charges and rounds grand total to whole rupee', () => {
    const lines = [
      { qtyMilli: 1000, ratePaise: rupeesToPaise(625.0), gstPercent: 5 },
      { qtyMilli: 1000, ratePaise: rupeesToPaise(500.0), gstPercent: 18 },
    ];
    // Taxable 1125.00, Tax 121.25 -> 1246.25. Add Freight 200.00 -> 1446.25.
    // Nearest rupee -> 1446.00, roundOff = -0.25
    const result = calcInvoice(lines, { roundToRupee: true, freightPaise: 20000 });

    expect(result.totalTaxablePaise).toBe(112500);
    expect(result.totalTaxPaise).toBe(12125);
    expect(result.freightPaise).toBe(20000);
    expect(result.grandTotalPaise).toBe(144625);
    expect(result.roundOffPaise).toBe(-25);
    expect(result.payablePaise).toBe(144600);
    expect(paiseToRupees(result.payablePaise)).toBe('1446.00');
  });

  // Per-item freight tests
  it('E) calculates per-item freight: taxable = (qty * rate) + freight with CGST/SGST on that combined taxable', () => {
    // Item with freight:
    // qty: 10, rate: 100.00 (10000 paise) -> base: 1000.00 (100000 paise)
    // freight: 50.00 (5000 paise)
    // gst: 18%
    // Taxable = 1000.00 + 50.00 = 1050.00 (105000 paise)
    // Tax = 1050.00 * 18% = 189.00 (18900 paise)
    // CGST 9% = 94.50 (9450 paise), SGST 9% = 94.50 (9450 paise)
    // Total = 1239.00 (123900 paise)
    const lineWithFreight = [
      {
        qtyMilli: 10000,
        ratePaise: 10000,
        freightPaise: 5000,
        gstPercent: 18,
      },
    ];

    const result = calcInvoice(lineWithFreight);

    expect(result.totalTaxablePaise).toBe(105000);
    expect(paiseToRupees(result.totalTaxablePaise)).toBe('1050.00');
    expect(result.totalCgstPaise).toBe(9450);
    expect(paiseToRupees(result.totalCgstPaise)).toBe('94.50');
    expect(result.totalSgstPaise).toBe(9450);
    expect(paiseToRupees(result.totalSgstPaise)).toBe('94.50');
    expect(result.totalTaxPaise).toBe(18900);
    expect(paiseToRupees(result.totalTaxPaise)).toBe('189.00');
    expect(result.payablePaise).toBe(123900);
    expect(paiseToRupees(result.payablePaise)).toBe('1239.00');
    expect(result.freightPaise).toBe(5000);

    // Verify per-line data
    expect(result.lines[0].baseAmountPaise).toBe(100000);
    expect(result.lines[0].amountPaise).toBe(100000); // base item amount
    expect(result.lines[0].taxableAmountPaise).toBe(105000); // base + freight
  });

  it('F) handles mixed items: one with freight and one without freight', () => {
    const lines = [
      // Line 1: Item with freight
      // 120 units @ 8.00 = 960.00 + freight 40.00 = taxable 1000.00 @ 18% -> CGST 90, SGST 90
      { qtyMilli: 120000, ratePaise: 800, freightPaise: 4000, gstPercent: 18 },
      // Line 2: Item without freight
      // 24 units @ 25.00 = 600.00 @ 18% -> CGST 54, SGST 54
      { qtyMilli: 24000, ratePaise: 2500, freightPaise: 0, gstPercent: 18 },
    ];

    const result = calcInvoice(lines);

    // Total taxable: 1000.00 + 600.00 = 1600.00 (160000 paise)
    expect(result.totalTaxablePaise).toBe(160000);
    expect(paiseToRupees(result.totalTaxablePaise)).toBe('1600.00');

    // 18% on 1600.00 = 288.00 (28800 paise) -> CGST 144.00, SGST 144.00
    expect(result.totalTaxPaise).toBe(28800);
    expect(result.totalCgstPaise).toBe(14400);
    expect(result.totalSgstPaise).toBe(14400);

    // Total: 1600.00 + 288.00 = 1888.00
    expect(result.payablePaise).toBe(188800);
    expect(paiseToRupees(result.payablePaise)).toBe('1888.00');
    expect(result.freightPaise).toBe(4000);
  });

  // Test E: edge cases
  describe('E) Edge cases', () => {
    it('handles empty line items gracefully', () => {
      const result = calcInvoice([]);
      expect(result.totalTaxablePaise).toBe(0);
      expect(result.totalTaxPaise).toBe(0);
      expect(result.grandTotalPaise).toBe(0);
      expect(result.roundOffPaise).toBe(0);
      expect(result.payablePaise).toBe(0);
      expect(result.rateGroups).toHaveLength(0);
      expect(result.lines).toHaveLength(0);
    });

    it('handles a 0% GST line item correctly', () => {
      const lines = [{ qtyMilli: 1000, ratePaise: 50000, gstPercent: 0 }];
      const result = calcInvoice(lines);

      expect(result.totalTaxablePaise).toBe(50000);
      expect(result.totalTaxPaise).toBe(0);
      expect(result.grandTotalPaise).toBe(50000);
      expect(result.rateGroups).toHaveLength(1);
      expect(result.rateGroups[0].taxPaise).toBe(0);
    });

    it('handles fractional quantity (e.g. 2.5 kg = 2500 milli)', () => {
      const lines = [
        { qtyMilli: 2500, ratePaise: rupeesToPaise(100.0), gstPercent: 18 },
      ];
      const result = calcInvoice(lines);

      expect(result.lines[0].amountPaise).toBe(25000); // 2.5 * 100.00 = 250.00
      expect(paiseToRupees(result.lines[0].amountPaise)).toBe('250.00');
      expect(result.totalTaxablePaise).toBe(25000);
      expect(result.totalTaxPaise).toBe(4500); // 18% of 250.00 = 45.00
      expect(result.grandTotalPaise).toBe(29500);
    });

    it('correctly detects financial year (31 March vs 1 April boundary)', () => {
      expect(financialYear(new Date('2025-03-31T12:00:00'))).toBe('24-25');
      expect(financialYear(new Date('2025-04-01T12:00:00'))).toBe('25-26');
      expect(financialYear(new Date('2026-02-15T12:00:00'))).toBe('25-26');

      expect(formatInvoiceNo(48, '25-26')).toBe('048/25-26');
      expect(formatInvoiceNo(1, '25-26')).toBe('001/25-26');
      expect(formatInvoiceNo(1045, '25-26')).toBe('1045/25-26');
    });

    it('converts amounts to Indian words correctly for 0, 1, 100000, and 10000000', () => {
      // 0 paise
      expect(amountInWords(0)).toBe('Rupees Zero Only');

      // 1 paise
      expect(amountInWords(1)).toBe('Rupees Zero and One Paise Only');

      // 100 paise = 1 Rupee
      expect(amountInWords(100)).toBe('Rupees One Only');

      // 100000 paise = 1,000 Rupees
      expect(amountInWords(100000)).toBe('Rupees One Thousand Only');

      // 10000000 paise = 1,00,000 Rupees (One Lakh Rupees)
      expect(amountInWords(10000000)).toBe('Rupees One Lakh Only');

      // Rupee values: 1 Lakh Rupees (10,000,000 paise) and 1 Crore Rupees (1,000,000,000 paise)
      expect(amountInWords(rupeesToPaise(100000))).toBe('Rupees One Lakh Only');
      expect(amountInWords(rupeesToPaise(10000000))).toBe('Rupees One Crore Only');

      // Full sample invoice amount
      expect(amountInWords(124625)).toBe(
        'Rupees One Thousand Two Hundred Forty Six and Twenty Five Paise Only'
      );
    });
  });
});
