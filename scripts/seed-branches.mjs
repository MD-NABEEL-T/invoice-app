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

const BRANCHES = [
  {
    label: 'Unit-IV (Ranipet)',
    address: 'LEATHER GOODS DIVISION UNIT-IV\nCHENNAI-KRISHNAGIRI BYEPASS ROAD,\nRANIPET.',
    active: true,
  },
  {
    label: 'Unit-III (Melvisharam)',
    address: 'LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509',
    active: true,
  },
  {
    label: "Tannery 'A' Div (Ranipet)",
    address: "Tannery 'A' Division,\n117,Chennai- Mumbai Trunk Road,\nRanipet",
    active: true,
  },
  {
    label: 'Leather Product Div (Vellore)',
    address: 'LEATHER PRODUCT DIVISION\nVELLORE',
    active: true,
  },
];

async function seedBranches() {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  if (TEST_EMAIL && TEST_PASSWORD) {
    const { error: authErr } = await supabase.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
    });
    if (authErr) console.warn('Auth notice:', authErr.message);
  }

  // 1. Get KH Export Buyer ID
  let { data: buyers, error: bErr } = await supabase.from('buyers').select('*');
  if (bErr) throw bErr;

  let khBuyer = buyers?.find(b => b.name.toLowerCase().includes('kh export'));
  if (!khBuyer) {
    console.log('KH Export not found, creating buyer...');
    const { data: createdBuyer, error: cErr } = await supabase.from('buyers').insert({
      name: 'KH EXPORT INDIA PVT LTD',
      gstin: '33AAACR1714R1ZA',
      state_code: '33',
      active: true,
    }).select().single();
    if (cErr) throw cErr;
    khBuyer = createdBuyer;
  }

  console.log(`Buyer: ${khBuyer.name} (${khBuyer.id})`);

  // 2. Fetch existing addresses for this buyer
  const { data: existingAddresses, error: aErr } = await supabase
    .from('buyer_addresses')
    .select('*')
    .eq('buyer_id', khBuyer.id);
  if (aErr) throw aErr;

  console.log(`Found ${existingAddresses.length} existing addresses.`);

  for (const b of BRANCHES) {
    // Check if branch exists by matching keywords in address or label
    const match = existingAddresses.find(ea =>
      (ea.label && ea.label.toLowerCase() === b.label.toLowerCase()) ||
      (ea.address && ea.address.toLowerCase().includes(b.label.slice(0, 7).toLowerCase()))
    );

    if (match) {
      console.log(`Updating existing branch: ${b.label}`);
      const { error: uErr } = await supabase
        .from('buyer_addresses')
        .update({
          label: b.label,
          address: b.address,
          active: true,
        })
        .eq('id', match.id);
      if (uErr) console.error(`Error updating ${b.label}:`, uErr.message);
    } else {
      console.log(`Inserting new branch: ${b.label}`);
      const { error: iErr } = await supabase
        .from('buyer_addresses')
        .insert({
          buyer_id: khBuyer.id,
          label: b.label,
          address: b.address,
          active: true,
        });
      if (iErr) console.error(`Error inserting ${b.label}:`, iErr.message);
    }
  }

  // Also remove or deactivate any 'ADDRESS PENDING'
  const pending = existingAddresses.find(ea => ea.address === 'ADDRESS PENDING');
  if (pending) {
    await supabase.from('buyer_addresses').delete().eq('id', pending.id);
  }

  const { data: finalAddresses } = await supabase
    .from('buyer_addresses')
    .select('*')
    .eq('buyer_id', khBuyer.id);
  console.log('\nFinal branches in database:');
  for (const a of (finalAddresses || [])) {
    console.log(`- [${a.label}] Active: ${a.active}\n  ${a.address.replace(/\n/g, ' | ')}`);
  }
}

seedBranches().catch(console.error);
