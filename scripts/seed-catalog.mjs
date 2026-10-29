import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function loadEnv() {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) return {};
  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      env[trimmed.slice(0, eqIdx).trim()] = trimmed.slice(eqIdx + 1).trim();
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://rgphmteuhxxkqnoharvz.supabase.co';
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-rJWi_MtK66PVNOoacl1_g_qKSUBEIh';
const TEST_EMAIL = env.VITE_APP_AUTH_EMAIL || env.TEST_EMAIL || 'test@example.com';
const TEST_PASSWORD = env.VITE_APP_AUTH_PASSWORD || env.TEST_PASSWORD || 'Test@12345';

// Master item mappings for Khansa Enterprises
export const MASTER_ITEMS = [
  // Detergents & Soaps (3401, 3402)
  { description: 'Surf Excel', hsn: '3402', gst_percent: 18, unit: 'KG', default_rate_paise: 17500 },
  { description: 'Surf ExcelBlue', hsn: '3402', gst_percent: 18, unit: 'KG', default_rate_paise: 17500 },
  { description: 'Vim Soap', hsn: '3401', gst_percent: 18, unit: 'NOS', default_rate_paise: 1000 },
  { description: 'Hammam Soap', hsn: '3401', gst_percent: 18, unit: 'NOS', default_rate_paise: 5500 },
  { description: 'Rin Soap', hsn: '3401', gst_percent: 18, unit: 'NOS', default_rate_paise: 2000 },
  { description: 'Comfort Fabric Conditioner {860ml}', hsn: '3402', gst_percent: 18, unit: 'BTL', default_rate_paise: 21000 },
  { description: 'Soap Dispenser', hsn: '3924', gst_percent: 18, unit: 'PCS', default_rate_paise: 35000 },
  { description: 'Hand Sanitizer 100ml', hsn: '3808', gst_percent: 18, unit: 'BTL', default_rate_paise: 5000 },

  // Personal Protective & Hygiene (6505, 4015, 6307)
  { description: 'Hair Cap Net', hsn: '6505', gst_percent: 5, unit: 'NOS', default_rate_paise: 125 },
  { description: 'Face Mask', hsn: '6307', gst_percent: 5, unit: 'PCS', default_rate_paise: 200 },
  { description: 'Disposable Hand Gloves', hsn: '4015', gst_percent: 18, unit: 'BOX', default_rate_paise: 35000 },
  { description: 'Surgical Hand Gloves Nitrale', hsn: '4015', gst_percent: 18, unit: 'BOX', default_rate_paise: 45000 },
  { description: 'Cotton Hand Gloves {Normal}', hsn: '6116', gst_percent: 5, unit: 'PAIRS', default_rate_paise: 1500 },
  { description: 'Cotton Hand Gloves {LARGE}', hsn: '6116', gst_percent: 5, unit: 'PAIRS', default_rate_paise: 1800 },
  { description: 'Tissue Paper Flat', hsn: '4818', gst_percent: 18, unit: 'PKT', default_rate_paise: 4500 },
  { description: 'Towel Small Size', hsn: '6302', gst_percent: 5, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Waste Cotton Cloth white', hsn: '5902', gst_percent: 5, unit: 'KG', default_rate_paise: 8000 },
  { description: 'Ear Buds', hsn: '5601', gst_percent: 18, unit: 'PKT', default_rate_paise: 2500 },
  { description: 'Goggle Eye Glass', hsn: '9004', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },

  // Plastic Containers & Boxes (3923, 3926)
  { description: 'Plastic Oil Nozzle', hsn: '3923', gst_percent: 18, unit: 'NOS', default_rate_paise: 250 },
  { description: 'Oil Cane Plastic', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 800 },
  { description: 'Oil Cane', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 800 },
  { description: 'Oil Cane Pasting', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 850 },
  { description: 'Plastic Box 33', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'Plastic Box 55', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Plastc Box 99', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Plastic Box 16*12*49', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Plastic CD Tray', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
  { description: 'Plastic Bottle', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 1000 },
  { description: 'Plastic Cane 1 Lit', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 1800 },
  { description: 'Plastic Cane 5 Lit', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Plastic Container 500gm', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
  { description: 'Plastic Container 2kg', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 2800 },
  { description: 'Plastic Tray 202{Small}', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Plastic Tray 404 {Medium }', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 5500 },
  { description: 'Plastic Wire', hsn: '3926', gst_percent: 18, unit: 'MTR', default_rate_paise: 500 },
  { description: 'Poly Zip Cover', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 150 },
  { description: 'Poly Zip Cover 3*4', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 120 },
  { description: 'Water Container Tip Top Cup PVC', hsn: '3923', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Dust Bin [Mesh Type]-Big', hsn: '3926', gst_percent: 18, unit: 'PCS', default_rate_paise: 18000 },
  { description: 'Cling Wrap Ezee 100Mtr', hsn: '3920', gst_percent: 18, unit: 'ROLL', default_rate_paise: 28000 },

  // Tapes & Adhesives (3919, 3506)
  { description: 'Colour Tape', hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 4500 },
  { description: "3'' Yellow Colour Tape", hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 6500 },
  { description: "3'Yellow Marking Tape", hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 6500 },
  { description: "Floor Marking 3'' Tape Blue", hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 7500 },
  { description: '3m Tape Double Side', hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 12000 },
  { description: 'Scotch #8103M Tape', hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 9500 },
  { description: "2'' Foil Grey", hsn: '3919', gst_percent: 18, unit: 'ROLL', default_rate_paise: 5500 },
  { description: 'Glue Stick 15gm', hsn: '3506', gst_percent: 18, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Fevi Stick Glove', hsn: '3506', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Acrlylic Sticker', hsn: '3919', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'Shiny Black stickers', hsn: '3919', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
  { description: 'Sticker {White ,Yellow& Black}', hsn: '3919', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
  { description: 'Reflection Sheeting', hsn: '3919', gst_percent: 18, unit: 'MTR', default_rate_paise: 8500 },

  // Batteries (8506)
  { description: 'Battery AAA', hsn: '8506', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Battery AA', hsn: '8506', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Duracell Battery AAA', hsn: '8506', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Battery 9V', hsn: '8506', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },

  // Needles, Stitching & Tailoring (8452, 5806)
  { description: 'Hand Stiching Needle 3 1/2', hsn: '8452', gst_percent: 5, unit: 'PKT', default_rate_paise: 12000 },
  { description: 'Hand Stiching Needle Size #1 90101', hsn: '8452', gst_percent: 5, unit: 'PKT', default_rate_paise: 15000 },
  { description: 'Kuttu Oosi', hsn: '8452', gst_percent: 5, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Kuttu Oosi Holes Type {weaving Needle}', hsn: '8452', gst_percent: 5, unit: 'PCS', default_rate_paise: 3000 },
  { description: 'Thimbles NO=3,4,5&7', hsn: '8452', gst_percent: 5, unit: 'SET', default_rate_paise: 4500 },
  { description: '30mm Velcrow Black', hsn: '5806', gst_percent: 18, unit: 'MTR', default_rate_paise: 2500 },

  // Blades, Knives & Scissors (8211, 8213)
  { description: '18mm Blade', hsn: '8211', gst_percent: 18, unit: 'PKT', default_rate_paise: 4500 },
  { description: 'Duraco Blade 18mm', hsn: '8211', gst_percent: 18, unit: 'PKT', default_rate_paise: 6500 },
  { description: 'Aluminium Knife Handle', hsn: '8211', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'Cutter Knife', hsn: '8211', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Push Knife', hsn: '8211', gst_percent: 18, unit: 'PCS', default_rate_paise: 6000 },
  { description: 'Scissor', hsn: '8213', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'Scissor Small', hsn: '8213', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Tailor Scissor', hsn: '8213', gst_percent: 18, unit: 'PCS', default_rate_paise: 18000 },

  // Brushes, Squeezers & Cleaning (9603, 4016, 5705)
  { description: "1'' Paint Brush", hsn: '9603', gst_percent: 5, unit: 'PCS', default_rate_paise: 2500 },
  { description: 'Tooth Brush', hsn: '9603', gst_percent: 18, unit: 'PCS', default_rate_paise: 2000 },
  { description: 'Magic Duster', hsn: '9603', gst_percent: 5, unit: 'PCS', default_rate_paise: 4500 },
  { description: "3''Squeezer", hsn: '9603', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: "4''Squeezer", hsn: '9603', gst_percent: 18, unit: 'PCS', default_rate_paise: 5500 },
  { description: "5'' Squeezer", hsn: '9603', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },
  { description: '"U" Shape Squeezer Rubber', hsn: '4016', gst_percent: 18, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Squeezer Rubber Mate', hsn: '4016', gst_percent: 18, unit: 'PCS', default_rate_paise: 4000 },
  { description: 'Rubber Cushion Mate', hsn: '5705', gst_percent: 5, unit: 'MTR', default_rate_paise: 8500 },
  { description: "Rubber Cushion Mate RED{4''*120\"]Feet", hsn: '5705', gst_percent: 5, unit: 'MTR', default_rate_paise: 12000 },
  { description: "Rubber s Mate Grey 14''*4''", hsn: '5705', gst_percent: 5, unit: 'PCS', default_rate_paise: 5500 },

  // Paper, Stationery & Office (4820, 4811, 4802, 8305, 9608)
  { description: 'Long Size Note Book', hsn: '4820', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },
  { description: 'Exam Pad {Mica}', hsn: '4820', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'FC 30 Leaf Folder', hsn: '4820', gst_percent: 18, unit: 'PCS', default_rate_paise: 12000 },
  { description: 'A4 Lamination Sheet', hsn: '4811', gst_percent: 18, unit: 'PKT', default_rate_paise: 45000 },
  { description: 'A3 Lamination Sheet', hsn: '4811', gst_percent: 18, unit: 'PKT', default_rate_paise: 75000 },
  { description: 'A4 Colour Paper Green', hsn: '4802', gst_percent: 18, unit: 'REAM', default_rate_paise: 32000 },
  { description: 'B2B F/S Legal Paper', hsn: '4802', gst_percent: 18, unit: 'REAM', default_rate_paise: 35000 },
  { description: 'ACRLIYIC A4 Stand', hsn: '3926', gst_percent: 18, unit: 'PCS', default_rate_paise: 15000 },
  { description: '32mm Binder Clip', hsn: '8305', gst_percent: 18, unit: 'BOX', default_rate_paise: 6500 },
  { description: 'Steel Clip', hsn: '8305', gst_percent: 18, unit: 'BOX', default_rate_paise: 4500 },
  { description: 'Stapler M/C HD 10D', hsn: '8472', gst_percent: 18, unit: 'PCS', default_rate_paise: 9500 },
  { description: 'Stapler Pin Big', hsn: '8305', gst_percent: 18, unit: 'BOX', default_rate_paise: 3500 },
  { description: 'Uniball Pen', hsn: '9608', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },
  { description: 'Rorito Fanta Glid Pen', hsn: '9608', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'Parker Refile', hsn: '9608', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'OHP Marker Pen RED', hsn: '9608', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },
  { description: "2'' Feet Steel Scale", hsn: '9017', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'Steel Scale', hsn: '9017', gst_percent: 18, unit: 'PCS', default_rate_paise: 4500 },
  { description: 'Measurement Tape', hsn: '9017', gst_percent: 18, unit: 'PCS', default_rate_paise: 6500 },
  { description: 'Inch Tape', hsn: '9017', gst_percent: 18, unit: 'PCS', default_rate_paise: 2500 },

  // Sprays & Repellents (9616, 3808)
  { description: 'Air Wick Spray', hsn: '9616', gst_percent: 18, unit: 'PCS', default_rate_paise: 18500 },
  { description: 'Roomspray', hsn: '9616', gst_percent: 18, unit: 'PCS', default_rate_paise: 16500 },
  { description: 'Touch & Fresh', hsn: '9616', gst_percent: 18, unit: 'PCS', default_rate_paise: 12500 },
  { description: 'Good Knight Mosquito +Machine', hsn: '3808', gst_percent: 18, unit: 'SET', default_rate_paise: 14000 },

  // Printing & Mesh Supplies (3208, 5911)
  { description: 'S3 Clear {Screen Printing}', hsn: '3208', gst_percent: 18, unit: 'KG', default_rate_paise: 65000 },
  { description: 'FT 003 PMS 8520-C-Grey Silver', hsn: '3208', gst_percent: 18, unit: 'KG', default_rate_paise: 85000 },
  { description: 'Texylon 58000 Gold SHIMMER', hsn: '3208', gst_percent: 18, unit: 'KG', default_rate_paise: 95000 },
  { description: 'Nylo Bolt Mesh -500', hsn: '5911', gst_percent: 18, unit: 'MTR', default_rate_paise: 45000 },

  // Hardware & Sundry
  { description: 'Lock & Key 50mm 7Lever', hsn: '8301', gst_percent: 18, unit: 'PCS', default_rate_paise: 24000 },
  { description: 'Lock 40mm', hsn: '8301', gst_percent: 18, unit: 'PCS', default_rate_paise: 15000 },
  { description: 'Lock & Key', hsn: '8301', gst_percent: 18, unit: 'PCS', default_rate_paise: 15000 },
  { description: '8mm Nail', hsn: '7317', gst_percent: 18, unit: 'KG', default_rate_paise: 12000 },
  { description: "1''INCH CAP CUP HOOK", hsn: '7318', gst_percent: 18, unit: 'PKT', default_rate_paise: 4500 },
  { description: 'B-Hook', hsn: '7318', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'Cloth Clip', hsn: '3926', gst_percent: 18, unit: 'PKT', default_rate_paise: 4500 },
  { description: 'Nail Cutter', hsn: '8214', gst_percent: 18, unit: 'PCS', default_rate_paise: 3500 },
  { description: 'Magnifying Glass Normal', hsn: '9013', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'Magnifying Glass[IMPORTED}', hsn: '9013', gst_percent: 18, unit: 'PCS', default_rate_paise: 15000 },
  { description: 'Hair Dryer 1200Watts{Philips}', hsn: '8516', gst_percent: 18, unit: 'PCS', default_rate_paise: 145000 },
  { description: 'Iron Box', hsn: '8516', gst_percent: 18, unit: 'PCS', default_rate_paise: 85000 },
  { description: 'Milton Flask', hsn: '9617', gst_percent: 18, unit: 'PCS', default_rate_paise: 65000 },
  { description: 'Wall Clock {Medium}', hsn: '9105', gst_percent: 18, unit: 'PCS', default_rate_paise: 45000 },
  { description: 'Wireless Calling Bell', hsn: '8531', gst_percent: 18, unit: 'SET', default_rate_paise: 65000 },
  { description: 'Candle', hsn: '3406', gst_percent: 18, unit: 'PKT', default_rate_paise: 2500 },
  { description: 'Lighter', hsn: '9613', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'Boric Powder', hsn: '2810', gst_percent: 18, unit: 'PKT', default_rate_paise: 3500 },
  { description: 'Janimaz', hsn: '5705', gst_percent: 5, unit: 'PCS', default_rate_paise: 25000 },
  { description: 'Cup', hsn: '3924', gst_percent: 18, unit: 'PCS', default_rate_paise: 2000 },
  { description: 'China Leaf {Thick}', hsn: '3926', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'China Leaf {Thin}', hsn: '3926', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
  { description: 'Dymo 12mm White', hsn: '4821', gst_percent: 18, unit: 'ROLL', default_rate_paise: 45000 },
  { description: 'Dymo 19mm White', hsn: '4821', gst_percent: 18, unit: 'ROLL', default_rate_paise: 55000 },
  { description: 'Dymo Label Manager LM 4209', hsn: '8472', gst_percent: 18, unit: 'PCS', default_rate_paise: 480000 },
  { description: 'Emery Sheet 80 Grid', hsn: '6805', gst_percent: 18, unit: 'PCS', default_rate_paise: 1500 },
  { description: 'PENCIL Type Lamping Tool', hsn: '8205', gst_percent: 18, unit: 'PCS', default_rate_paise: 8500 },
  { description: 'Compatable Disc 19mm White', hsn: '3926', gst_percent: 18, unit: 'PCS', default_rate_paise: 1200 },
];

async function seedItems() {
  console.log(`Connecting to Supabase at: ${SUPABASE_URL}`);
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // Authenticate if credentials available
  if (TEST_EMAIL && TEST_PASSWORD) {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (authErr) {
      console.warn('Supabase auth failed, proceeding in anon mode:', authErr.message);
    } else {
      console.log(`Authenticated as ${TEST_EMAIL}`);
    }
  }

  // Fetch existing items to prevent duplicates
  const { data: existing, error: fetchErr } = await supabase.from('items').select('id, description');
  if (fetchErr) {
    throw new Error(`Failed to fetch existing items: ${fetchErr.message}`);
  }

  const existingMap = new Map();
  for (const item of (existing || [])) {
    existingMap.set(item.description.trim().toLowerCase(), item.id);
  }
  console.log(`Currently ${existingMap.size} items in database.`);

  let inserted = 0;
  let updated = 0;

  for (const item of MASTER_ITEMS) {
    const key = item.description.trim().toLowerCase();
    const existingId = existingMap.get(key);

    const payload = {
      description: item.description.trim(),
      hsn: item.hsn,
      gst_percent: item.gst_percent,
      unit: item.unit,
      default_rate_paise: item.default_rate_paise,
      verified: true,
      active: true,
    };

    if (existingId) {
      // Update existing item with HSN / GST if missing or update
      const { error: updateErr } = await supabase
        .from('items')
        .update(payload)
        .eq('id', existingId);
      if (updateErr) {
        console.error(`Error updating "${item.description}":`, updateErr.message);
      } else {
        updated++;
      }
    } else {
      // Insert new item
      const { error: insertErr } = await supabase
        .from('items')
        .insert(payload);
      if (insertErr) {
        console.error(`Error inserting "${item.description}":`, insertErr.message);
      } else {
        inserted++;
      }
    }
  }

  console.log(`\nSeeding completed!`);
  console.log(`Items inserted: ${inserted}`);
  console.log(`Items updated: ${updated}`);
  console.log(`Total in catalog: ${existingMap.size + inserted}`);
}

seedItems().catch((err) => {
  console.error('Seed error:', err);
  process.exit(1);
});

