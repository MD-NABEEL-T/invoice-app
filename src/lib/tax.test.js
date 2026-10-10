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
