/**
 * Common GST HSN Codes and recommended tax rates for Khansa Enterprises
 * (Sanitary, hygiene, packaging, cleaning, and industrial supplies).
 */
export const COMMON_HSN_CODES = [
  {
    hsn: '6505',
    category: 'Hair Cap / Hair Net / Headgear',
    defaultGst: 5,
    description: 'Hats and other headgear, hair nets of any material',
  },
  {
    hsn: '3402',
    category: 'Cleaning Detergent & Washing Agents',
    defaultGst: 18,
    description: 'Organic surface-active agents, washing and cleaning preparations',
  },
  {
    hsn: '3401',
    category: 'Soap & Handwash',
    defaultGst: 18,
    description: 'Soap, organic surface-active products for washing skin',
  },
  {
    hsn: '8424',
    category: 'Spray Nozzles & Sprayers',
    defaultGst: 18,
    description: 'Mechanical appliances for spraying or dispersing liquids or powders',
  },
  {
    hsn: '4015',
    category: 'Rubber & Latex Gloves',
    defaultGst: 18,
    description: 'Articles of apparel and clothing accessories of vulcanised rubber',
  },
  {
    hsn: '6307',
    category: 'Face Masks & Shoe Covers',
    defaultGst: 5,
    description: 'Other made up textile articles, face masks, protective shoe covers',
  },
  {
    hsn: '3926',
    category: 'Plastic Articles & Poly Bags',
    defaultGst: 18,
    description: 'Other articles of plastics, fittings, sheets, covers',
  },
  {
    hsn: '4818',
    category: 'Paper Towels & Tissues',
    defaultGst: 18,
    description: 'Toilet paper, cleansing tissues, hand towels and household paper',
  },
  {
    hsn: '9018',
    category: 'Sanitary / Medical Instruments',
    defaultGst: 12,
    description: 'Instruments and appliances used in medical or surgical sciences',
  },
  {
    hsn: '9603',
    category: 'Brooms, Brushes & Mops',
    defaultGst: 18,
    description: 'Brooms, brushes, mops and mechanical floor sweepers',
  },
];

/**
 * Quick search / lookup for HSN codes by keyword or digits.
 */
export function lookupHsn(query) {
  if (!query || typeof query !== 'string') return COMMON_HSN_CODES;
  const q = query.trim().toLowerCase();
  return COMMON_HSN_CODES.filter(
    (item) =>
      item.hsn.includes(q) ||
      item.category.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q)
  );
}
