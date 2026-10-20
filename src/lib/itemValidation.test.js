import { describe, it, expect } from 'vitest';
import { validateGSTIN, validateHSN, validateImportRow } from './itemValidation.js';

describe('itemValidation', () => {
  describe('validateGSTIN', () => {
    it('accepts valid 15-character GSTIN', () => {
      const res = validateGSTIN('33AAACR1714R1ZA');
      expect(res.isValid).toBe(true);
      expect(res.warning).toBeNull();
    });

    it('warns when GSTIN is not 15 characters', () => {
      const resShort = validateGSTIN('33AAACR1714');
      expect(resShort.isValid).toBe(false);
      expect(resShort.warning).toContain('has 11 characters');

      const resLong = validateGSTIN('33AAACR1714R1ZA99');
      expect(resLong.isValid).toBe(false);
      expect(resLong.warning).toContain('has 17 characters');
    });

    it('warns when GSTIN has 15 chars but format is unusual', () => {
      const res = validateGSTIN('123456789012345');
      expect(res.isValid).toBe(true); // warn, don't block
      expect(res.warning).toContain('looks unusual');
    });

    it('handles empty or missing GSTIN', () => {
      expect(validateGSTIN('').isValid).toBe(false);
      expect(validateGSTIN(null).isValid).toBe(false);
    });
  });

  describe('validateHSN', () => {
    it('accepts 4, 6, and 8 digit HSN codes without warning', () => {
      expect(validateHSN('3402').warning).toBeNull();
      expect(validateHSN('650500').warning).toBeNull();
      expect(validateHSN('84818090').warning).toBeNull();
    });

    it('warns for empty HSN code', () => {
      expect(validateHSN('').warning).toContain('empty');
      expect(validateHSN(null).warning).toContain('empty');
    });

    it('warns when HSN is not 4, 6, or 8 digits', () => {
      const res = validateHSN('123');
      expect(res.isValid).toBe(true); // warns, does not block
      expect(res.warning).toContain('not 4, 6, or 8 digits');

      const resAlpha = validateHSN('3402A');
      expect(resAlpha.warning).toContain('not 4, 6, or 8 digits');
    });
  });

  describe('validateImportRow', () => {
    it('validates a correct row with confirmed Y', () => {
      const row = {
        Items: 'Cleaning Detergent',
        Unit: 'KG',
        'HSN code': '3402',
        'GST %': '18',
        'Usual rate (Rs)': '200',
        'Confirmed (Y)': 'Y',
      };

      const res = validateImportRow(row);
      expect(res.isValid).toBe(true);
      expect(res.errors.length).toBe(0);
      expect(res.warnings.length).toBe(0);
      expect(res.parsedItem.description).toBe('Cleaning Detergent');
      expect(res.parsedItem.unit).toBe('KG');
      expect(res.parsedItem.hsn).toBe('3402');
      expect(res.parsedItem.gst_percent).toBe(18);
      expect(res.parsedItem.default_rate_paise).toBe(20000);
      expect(res.parsedItem.verified).toBe(true);
    });

    it('flags error for blank description', () => {
      const row = {
        Items: '   ',
        Unit: 'PCS',
        'Confirmed (Y)': 'Y',
      };

      const res = validateImportRow(row);
      expect(res.isValid).toBe(false);
      expect(res.errors).toContain('Item description is blank');
    });

    it('flags error for invalid GST percent', () => {
      const row = {
        Items: 'Nozzle',
        'GST %': 'invalid_rate',
      };

      const res = validateImportRow(row);
      expect(res.isValid).toBe(false);
      expect(res.errors[0]).toContain('Invalid GST %');
    });

    it('sets verified to false when Confirmed is not Y', () => {
      const row = {
        Items: 'Hair cap net',
        'Confirmed (Y)': 'N',
      };

      const res = validateImportRow(row);
      expect(res.isValid).toBe(true);
      expect(res.parsedItem.verified).toBe(false);
    });

    it('adds warning for irregular HSN code without erroring', () => {
      const row = {
        Items: 'Hair cap net',
        'HSN code': '91051', // 5 digits
      };

      const res = validateImportRow(row);
      expect(res.isValid).toBe(true);
      expect(res.warnings.length).toBe(1);
      expect(res.warnings[0]).toContain('not 4, 6, or 8 digits');
    });
  });
});
