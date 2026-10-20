import { describe, it, expect } from 'vitest';
import { formatDisplayDate, formatRupees, computeBillStats } from './billUtils.js';

describe('billUtils', () => {
  describe('formatDisplayDate', () => {
    it('formats YYYY-MM-DD into DD/MM/YYYY', () => {
      expect(formatDisplayDate('2026-10-20')).toBe('20/10/2026');
      expect(formatDisplayDate('2099-04-01')).toBe('01/04/2099');
    });

    it('handles ISO timestamps with T', () => {
      expect(formatDisplayDate('2026-10-20T12:00:00Z')).toBe('20/10/2026');
    });

    it('returns empty string for null or empty input', () => {
      expect(formatDisplayDate(null)).toBe('');
      expect(formatDisplayDate('')).toBe('');
    });
  });

  describe('formatRupees', () => {
    it('formats integer paise into Indian currency format', () => {
      expect(formatRupees(0)).toBe('₹0.00');
      expect(formatRupees(20000)).toBe('₹200.00');
      expect(formatRupees(124625)).toBe('₹1,246.25');
      expect(formatRupees(339250)).toBe('₹3,392.50');
      expect(formatRupees(10000000)).toBe('₹1,00,000.00');
    });

    it('formats negative paise', () => {
      expect(formatRupees(-2500)).toBe('-₹25.00');
    });
  });

  describe('computeBillStats', () => {
    it('calculates today and month totals while excluding cancelled invoices', () => {
      const invoices = [
        { invoice_date: '2026-10-20', payable_paise: 124625, status: 'final' },
        { invoice_date: '2026-10-20', payable_paise: 50000, status: 'cancelled' }, // should be excluded
        { invoice_date: '2026-10-15', payable_paise: 339250, status: 'final' },
        { invoice_date: '2026-09-30', payable_paise: 200000, status: 'final' }, // previous month
      ];

      const stats = computeBillStats(invoices, '2026-10-20');

      expect(stats.todayCount).toBe(1);
      expect(stats.todayTotalPaise).toBe(124625);
      expect(stats.monthCount).toBe(2);
      expect(stats.monthTotalPaise).toBe(124625 + 339250);
    });

    it('handles empty invoice list', () => {
      const stats = computeBillStats([]);
      expect(stats.todayCount).toBe(0);
      expect(stats.todayTotalPaise).toBe(0);
      expect(stats.monthCount).toBe(0);
      expect(stats.monthTotalPaise).toBe(0);
    });
  });
});
