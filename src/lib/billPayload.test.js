import { describe, it, expect } from 'vitest';
import {
  parseQuantityToMilli,
  formatMilliToQuantity,
  parseRupeesToPaise,
  validateBillLine,
  validateBillForm,
  buildInvoicePayload,
  numberToWordsIndian,
} from './billPayload.js';
import { paiseToRupees } from './tax.js';

describe('billPayload helpers', () => {
  describe('quantity and rupee parsing', () => {
    it('parses quantities to milli correctly with up to 3 decimals', () => {
      expect(parseQuantityToMilli(1)).toBe(1000);
      expect(parseQuantityToMilli('1')).toBe(1000);
      expect(parseQuantityToMilli('2.5')).toBe(2500);
      expect(parseQuantityToMilli('0.750')).toBe(750);
      expect(parseQuantityToMilli('0.005')).toBe(5);
      expect(parseQuantityToMilli('1.2349')).toBe(1234);
      expect(parseQuantityToMilli('')).toBe(0);
      expect(parseQuantityToMilli(null)).toBe(0);
    });

    it('formats milli back to decimal quantity', () => {
      expect(formatMilliToQuantity(1000)).toBe('1');
      expect(formatMilliToQuantity(2500)).toBe('2.5');
      expect(formatMilliToQuantity(750)).toBe('0.75');
      expect(formatMilliToQuantity(0)).toBe('');
    });

    it('parses rupees to paise correctly', () => {
      expect(parseRupeesToPaise('625.00')).toBe(62500);
      expect(parseRupeesToPaise('1,246.25')).toBe(124625);
      expect(parseRupeesToPaise(500)).toBe(50000);
    });
  });

  describe('validation', () => {
    it('requires HSN and GST % with exact message: Fill HSN and GST % (item needs checking)', () => {
      const lineWithoutHsn = {
        description: 'Test Item',
        hsn: '',
        gst_percent: 18,
        quantity: '1',
        rate: '100',
      };
      const res1 = validateBillLine(lineWithoutHsn);
      expect(res1.isValid).toBe(false);
      expect(res1.error).toBe('Fill HSN and GST % (item needs checking)');

      const lineWithoutGst = {
        description: 'Test Item',
        hsn: '3402',
        gst_percent: null,
        quantity: '1',
        rate: '100',
      };
      const res2 = validateBillLine(lineWithoutGst);
      expect(res2.isValid).toBe(false);
      expect(res2.error).toBe('Fill HSN and GST % (item needs checking)');
    });

    it('gives a warning only when HSN is not 4, 6 or 8 digits', () => {
      const lineWith5DigitHsn = {
        description: 'Test Item',
        hsn: '12345',
        gst_percent: 18,
        quantity: '1',
        rate: '100',
      };
      const res = validateBillLine(lineWith5DigitHsn);
      expect(res.isValid).toBe(true);
      expect(res.warning).toMatch(/not 4, 6, or 8 digits/);
    });

    it('validates required header fields in validateBillForm', () => {
      const emptyForm = validateBillForm({ header: {}, lines: [] });
      expect(emptyForm.isValid).toBe(false);
      expect(emptyForm.errors).toContain('Buyer selection is required');
      expect(emptyForm.errors).toContain('Branch delivery address is required');
      expect(emptyForm.errors).toContain('Bill date is required');
      expect(emptyForm.errors).toContain('Buyer Order No is required');
      expect(emptyForm.errors).toContain('Despatched Through is required');
      expect(emptyForm.errors).toContain('Add at least one line item');
    });
  });

  describe('Payload Builder Real Bills Reproduction', () => {
    // Real Bill A: 625.00 @ 5% + 500.00 @ 18%
    it('reproduces Bill (A): 625.00 at 5% plus 500.00 at 18% -> taxable 1125.00, tax 121.25, total 1246.25', () => {
      const header = {
        invoice_date: '2099-04-12',
        buyer_id: '11111111-1111-1111-1111-111111111111',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509',
        buyer_order_no: 'PO-1046',
        buyer_order_date: '10/04/2099',
        delivery_no: '0000',
        delivery_date: null,
        despatched_through: 'Tempo',
        destination: 'Melvisharam',
        terms_of_delivery: null,
      };

      const lines = [
        {
          description: 'Hair cap net',
          hsn: '6505',
          unit: 'PCS',
          quantity: '1',
          rate: '625.00',
          gst_percent: 5,
        },
        {
          description: 'Nozzle',
          hsn: '8481',
          unit: 'PCS',
          quantity: '1',
          rate: '500.00',
          gst_percent: 18,
        },
      ];

      const payload = buildInvoicePayload({ header, lines });

      // Check taxable
      expect(payload.taxable_paise).toBe(112500);
      expect(paiseToRupees(payload.taxable_paise)).toBe('1125.00');

      // Check tax: CGST 60.62 (6062 paise), SGST 60.63 (6063 paise), total tax 121.25
      expect(payload.cgst_paise).toBe(6062);
      expect(payload.sgst_paise).toBe(6063);
      expect(payload.cgst_paise + payload.sgst_paise).toBe(12125);
      expect(paiseToRupees(payload.cgst_paise + payload.sgst_paise)).toBe('121.25');

      // Check grand total / payable
      expect(payload.payable_paise).toBe(124625);
      expect(paiseToRupees(payload.payable_paise)).toBe('1246.25');

      // Check lines
      expect(payload.lines).toHaveLength(2);
      expect(payload.lines[0]).toEqual({
        line_no: 1,
        description: 'Hair cap net',
        hsn: '6505',
        unit: 'PCS',
        qty_milli: 1000,
        rate_paise: 62500,
        gst_percent: 5,
      });
      expect(payload.lines[1]).toEqual({
        line_no: 2,
        description: 'Nozzle',
        hsn: '8481',
        unit: 'PCS',
        qty_milli: 1000,
        rate_paise: 50000,
        gst_percent: 18,
      });

      // Words test
      expect(numberToWordsIndian(payload.payable_paise)).toBe(
        'Rupees One Thousand Two Hundred Forty Six and Twenty Five Paise Only'
      );
    });

    // Real Bill B: 200.00 + 1100.00 + 1575.00 @ 18%
    it('reproduces Bill (B): 200.00 plus 1100.00 plus 1575.00 at 18% -> total 3392.50', () => {
      const header = {
        invoice_date: '2099-04-15',
        buyer_id: '11111111-1111-1111-1111-111111111111',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Poonamallee',
        buyer_order_no: 'PO-1047',
        despatched_through: 'Direct',
      };

      const lines = [
        {
          description: 'Item 1',
          hsn: '3402',
          unit: 'KG',
          quantity: '1',
          rate: '200.00',
          gst_percent: 18,
        },
        {
          description: 'Item 2',
          hsn: '3402',
          unit: 'KG',
          quantity: '1',
          rate: '1100.00',
          gst_percent: 18,
        },
        {
          description: 'Item 3',
          hsn: '3402',
          unit: 'KG',
          quantity: '1',
          rate: '1575.00',
          gst_percent: 18,
        },
      ];

      const payload = buildInvoicePayload({ header, lines });

      // Total taxable: 200 + 1100 + 1575 = 2875.00
      expect(payload.taxable_paise).toBe(287500);
      expect(paiseToRupees(payload.taxable_paise)).toBe('2875.00');

      // Total tax: 18% of 2875 = 517.50 (CGST 258.75 + SGST 258.75)
      expect(payload.cgst_paise).toBe(25875);
      expect(payload.sgst_paise).toBe(25875);
      expect(payload.cgst_paise + payload.sgst_paise).toBe(51750);
      expect(paiseToRupees(payload.cgst_paise + payload.sgst_paise)).toBe('517.50');

      // Grand total: 2875.00 + 517.50 = 3392.50
      expect(payload.payable_paise).toBe(339250);
      expect(paiseToRupees(payload.payable_paise)).toBe('3392.50');

      expect(payload.lines).toHaveLength(3);
    });
  });
});
