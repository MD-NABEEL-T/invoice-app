import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { calcInvoice, financialYear, formatInvoiceNo } from '../src/lib/tax.js';
import { buildInvoicePayload } from '../src/lib/billPayload.js';

// Read credentials from .env.local
const env = fs.readFileSync('.env.local', 'utf8');
const url = env.match(/VITE_SUPABASE_URL=(.*)/)?.[1]?.trim();
const key = env.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/)?.[1]?.trim();

if (!url || !key) {
  console.error('❌ Could not find Supabase URL/Key in .env.local');
  process.exit(1);
}

const supabase = createClient(url, key);

async function runAudit() {
  console.log('=====================================================');
  console.log('🚀 COMPREHENSIVE PRODUCTION READINESS AUDIT & TEST');
  console.log('=====================================================\n');

  let passedTests = 0;
  let totalTests = 0;

  function assert(condition, name, details = '') {
    totalTests++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passedTests++;
    } else {
      console.error(`  ❌ [FAIL] ${name} ${details ? '(' + details + ')' : ''}`);
    }
  }

  // ---------------------------------------------------------------------------
  // TEST 1: Database Connectivity & Core Tables
  // ---------------------------------------------------------------------------
  console.log('1. DATABASE TABLES & PUBLIC ACCESS');
  const { data: profile, error: pErr } = await supabase.from('firm_profile').select('*').limit(1);
  assert(!pErr && profile && profile.length > 0, 'Firm profile accessible', pErr?.message);
  console.log(`     Firm: ${profile?.[0]?.firm_name || 'N/A'}, GSTIN: ${profile?.[0]?.gstin || 'N/A'}`);

  const { data: buyers, error: bErr } = await supabase.from('buyers').select('id, name, gstin');
  assert(!bErr && buyers && buyers.length > 0, 'Buyers table accessible', bErr?.message);
  console.log(`     Buyers found: ${buyers?.length || 0}`);

  const { count: itemsCount, error: itErr } = await supabase.from('items').select('*', { count: 'exact', head: true });
  assert(!itErr && (itemsCount ?? 0) > 0, 'Catalog items accessible', itErr?.message);
  console.log(`     Catalog items count: ${itemsCount}`);

  const { data: counters, error: cErr } = await supabase.from('counters').select('*');
  assert(!cErr && Array.isArray(counters), 'Counters table accessible', cErr?.message);
  console.log(`     Counters found: ${JSON.stringify(counters)}`);

  // ---------------------------------------------------------------------------
  // TEST 2: Numbering Series Settings (/settings/numbering)
  // ---------------------------------------------------------------------------
  console.log('\n2. NUMBERING SETTINGS & LIVE COUNTER SYNC');
  const targetFy = '26-27';
  // Test reading current counter
  const { data: currentCounter } = await supabase.from('counters').select('*').eq('fy', targetFy).maybeSingle();
  const initialLastNum = currentCounter?.last_number ?? 0;
  console.log(`     Current last_number for FY ${targetFy}: ${initialLastNum}`);

  // Test updating counter
  const testNextNum = 5;
  const testLastNum = testNextNum - 1; // 4
  const { error: upsertErr } = await supabase.from('counters').upsert({ fy: targetFy, last_number: testLastNum });
  assert(!upsertErr, 'Update counters last_number via direct upsert', upsertErr?.message);

  const { data: updatedCounter } = await supabase.from('counters').select('*').eq('fy', targetFy).single();
  assert(updatedCounter?.last_number === testLastNum, 'Counter value verified in DB after update');

  // Format check
  const formattedNext = formatInvoiceNo(testNextNum, targetFy);
  assert(formattedNext === '005/26-27', `Formatted invoice number matches standard: ${formattedNext}`);

  // ---------------------------------------------------------------------------
  // TEST 3: Tax Calculation Engine (tax.js)
  // ---------------------------------------------------------------------------
  console.log('\n3. TAX CALCULATION ENGINE');
  const sampleLines = [
    { description: 'Item A', hsn: '1234', unit: 'PCS', qtyMilli: 1000, ratePaise: 100000, gstPercent: 5 }, // ₹1000.00 @ 5% = ₹50 tax
    { description: 'Item B', hsn: '5678', unit: 'PCS', qtyMilli: 2000, ratePaise: 50000, gstPercent: 18 }, // ₹1000.00 @ 18% = ₹180 tax
  ];
  const calc = calcInvoice(sampleLines);
  assert(calc.totalTaxablePaise === 200000, 'Taxable value calculated correctly: ₹2000.00');
  assert(calc.totalCgstPaise === 11500, 'CGST calculated correctly: ₹115.00');
  assert(calc.totalSgstPaise === 11500, 'SGST calculated correctly: ₹115.00');
  assert(calc.payablePaise === 223000, 'Total payable calculated correctly: ₹2230.00');

  // ---------------------------------------------------------------------------
  // TEST 4: Bill Creation (NewBill.jsx flow & Direct Fallback)
  // ---------------------------------------------------------------------------
  console.log('\n4. BILL CREATION & PERSISTENCE FLOW');
  const buyer = buyers[0];
  const testBillDate = '2026-11-01';
  const testFy = financialYear(testBillDate);
  const nextNum = (updatedCounter.last_number ?? 0) + 1;
  const testInvoiceNo = formatInvoiceNo(nextNum, testFy);

  const testInvoicePayload = {
    invoice_no: testInvoiceNo,
    number: nextNum,
    fy: testFy,
    invoice_date: testBillDate,
    status: 'final',
    buyer_id: buyer.id,
    buyer_name: buyer.name,
    buyer_gstin: buyer.gstin || '33AAACK4059K1ZF',
    buyer_state_code: '33',
    buyer_address: 'MELVISHARAM, TAMIL NADU',
    buyer_order_no: 'PO-AUDIT-TEST-001',
    buyer_order_date: '2026-11-01',
    delivery_no: 'DC-001',
    delivery_date: '2026-11-01',
    despatched_through: 'HAND DELIVERY',
    destination: 'MELVISHARAM',
    taxable_paise: calc.totalTaxablePaise,
    cgst_paise: calc.totalCgstPaise,
    sgst_paise: calc.totalSgstPaise,
    payable_paise: calc.payablePaise,
  };

  const { data: createdBill, error: billInsertErr } = await supabase
    .from('invoices')
    .insert(testInvoicePayload)
    .select('id, invoice_no')
    .single();

  assert(!billInsertErr && createdBill?.id, `Invoice inserted directly: #${testInvoiceNo}`, billInsertErr?.message);

  let billId = createdBill?.id;
  if (billId) {
    const lineInserts = sampleLines.map((l, idx) => ({
      invoice_id: billId,
      line_no: idx + 1,
      description: l.description,
      hsn: l.hsn,
      unit: l.unit,
      qty_milli: l.qtyMilli,
      rate_paise: l.ratePaise,
      gst_percent: l.gstPercent,
      amount_paise: Math.round((l.qtyMilli * l.ratePaise) / 1000),
    }));

    const { error: linesInsertErr } = await supabase.from('invoice_lines').insert(lineInserts);
    assert(!linesInsertErr, `Invoice lines inserted (${lineInserts.length} items)`, linesInsertErr?.message);

    // Increment counter
    await supabase.from('counters').upsert({ fy: testFy, last_number: nextNum });
    console.log(`     Counter incremented to: ${nextNum}`);
  }

  // ---------------------------------------------------------------------------
  // TEST 5: Fetch Bill & Detail Relations (BillView.jsx flow)
  // ---------------------------------------------------------------------------
  console.log('\n5. BILL VIEW & RELATIONAL DATA FETCH');
  if (billId) {
    const { data: fetchedBill, error: fetchErr } = await supabase
      .from('invoices')
      .select('*, invoice_lines(*)')
      .eq('id', billId)
      .single();

    assert(!fetchErr && fetchedBill, `Bill fetched by ID with line items`, fetchErr?.message);
    assert(fetchedBill?.invoice_lines?.length === 2, `Line items count matches (2 lines)`);
    assert(fetchedBill?.invoice_no === testInvoiceNo, `Invoice number matches: ${fetchedBill?.invoice_no}`);
    assert(fetchedBill?.payable_paise === 223000, `Payable paise matches calculated ₹2230.00`);
    console.log(`     Verified Buyer: ${fetchedBill?.buyer_name}`);
    console.log(`     Line 1: ${fetchedBill?.invoice_lines?.[0]?.description} (₹${(fetchedBill?.invoice_lines?.[0]?.amount_paise / 100).toFixed(2)})`);
    console.log(`     Line 2: ${fetchedBill?.invoice_lines?.[1]?.description} (₹${(fetchedBill?.invoice_lines?.[1]?.amount_paise / 100).toFixed(2)})`);
  }

  // ---------------------------------------------------------------------------
  // TEST 6: Cleanup Test Data & Reset Counters to 0 (Fresh Production State)
  // ---------------------------------------------------------------------------
  console.log('\n6. FRESH PRODUCTION STATE & CLEANUP');
  // Delete the test invoice lines
  if (billId) {
    const { error: lDelErr } = await supabase.from('invoice_lines').delete().eq('invoice_id', billId);
    console.log(`     Cleaned test invoice lines: ${lDelErr ? 'Trigger active' : 'Cleaned'}`);
    const { error: iDelErr } = await supabase.from('invoices').delete().eq('id', billId);
    console.log(`     Cleaned test invoice: ${iDelErr ? 'Trigger active' : 'Cleaned'}`);
  }

  // Reset counter to 0 for FY 26-27 so the uncle starts at 001/26-27!
  const { error: resetErr } = await supabase.from('counters').upsert({ fy: '26-27', last_number: 0 });
  assert(!resetErr, 'Reset FY 26-27 counter to 0 (Next invoice: 001/26-27)', resetErr?.message);

  const { data: finalCounter } = await supabase.from('counters').select('*').eq('fy', '26-27').single();
  assert(finalCounter?.last_number === 0, `Verified final counter last_number = 0`);

  console.log('\n=====================================================');
  console.log(`📊 AUDIT RESULTS: ${passedTests} / ${totalTests} TESTS PASSED (${Math.round((passedTests/totalTests)*100)}%)`);
  console.log('=====================================================');

  if (passedTests === totalTests) {
    console.log('🎉 ALL INTEGRATION FLOWS VALIDATED SUCCESSFULLY!');
  } else {
    console.warn('⚠️ SOME TESTS ENCOUNTERED WARNINGS.');
  }
}

runAudit();
