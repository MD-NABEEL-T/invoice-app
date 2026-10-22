import { describe, it, expect } from 'vitest';
import {
  getInvoicePdfFilename,
  formatPlainAmount,
  getRateGroupSummary,
  getHsnSummaryRows,
  getCopyLabel,
  paginateInvoiceLines,
} from './invoiceLayout.js';

describe('invoiceLayout pure helpers', () => {
  describe('getInvoicePdfFilename', () => {
    it('replaces slashes and colons with hyphens', () => {
      expect(getInvoicePdfFilename('048/26-27')).toBe('048-26-27.pdf');
      expect(getInvoicePdfFilename('047/25-26')).toBe('047-25-26.pdf');
      expect(getInvoicePdfFilename('INV/2026/001')).toBe('INV-2026-001.pdf');
    });

    it('does not duplicate .pdf extension', () => {
      expect(getInvoicePdfFilename('048-26-27.pdf')).toBe('048-26-27.pdf');
      expect(getInvoicePdfFilename('048-26-27.PDF')).toBe('048-26-27.PDF');
    });

    it('falls back safely on empty or invalid inputs', () => {
      expect(getInvoicePdfFilename('')).toBe('invoice.pdf');
      expect(getInvoicePdfFilename(null)).toBe('invoice.pdf');
      expect(getInvoicePdfFilename(undefined)).toBe('invoice.pdf');
    });
  });

  describe('formatPlainAmount', () => {
    it('formats paise to plain decimal with commas and no rupee symbol', () => {
      expect(formatPlainAmount(124625)).toBe('1,246.25');
      expect(formatPlainAmount(339250)).toBe('3,392.50');
      expect(formatPlainAmount(287500)).toBe('2,875.00');
      expect(formatPlainAmount(25875)).toBe('258.75');
      expect(formatPlainAmount(0)).toBe('0.00');
      expect(formatPlainAmount(50)).toBe('0.50');
      expect(formatPlainAmount(100)).toBe('1.00');
      expect(formatPlainAmount(123456789)).toBe('12,34,567.89');
    });

    it('handles negative amounts', () => {
      expect(formatPlainAmount(-2500)).toBe('-25.00');
    });

    it('supports withPrefix option using Rs. prefix', () => {
      expect(formatPlainAmount(339250, { withPrefix: true })).toBe('Rs. 3,392.50');
    });

    it('never contains the rupee unicode glyph ₹', () => {
      const res = formatPlainAmount(339250, { withPrefix: true });
      expect(res.includes('₹')).toBe(false);
    });
  });

  describe('getRateGroupSummary', () => {
    it('summarizes Sample A (two rates: 5% and 18%)', () => {
      const lines = [
        { description: 'Hair CapNet', hsn: '91051900', gst_percent: 5, amount_paise: 62500 },
        { description: 'Plastic Oil Nozzle', hsn: '39231010', gst_percent: 18, amount_paise: 50000 },
      ];

      const groups = getRateGroupSummary(lines);
      expect(groups).toHaveLength(2);

      // Group 1: 5%
      expect(groups[0].gstPercent).toBe(5);
      expect(groups[0].taxablePaise).toBe(62500);
      expect(groups[0].taxPaise).toBe(3125);
      expect(groups[0].cgstRate).toBe(2.5);
      expect(groups[0].cgstPaise).toBe(1562);
      expect(groups[0].sgstRate).toBe(2.5);
      expect(groups[0].sgstPaise).toBe(1563);

      // Group 2: 18%
      expect(groups[1].gstPercent).toBe(18);
      expect(groups[1].taxablePaise).toBe(50000);
      expect(groups[1].taxPaise).toBe(9000);
      expect(groups[1].cgstRate).toBe(9);
      expect(groups[1].cgstPaise).toBe(4500);
      expect(groups[1].sgstRate).toBe(9);
      expect(groups[1].sgstPaise).toBe(4500);
    });

    it('summarizes Sample B (single rate: 18%)', () => {
      const lines = [
        { description: 'Vim Soap', hsn: '34011930', gst_percent: 18, amount_paise: 20000 },
        { description: 'Hammam Soap', hsn: '34011930', gst_percent: 18, amount_paise: 110000 },
        { description: 'Surf Excel', hsn: '34011930', gst_percent: 18, amount_paise: 157500 },
      ];

      const groups = getRateGroupSummary(lines);
      expect(groups).toHaveLength(1);
      expect(groups[0].gstPercent).toBe(18);
      expect(groups[0].taxablePaise).toBe(287500);
      expect(groups[0].taxPaise).toBe(51750);
      expect(groups[0].cgstPaise).toBe(25875);
      expect(groups[0].sgstPaise).toBe(25875);
    });
  });

  describe('getHsnSummaryRows', () => {
    it('produces HSN rows and total tax in words for Sample A', () => {
      const lines = [
        { description: 'Hair CapNet', hsn: '91051900', gst_percent: 5, amount_paise: 62500 },
        { description: 'Plastic Oil Nozzle', hsn: '39231010', gst_percent: 18, amount_paise: 50000 },
      ];

      const res = getHsnSummaryRows(lines);
      expect(res.rows).toHaveLength(2);
      expect(res.totalTaxablePaise).toBe(112500);
      expect(res.totalTaxPaise).toBe(12125);
      expect(res.taxInWords).toBe('Rupees One Hundred Twenty One and Twenty Five Paise Only');
    });

    it('produces HSN rows and total tax in words for Sample B', () => {
      const lines = [
        { description: 'Vim Soap', hsn: '34011930', gst_percent: 18, amount_paise: 20000 },
        { description: 'Hammam Soap', hsn: '34011930', gst_percent: 18, amount_paise: 110000 },
        { description: 'Surf Excel', hsn: '34011930', gst_percent: 18, amount_paise: 157500 },
      ];

      const res = getHsnSummaryRows(lines);
      expect(res.rows).toHaveLength(1);
      expect(res.rows[0].hsn).toBe('34011930');
      expect(res.rows[0].taxablePaise).toBe(287500);
      expect(res.totalTaxPaise).toBe(51750);
      expect(res.taxInWords).toBe('Rupees Five Hundred Seventeen and Fifty Paise Only');
    });
  });

  describe('getCopyLabel', () => {
    it('returns empty string when disabled', () => {
      expect(getCopyLabel(0, false)).toBe('');
      expect(getCopyLabel(1, false)).toBe('');
      expect(getCopyLabel(2, false)).toBe('');
    });

    it('returns copy labels when enabled', () => {
      expect(getCopyLabel(0, true)).toBe('ORIGINAL FOR RECIPIENT');
      expect(getCopyLabel(1, true)).toBe('DUPLICATE FOR TRANSPORTER');
      expect(getCopyLabel(2, true)).toBe('TRIPLICATE FOR SUPPLIER');
      expect(getCopyLabel(3, true)).toBe('EXTRA COPY (4)');
    });
  });

  describe('paginateInvoiceLines', () => {
    it('returns 1 page for small bills that fit singlePageCapacity', () => {
      const lines = [
        { id: '1', description: 'Item 1' },
        { id: '2', description: 'Item 2' },
        { id: '3', description: 'Item 3' },
      ];

      const pages = paginateInvoiceLines(lines, { singlePageCapacity: 8 });
      expect(pages).toHaveLength(1);
      expect(pages[0].isFirst).toBe(true);
      expect(pages[0].isLast).toBe(true);
      expect(pages[0].pageNumber).toBe(1);
      expect(pages[0].totalPages).toBe(1);
      expect(pages[0].lines).toHaveLength(3);
    });

    it('handles empty line array gracefully', () => {
      const pages = paginateInvoiceLines([]);
      expect(pages).toHaveLength(1);
      expect(pages[0].isFirst).toBe(true);
      expect(pages[0].isLast).toBe(true);
      expect(pages[0].lines).toHaveLength(0);
    });

    it('splits a 30-line bill across multiple pages correctly', () => {
      const lines = Array.from({ length: 30 }, (_, i) => ({
        id: String(i + 1),
        description: `Line Item ${i + 1}`,
      }));

      const pages = paginateInvoiceLines(lines, {
        singlePageCapacity: 8,
        middlePageCapacity: 14,
        lastPageCapacity: 7,
      });

      expect(pages.length).toBeGreaterThan(1);
      expect(pages[0].isFirst).toBe(true);
      expect(pages[0].isLast).toBe(false);
      expect(pages[pages.length - 1].isFirst).toBe(false);
      expect(pages[pages.length - 1].isLast).toBe(true);

      // Verify all lines are preserved and no duplicates or lost items
      const totalLinesPreserved = pages.reduce((acc, p) => acc + p.lines.length, 0);
      expect(totalLinesPreserved).toBe(30);

      // Ensure last page has <= lastPageCapacity lines
      expect(pages[pages.length - 1].lines.length).toBeLessThanOrEqual(7);
    });
  });
});
