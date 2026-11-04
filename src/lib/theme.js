// App Theme & Color Palette Manager for Khansa Enterprises GST Invoicing

export const THEMES = [
  {
    id: 'emerald',
    name: 'Executive Emerald',
    description: 'Classic accounting & ledger green. Reliable, professional, and easy on the eyes.',
    accentHex: '#059669',
    badgeText: 'Accounting Standard',
    previewColors: ['#0f172a', '#059669', '#ecfdf5'],
  },
  {
    id: 'navy',
    name: 'Royal Navy',
    description: 'Deep authoritative corporate blue with slate navy header.',
    accentHex: '#2563eb',
    badgeText: 'Corporate Trust',
    previewColors: ['#0f172a', '#2563eb', '#eff6ff'],
  },
  {
    id: 'teal',
    name: 'Nordic Teal',
    description: 'Modern ocean teal with high contrast and calm focus.',
    accentHex: '#0d9488',
    badgeText: 'Modern & Calm',
    previewColors: ['#134e4a', '#0d9488', '#f0fdfa'],
  },
  {
    id: 'charcoal',
    name: 'Industrial Amber',
    description: 'Warm amber bronze with deep slate charcoal.',
    accentHex: '#d97706',
    badgeText: 'Industrial Trade',
    previewColors: ['#18181b', '#d97706', '#fffbeb'],
  },
];

export const DEFAULT_THEME = 'emerald';

export function getStoredTheme() {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return localStorage.getItem('khansa_app_theme') || DEFAULT_THEME;
  } catch (e) {
    return DEFAULT_THEME;
  }
}

export function applyTheme(themeId) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;

  // Remove existing theme classes
  THEMES.forEach((t) => root.classList.remove(`theme-${t.id}`));

  const validTheme = THEMES.find((t) => t.id === themeId) ? themeId : DEFAULT_THEME;
  root.classList.add(`theme-${validTheme}`);

  try {
    localStorage.setItem('khansa_app_theme', validTheme);
  } catch (e) {
    // ignore
  }

  return validTheme;
}
