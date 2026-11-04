import { describe, it, expect } from 'vitest';
import { urlBase64ToUint8Array, VAPID_PUBLIC_KEY } from './pushSubscription.js';

describe('Push Subscription Utilities', () => {
  it('converts base64 url string into Uint8Array correctly', () => {
    const bytes = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(0);
  });

  it('handles standard base64 test strings without throwing', () => {
    const sample = 'BA12-34_56';
    const bytes = urlBase64ToUint8Array(sample);
    expect(bytes).toBeInstanceOf(Uint8Array);
  });
});
