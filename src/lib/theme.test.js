import { describe, it, expect } from 'vitest';
import { THEMES, DEFAULT_THEME, getStoredTheme } from './theme.js';

describe('Theme Configuration', () => {
  it('defines valid themes with required properties', () => {
    expect(THEMES.length).toBeGreaterThanOrEqual(3);
    for (const theme of THEMES) {
      expect(theme.id).toBeDefined();
      expect(theme.name).toBeDefined();
      expect(theme.accentHex).toBeDefined();
      expect(theme.previewColors).toHaveLength(3);
    }
  });

  it('defaults to emerald theme if no theme is stored', () => {
    expect(DEFAULT_THEME).toBe('emerald');
    expect(getStoredTheme()).toBe('emerald');
  });
});

