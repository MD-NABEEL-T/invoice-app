import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

// 1. Read environment variables from .env.local or process.env
function loadEnv() {
  const env = { ...process.env };
  const envPath = path.join(rootDir, '.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
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
        if (!env[key]) env[key] = val;
      }
    }
  }
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_SUPABASE_URL || 'https://rgphmteuhxxkqnoharvz.supabase.co';
const SUPABASE_KEY = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-rJWi_MtK66PVNOoacl1_g_qKSUBEIh';

const VAPID_PUBLIC_KEY =
  env.VAPID_PUBLIC_KEY ||
  'BP6nRYXoL5a-C6UYDP0aZsCRIlPq9J6NemBODwKZIozvuia0R7Q2dpUdnQXD8Z79N5m_EE1z_8TIqhJ-2p4NsKU';
const VAPID_PRIVATE_KEY =
  env.VAPID_PRIVATE_KEY || 'GHx8v6-RcW8vcFKKfsdevjNLzNQOjfN_O4BB4k-H6bM';

webpush.setVapidDetails(
  'mailto:mohammedafzalarni@yahoo.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function runDailySalesCheck() {
  const isForceNotify = process.argv.includes('--force-notify');

  // Compute today's date in Indian Standard Time (IST, UTC+05:30)
  const now = new Date();
  const istFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const todayIst = istFormatter.format(now); // e.g. "2026-11-04"

  console.log(`[Daily 10 PM Check] Running check for date (IST): ${todayIst} at ${now.toISOString()}`);

  // Query Supabase for active invoices created today
  const { data: bills, error: billsError } = await supabase
    .from('invoices')
    .select('id, invoice_no, invoice_date, payable_paise, status')
    .eq('invoice_date', todayIst)
    .neq('status', 'cancelled');

  if (billsError) {
    console.error('[Daily 10 PM Check] Error querying Supabase invoices:', billsError.message);
  }

  const billsTodayCount = bills ? bills.length : 0;
  console.log(`[Daily 10 PM Check] Active bills recorded today (${todayIst}): ${billsTodayCount}`);

  if (billsTodayCount > 0 && !isForceNotify) {
    console.log('[Daily 10 PM Check] ✓ Bills were created today. No reminder needed. Database ping successful!');
    return;
  }

  // 0 bills today: trigger notifications!
  console.log('[Daily 10 PM Check] ⚠️ 0 bills found today. Preparing "No sales today? ,no bills created" notification...');

  const notificationPayload = JSON.stringify({
    title: 'No sales today? ,no bills created',
    body: `Reminder: No bills have been recorded yet for today (${todayIst}). Tap to open Khansa Invoices and create a bill.`,
    url: '/new',
    tag: 'khansa-daily-no-sales',
  });

  // 1. Send Web Push to all registered devices
  let pushSuccessCount = 0;
  try {
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (subError) {
      console.warn('[Daily 10 PM Check] Note on push_subscriptions table:', subError.message);
    } else if (subscriptions && subscriptions.length > 0) {
      console.log(`[Daily 10 PM Check] Found ${subscriptions.length} registered push subscription(s). Dispatching Web Push...`);

      for (const sub of subscriptions) {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notificationPayload);
          pushSuccessCount++;
          console.log(`[Daily 10 PM Check] ✓ Push delivered successfully to endpoint: ${sub.endpoint.slice(0, 45)}...`);
        } catch (pushErr) {
          console.warn(`[Daily 10 PM Check] Push delivery error: ${pushErr.statusCode || pushErr.message}`);
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            // Subscription has expired or user unsubscribed, delete from DB
            console.log(`[Daily 10 PM Check] Cleaning up expired subscription ID: ${sub.id}`);
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    } else {
      console.log('[Daily 10 PM Check] No push subscriptions currently in database.');
    }
  } catch (err) {
    console.warn('[Daily 10 PM Check] Push dispatch notice:', err.message);
  }

  // 2. Send Email via Google Apps Script Webhook if configured in app_settings, env, or default
  let webhookUrl =
    env.GSHEET_WEBHOOK_URL ||
    env.VITE_EMAIL_WEBHOOK_URL ||
    'https://script.google.com/macros/s/AKfycbwJaT3E_wJbsFgkvBUtc3sH2Lz_kEk3I3fJZNChOaXa46GqGLaNJIXrMn8HaJTSzioJ/exec';
  try {
    const { data: settingRow } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'khansa_gsheet_webhook_url')
      .maybeSingle();

    if (settingRow?.value) {
      webhookUrl = settingRow.value;
    }
  } catch (err) {
    // ignore
  }

  if (webhookUrl) {
    console.log('[Daily 10 PM Check] Dispatched email reminder via Google Apps Script webhook...');
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          isDailyReminder: true,
          action: 'Daily Sales Alert',
          date: todayIst,
          email_to: 'khansaenterprises19@gmail.com',
          subject: 'No sales today? ,no bills created',
        }),
      });
      console.log('[Daily 10 PM Check] ✓ Email reminder dispatched via webhook successfully!');
    } catch (whErr) {
      console.warn('[Daily 10 PM Check] Webhook delivery note:', whErr.message);
    }
  }

  console.log(`[Daily 10 PM Check] Done! Notifications dispatched: ${pushSuccessCount} push, webhook: ${webhookUrl ? 'yes' : 'none'}. Database active.`);
}

runDailySalesCheck().catch((err) => {
  console.error('[Daily 10 PM Check] Fatal error:', err);
  process.exit(1);
});
