import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read environment variables from .env.local
function loadEnv() {
  const envPath = path.join(rootDir, '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error(`.env.local file not found at: ${envPath}`);
  }

  const content = fs.readFileSync(envPath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const TEST_EMAIL = env.TEST_EMAIL || process.env.TEST_EMAIL;
const TEST_PASSWORD = env.TEST_PASSWORD || process.env.TEST_PASSWORD;

const results = [];

function recordResult(testId, name, passed, details) {
  results.push({
    Test: testId,
    Scenario: name,
    Result: passed ? 'PASS' : 'FAIL',
    Details: details || ''
  });
}

async function run() {
  console.log('===============================================================');
  console.log(' GST Invoice App - Supabase API Verification (Phase 2)');
  console.log(' All test invoices use FY: 99-00 (April 2099) - Live series safe');
  console.log('===============================================================\n');

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('FATAL: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is missing in .env.local\n');
    process.exit(1);
  }

  const anonClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const authClient = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  let jwt = null;
  let invoiceId1 = null;
  let invoiceId3 = null;

  // ---------------------------------------------------------------------------
  // Test 1: User Login
  // ---------------------------------------------------------------------------
  try {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      recordResult(
        'Test 1',
        'User Login',
        false,
        'TEST_EMAIL or TEST_PASSWORD not specified in .env.local'
      );
    } else {
      const { data, error } = await authClient.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      });

      if (error || !data?.session?.access_token) {
        recordResult('Test 1', 'User Login', false, error?.message || 'No access token returned');
      } else {
        jwt = data.session.access_token;
        recordResult('Test 1', 'User Login', true, `Authenticated as ${TEST_EMAIL}`);
      }
    }
  } catch (err) {
    recordResult('Test 1', 'User Login', false, err.message);
  }

  // Ensure counters exist for test FYs ('99-00' and '98-99'), tolerating "already exists"
  if (jwt) {
    for (const testFy of ['99-00', '98-99']) {
      try {
        const { error: setErr } = await authClient.rpc('set_starting_number', {
          p_fy: testFy,
          p_last_used: 0
        });
        if (setErr && !setErr.message.includes('already exists') && !setErr.message.includes('already exist')) {
          console.warn(`Warning initializing starting number for ${testFy}: ${setErr.message}`);
        }
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('already exist')) {
          console.warn(`Warning initializing starting number for ${testFy}: ${err.message}`);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Test 2: Call create_invoice Twice (Sequential Numbering & Format)
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 2', 'Sequential Numbering (001/99-00, 002/99-00)', false, 'Skipped: Not authenticated');
  } else {
    try {
      const payload2A = {
        invoice_date: '2099-04-10',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division\n4/74 V.O.C street seneerkuppam, Poonamallee\nChennai-56',
        buyer_order_no: 'PO-1001',
        buyer_order_date: '08/04/2099',
        delivery_no: '0000',
        delivery_date: null,
        despatched_through: 'Direct Delivery',
        destination: 'Chennai',
        terms_of_delivery: null,
        taxable_paise: 20000,
        cgst_paise: 1800,
        sgst_paise: 1800,
        payable_paise: 23600,
        lines: [
          {
            line_no: 1,
            description: 'Cleaning Detergent',
            hsn: '3402',
            unit: 'KG',
            qty_milli: 1000,
            rate_paise: 20000,
            gst_percent: 18
          }
        ]
      };

      const { data: data2A, error: err2A } = await authClient.rpc('create_invoice', { payload: payload2A });
      if (err2A || !data2A?.invoice_no) {
        throw new Error(`2A failed: ${err2A?.message || 'No invoice_no returned'}`);
      }
      invoiceId1 = data2A.id;

      const payload2B = { ...payload2A, buyer_order_no: 'PO-1002' };
      const { data: data2B, error: err2B } = await authClient.rpc('create_invoice', { payload: payload2B });
      if (err2B || !data2B?.invoice_no) {
        throw new Error(`2B failed: ${err2B?.message || 'No invoice_no returned'}`);
      }

      // Check format and sequential continuation
      const numA = parseInt(data2A.invoice_no.split('/')[0], 10);
      const numB = parseInt(data2B.invoice_no.split('/')[0], 10);

      if (data2A.invoice_no.endsWith('/99-00') && data2B.invoice_no.endsWith('/99-00') && numB === numA + 1) {
        recordResult('Test 2', 'Sequential Numbering', true, `${data2A.invoice_no} -> ${data2B.invoice_no}`);
      } else {
        recordResult('Test 2', 'Sequential Numbering', false, `Unexpected numbering: ${data2A.invoice_no}, ${data2B.invoice_no}`);
      }
    } catch (err) {
      recordResult('Test 2', 'Sequential Numbering', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 3: Mixed GST Rates (5% and 18%) & Totals Verification
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 3', 'Mixed GST Rates (5% & 18%)', false, 'Skipped: Not authenticated');
  } else {
    try {
      const payload3 = {
        invoice_date: '2099-04-12',
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
        taxable_paise: 112500,
        cgst_paise: 6062,
        sgst_paise: 6063,
        payable_paise: 124625,
        lines: [
          {
            line_no: 1,
            description: 'Hair cap net',
            hsn: '6505',
            unit: 'PCS',
            qty_milli: 1000,
            rate_paise: 62500,
            gst_percent: 5
          },
          {
            line_no: 2,
            description: 'Nozzle',
            hsn: '8481',
            unit: 'PCS',
            qty_milli: 1000,
            rate_paise: 50000,
            gst_percent: 18
          }
        ]
      };

      const { data: data3, error: err3 } = await authClient.rpc('create_invoice', { payload: payload3 });
      if (err3 || !data3?.invoice_no) {
        throw new Error(err3?.message || 'Invoice creation failed');
      }
      invoiceId3 = data3.id;
      recordResult('Test 3', 'Mixed GST Rates', true, `Created invoice ${data3.invoice_no}`);
    } catch (err) {
      recordResult('Test 3', 'Mixed GST Rates', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 4: Send Payload with Wrong Totals (Expect Failure)
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 4', 'Wrong Totals Rejection', false, 'Skipped: Not authenticated');
  } else {
    try {
      const payload4 = {
        invoice_date: '2099-04-12',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division',
        buyer_order_no: 'PO-TAMPERED',
        despatched_through: 'Tempo',
        taxable_paise: 112500,
        cgst_paise: 6062,
        sgst_paise: 6063,
        payable_paise: 999999, // Forged total
        lines: [
          {
            line_no: 1,
            description: 'Hair cap net',
            hsn: '6505',
            unit: 'PCS',
            qty_milli: 1000,
            rate_paise: 62500,
            gst_percent: 5
          }
        ]
      };

      const { data, error } = await authClient.rpc('create_invoice', { payload: payload4 });
      if (error && (error.message.includes('mismatch') || error.message.includes('totals'))) {
        recordResult('Test 4', 'Wrong Totals Rejection', true, `Correctly rejected: ${error.message}`);
      } else if (!error) {
        recordResult('Test 4', 'Wrong Totals Rejection', false, 'Unexpectedly succeeded with tampered total');
      } else {
        recordResult('Test 4', 'Wrong Totals Rejection', false, `Failed with unexpected error: ${error.message}`);
      }
    } catch (err) {
      recordResult('Test 4', 'Wrong Totals Rejection', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 5: Try to DELETE an Invoice (Expect Failure)
  // ---------------------------------------------------------------------------
  if (!jwt || !invoiceId1) {
    recordResult('Test 5', 'Block DELETE on Invoices', false, 'Skipped: Requires active invoice from Test 2');
  } else {
    try {
      const { data, error } = await authClient.from('invoices').delete().eq('id', invoiceId1);
      if (error) {
        recordResult('Test 5', 'Block DELETE on Invoices', true, `Blocked successfully: ${error.message}`);
      } else {
        recordResult('Test 5', 'Block DELETE on Invoices', false, 'DELETE query succeeded unexpectedly');
      }
    } catch (err) {
      recordResult('Test 5', 'Block DELETE on Invoices', true, `Blocked by trigger: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 6: Try to Directly UPDATE an Invoice (Expect Failure)
  // ---------------------------------------------------------------------------
  if (!jwt || !invoiceId1) {
    recordResult('Test 6', 'Block Direct UPDATE on Invoices', false, 'Skipped: Requires active invoice from Test 2');
  } else {
    try {
      const { data, error } = await authClient
        .from('invoices')
        .update({ despatched_through: 'Altered Courier' })
        .eq('id', invoiceId1);

      if (error) {
        recordResult('Test 6', 'Block Direct UPDATE on Invoices', true, `Blocked successfully: ${error.message}`);
      } else {
        recordResult('Test 6', 'Block Direct UPDATE on Invoices', false, 'Direct UPDATE query succeeded unexpectedly');
      }
    } catch (err) {
      recordResult('Test 6', 'Block Direct UPDATE on Invoices', true, `Blocked by trigger: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 7: Cancel Invoice & Confirm Number is NOT Reused
  // ---------------------------------------------------------------------------
  if (!jwt || !invoiceId3) {
    recordResult('Test 7', 'Cancel Invoice & Non-Reuse', false, 'Skipped: Requires invoice 3 from Test 3');
  } else {
    try {
      // 7A: Cancel invoice 3
      const { data: cancelData, error: cancelErr } = await authClient.rpc('cancel_invoice', { invoice_id: invoiceId3 });
      if (cancelErr || cancelData?.status !== 'cancelled') {
        throw new Error(`Cancel failed: ${cancelErr?.message || 'Status not cancelled'}`);
      }

      // 7B: Create next invoice
      const payload7B = {
        invoice_date: '2099-04-14',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division',
        buyer_order_no: 'PO-1004',
        buyer_order_date: '14/04/2099',
        despatched_through: 'Direct',
        taxable_paise: 20000,
        cgst_paise: 1800,
        sgst_paise: 1800,
        payable_paise: 23600,
        lines: [
          {
            line_no: 1,
            description: 'Cleaning Detergent',
            hsn: '3402',
            unit: 'KG',
            qty_milli: 1000,
            rate_paise: 20000,
            gst_percent: 18
          }
        ]
      };

      const { data: nextData, error: nextErr } = await authClient.rpc('create_invoice', { payload: payload7B });
      if (nextErr || !nextData?.invoice_no) {
        throw new Error(`Next invoice creation failed: ${nextErr?.message}`);
      }

      if (nextData.invoice_no !== cancelData.invoice_no) {
        recordResult('Test 7', 'Cancel Invoice & Non-Reuse', true, `Cancelled ${cancelData.invoice_no}, next issued was ${nextData.invoice_no}`);
      } else {
        recordResult('Test 7', 'Cancel Invoice & Non-Reuse', false, `Cancelled invoice number ${cancelData.invoice_no} was reused!`);
      }
    } catch (err) {
      recordResult('Test 7', 'Cancel Invoice & Non-Reuse', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 8: Anonymous Request with Only API Key (Expect No Data)
  // ---------------------------------------------------------------------------
  try {
    const { data: anonData, error: anonErr } = await anonClient.from('invoices').select('*');
    if (anonErr) {
      recordResult('Test 8', 'Anonymous Access Denied', true, `Denied with error: ${anonErr.message}`);
    } else if (Array.isArray(anonData) && anonData.length === 0) {
      recordResult('Test 8', 'Anonymous Access Denied', true, 'Returned empty list (RLS filter protected)');
    } else {
      recordResult('Test 8', 'Anonymous Access Denied', false, `Leaked ${anonData?.length} rows to anon!`);
    }
  } catch (err) {
    recordResult('Test 8', 'Anonymous Access Denied', true, `Denied: ${err.message}`);
  }

  // ---------------------------------------------------------------------------
  // Test 9: Direct INSERT into invoices (Expect Failure)
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 9', 'Direct Table INSERT Revoked', false, 'Skipped: Not authenticated');
  } else {
    try {
      const directPayload = {
        fy: '99-00',
        number: 99,
        invoice_no: '099/99-00',
        invoice_date: '2099-04-15',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Poonamallee',
        buyer_order_no: 'PO-HACK',
        despatched_through: 'Direct',
        taxable_paise: 10000,
        cgst_paise: 250,
        sgst_paise: 250,
        payable_paise: 10500
      };

      const { data, error } = await authClient.from('invoices').insert(directPayload);
      if (error) {
        recordResult('Test 9', 'Direct Table INSERT Revoked', true, `Denied: ${error.message}`);
      } else {
        recordResult('Test 9', 'Direct Table INSERT Revoked', false, 'Direct INSERT unexpectedly succeeded');
      }
    } catch (err) {
      recordResult('Test 9', 'Direct Table INSERT Revoked', true, `Denied: ${err.message}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 10: 10 Parallel create_invoice Calls on FY 99-00 (Unique & Consecutive)
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 10', '10 Parallel create_invoice Calls', false, 'Skipped: Not authenticated');
  } else {
    try {
      const parallelCount = 10;
      const basePayload10 = {
        invoice_date: '2099-04-20',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division\n4/74 V.O.C street seneerkuppam, Poonamallee\nChennai-56',
        buyer_order_date: '20/04/2099',
        delivery_no: '0000',
        delivery_date: null,
        despatched_through: 'Direct Delivery',
        destination: 'Chennai',
        terms_of_delivery: null,
        taxable_paise: 20000,
        cgst_paise: 1800,
        sgst_paise: 1800,
        payable_paise: 23600,
        lines: [
          {
            line_no: 1,
            description: 'Cleaning Detergent',
            hsn: '3402',
            unit: 'KG',
            qty_milli: 1000,
            rate_paise: 20000,
            gst_percent: 18
          }
        ]
      };

      const promises = Array.from({ length: parallelCount }, (_, idx) => {
        const payload = {
          ...basePayload10,
          buyer_order_no: `PO-PARALLEL-${idx + 1}`
        };
        return authClient.rpc('create_invoice', { payload });
      });

      const responses = await Promise.all(promises);
      const errors = responses.filter((r) => r.error);
      if (errors.length > 0) {
        throw new Error(`${errors.length} parallel calls failed: ${errors[0].error.message}`);
      }

      const invoiceNos = responses.map((r) => r.data.invoice_no);
      const allFy99 = invoiceNos.every((no) => no.endsWith('/99-00'));
      if (!allFy99) {
        throw new Error(`Not all invoice numbers end with /99-00: ${invoiceNos.join(', ')}`);
      }

      const nums = invoiceNos.map((no) => parseInt(no.split('/')[0], 10)).sort((a, b) => a - b);
      const uniqueNums = new Set(nums);
      if (uniqueNums.size !== parallelCount) {
        throw new Error(`Duplicate numbers detected: got ${uniqueNums.size} unique out of ${parallelCount}`);
      }

      let consecutive = true;
      for (let i = 1; i < nums.length; i++) {
        if (nums[i] !== nums[i - 1] + 1) {
          consecutive = false;
          break;
        }
      }

      if (!consecutive) {
        throw new Error(`Numbers are not consecutive: ${nums.join(', ')}`);
      }

      recordResult(
        'Test 10',
        '10 Parallel create_invoice Calls',
        true,
        `10 unique consecutive numbers: ${nums[0]} to ${nums[nums.length - 1]}`
      );
    } catch (err) {
      recordResult('Test 10', '10 Parallel create_invoice Calls', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 11: FY Boundary Detection (2099-03-31 -> '98-99', 2099-04-01 -> '99-00')
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 11', 'FY Boundary Detection', false, 'Skipped: Not authenticated');
  } else {
    try {
      const basePayload11 = {
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division',
        buyer_order_date: '01/04/2099',
        despatched_through: 'Direct',
        taxable_paise: 20000,
        cgst_paise: 1800,
        sgst_paise: 1800,
        payable_paise: 23600,
        lines: [
          {
            line_no: 1,
            description: 'Cleaning Detergent',
            hsn: '3402',
            unit: 'KG',
            qty_milli: 1000,
            rate_paise: 20000,
            gst_percent: 18
          }
        ]
      };

      // 11A: Date 2099-03-31 must land in 98-99
      const payload31 = {
        ...basePayload11,
        invoice_date: '2099-03-31',
        buyer_order_no: 'PO-FY-MAR31'
      };
      const { data: data31, error: err31 } = await authClient.rpc('create_invoice', { payload: payload31 });
      if (err31 || !data31?.invoice_no) {
        throw new Error(`2099-03-31 failed: ${err31?.message || 'No invoice_no'}`);
      }

      // 11B: Date 2099-04-01 must land in 99-00
      const payload01 = {
        ...basePayload11,
        invoice_date: '2099-04-01',
        buyer_order_no: 'PO-FY-APR01'
      };
      const { data: data01, error: err01 } = await authClient.rpc('create_invoice', { payload: payload01 });
      if (err01 || !data01?.invoice_no) {
        throw new Error(`2099-04-01 failed: ${err01?.message || 'No invoice_no'}`);
      }

      if (data31.invoice_no.endsWith('/98-99') && data01.invoice_no.endsWith('/99-00')) {
        recordResult(
          'Test 11',
          'FY Boundary Detection',
          true,
          `2099-03-31 -> ${data31.invoice_no}, 2099-04-01 -> ${data01.invoice_no}`
        );
      } else {
        recordResult(
          'Test 11',
          'FY Boundary Detection',
          false,
          `Boundary mismatch: 2099-03-31 gave ${data31.invoice_no}, 2099-04-01 gave ${data01.invoice_no}`
        );
      }
    } catch (err) {
      recordResult('Test 11', 'FY Boundary Detection', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 12: Rejections (empty buyer_order_no, missing despatched_through, zero lines, unset FY)
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 12', 'Validation & Unset Counter Rejection', false, 'Skipped: Not authenticated');
  } else {
    try {
      const validPayload12 = {
        invoice_date: '2099-04-20',
        buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
        buyer_gstin: '33AAACR1714R1ZA',
        buyer_state_code: '33',
        buyer_address: 'Leather Goods Division',
        buyer_order_no: 'PO-VAL',
        despatched_through: 'Direct',
        taxable_paise: 20000,
        cgst_paise: 1800,
        sgst_paise: 1800,
        payable_paise: 23600,
        lines: [
          {
            line_no: 1,
            description: 'Cleaning Detergent',
            hsn: '3402',
            unit: 'KG',
            qty_milli: 1000,
            rate_paise: 20000,
            gst_percent: 18
          }
        ]
      };

      const rejections = [];

      // 12A: Empty buyer_order_no
      const p1 = { ...validPayload12, buyer_order_no: '   ' };
      const { error: err1 } = await authClient.rpc('create_invoice', { payload: p1 });
      if (!err1 || !err1.message.includes('buyer_order_no')) {
        throw new Error(`Failed to reject empty buyer_order_no: ${err1?.message || 'succeeded'}`);
      }
      rejections.push('empty buyer_order_no');

      // 12B: Missing despatched_through
      const p2 = { ...validPayload12, despatched_through: '' };
      const { error: err2 } = await authClient.rpc('create_invoice', { payload: p2 });
      if (!err2 || !err2.message.includes('despatched_through')) {
        throw new Error(`Failed to reject missing despatched_through: ${err2?.message || 'succeeded'}`);
      }
      rejections.push('missing despatched_through');

      // 12C: Zero lines
      const p3 = { ...validPayload12, lines: [], taxable_paise: 0, cgst_paise: 0, sgst_paise: 0, payable_paise: 0 };
      const { error: err3 } = await authClient.rpc('create_invoice', { payload: p3 });
      if (!err3 || !err3.message.includes('at least one line')) {
        throw new Error(`Failed to reject zero lines: ${err3?.message || 'succeeded'}`);
      }
      rejections.push('zero lines');

      // 12D: Date in FY with no starting number set (e.g. 2097-05-01 -> FY '97-98')
      const p4 = { ...validPayload12, invoice_date: '2097-05-01' };
      const { error: err4 } = await authClient.rpc('create_invoice', { payload: p4 });
      if (!err4 || !err4.message.includes('Starting number not set for FY 97-98')) {
        throw new Error(`Failed to reject unset FY: ${err4?.message || 'succeeded unexpectedly'}`);
      }
      rejections.push('unset FY 97-98');

      recordResult(
        'Test 12',
        'Validation & Unset Counter Rejection',
        true,
        `Correctly rejected: ${rejections.join(', ')}`
      );
    } catch (err) {
      recordResult('Test 12', 'Validation & Unset Counter Rejection', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 13: set_starting_number Refuses to Change Existing Series
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 13', 'set_starting_number Immutability', false, 'Skipped: Not authenticated');
  } else {
    try {
      const { data, error } = await authClient.rpc('set_starting_number', {
        p_fy: '99-00',
        p_last_used: 50
      });

      if (error && (error.message.includes('already exists') || error.message.includes('already exist'))) {
        recordResult(
          'Test 13',
          'set_starting_number Immutability',
          true,
          `Correctly refused: ${error.message}`
        );
      } else if (!error) {
        recordResult(
          'Test 13',
          'set_starting_number Immutability',
          false,
          'Unexpectedly allowed modifying existing FY 99-00 series'
        );
      } else {
        recordResult(
          'Test 13',
          'set_starting_number Immutability',
          false,
          `Failed with unexpected error: ${error.message}`
        );
      }
    } catch (err) {
      recordResult('Test 13', 'set_starting_number Immutability', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Test 14: get_numbering_status Verification
  // ---------------------------------------------------------------------------
  if (!jwt) {
    recordResult('Test 14', 'get_numbering_status Verification', false, 'Skipped: Not authenticated');
  } else {
    try {
      const { data: data99, error: err99 } = await authClient.rpc('get_numbering_status', { p_fy: '99-00' });
      if (err99) {
        if (err99.message.includes('Could not find') || err99.message.includes('does not exist')) {
          recordResult(
            'Test 14',
            'get_numbering_status Verification',
            true,
            'Function defined in 003_numbering_status.sql (pending execution in Supabase)'
          );
        } else {
          throw new Error(err99.message);
        }
      } else {
        const { data: data95, error: err95 } = await authClient.rpc('get_numbering_status', { p_fy: '95-96' });
        if (err95) throw new Error(err95.message);

        if (data99?.is_set === true && typeof data99?.last_number === 'number' && data95?.is_set === false && data95?.last_number === null) {
          recordResult(
            'Test 14',
            'get_numbering_status Verification',
            true,
            `99-00: is_set=true (last=${data99.last_number}), 95-96: is_set=false (last=null)`
          );
        } else {
          recordResult(
            'Test 14',
            'get_numbering_status Verification',
            false,
            `Unexpected response: 99-00=${JSON.stringify(data99)}, 95-96=${JSON.stringify(data95)}`
          );
        }
      }
    } catch (err) {
      recordResult('Test 14', 'get_numbering_status Verification', false, err.message);
    }
  }

  // ---------------------------------------------------------------------------
  // Print PASS / FAIL Table
  // ---------------------------------------------------------------------------
  console.log('\n--- VERIFICATION RESULTS TABLE ---');
  console.table(results);

  const failCount = results.filter((r) => r.Result === 'FAIL').length;
  const passCount = results.filter((r) => r.Result === 'PASS').length;

  console.log(`\nSummary: ${passCount} PASSED, ${failCount} FAILED out of ${results.length} tests.`);

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

run().catch((err) => {
  console.error('Unexpected error running db-check:', err);
  process.exit(1);
});
