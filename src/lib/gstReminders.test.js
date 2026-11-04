import { describe, it, expect } from 'vitest';
import { getGstReminder } from './gstReminders.js';

describe('GST Reminders Logic', () => {
  it('returns GSTR-1 reminder on 8th day of month', () => {
    const d8 = new Date('2026-11-08T10:00:00');
    const rem = getGstReminder(d8);
    expect(rem).not.toBeNull();
    expect(rem.type).toBe('GSTR-1');
    expect(rem.title).toMatch(/GSTR-1/);
    expect(rem.message).toMatch(/8th of the month/);
  });

  it('returns GSTR-1 reminder on 11th day of month with urgency', () => {
    const d11 = new Date('2026-11-11T10:00:00');
    const rem = getGstReminder(d11);
    expect(rem).not.toBeNull();
    expect(rem.type).toBe('GSTR-1');
    expect(rem.urgency).toBe('urgent');
    expect(rem.message).toMatch(/LAST DAY/);
  });

  it('returns GSTR-3B reminder on 19th day of month', () => {
    const d19 = new Date('2026-11-19T10:00:00');
    const rem = getGstReminder(d19);
    expect(rem).not.toBeNull();
    expect(rem.type).toBe('GSTR-3B');
    expect(rem.title).toMatch(/GSTR-3B Due Tomorrow/);
    expect(rem.message).toMatch(/19th/);
  });

  it('returns GSTR-3B urgent reminder on 20th day of month', () => {
    const d20 = new Date('2026-11-20T10:00:00');
    const rem = getGstReminder(d20);
    expect(rem).not.toBeNull();
    expect(rem.type).toBe('GSTR-3B');
    expect(rem.urgency).toBe('urgent');
    expect(rem.message).toMatch(/20th/);
  });

  it('returns null on non-reminder days (e.g. 1st, 15th, 25th)', () => {
    expect(getGstReminder(new Date('2026-11-01T10:00:00'))).toBeNull();
    expect(getGstReminder(new Date('2026-11-15T10:00:00'))).toBeNull();
    expect(getGstReminder(new Date('2026-11-25T10:00:00'))).toBeNull();
  });
});
