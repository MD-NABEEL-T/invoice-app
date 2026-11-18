import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://rgphmteuhxxkqnoharvz.supabase.co';
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_-rJWi_MtK66PVNOoacl1_g_qKSUBEIh';

const VAPID_PUBLIC_KEY =
  process.env.VAPID_PUBLIC_KEY ||
  'BP6nRYXoL5a-C6UYDP0aZsCRIlPq9J6NemBODwKZIozvuia0R7Q2dpUdnQXD8Z79N5m_EE1z_8TIqhJ-2p4NsKU';
const VAPID_PRIVATE_KEY =
  process.env.VAPID_PRIVATE_KEY || 'GHx8v6-RcW8vcFKKfsdevjNLzNQOjfN_O4BB4k-H6bM';

webpush.setVapidDetails(
  'mailto:mohammedafzalarni@yahoo.com',
  VAPID_PUBLIC_KEY,
  VAPID_PRIVATE_KEY
);

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const isForce = req.query?.force === 'true' || req.body?.force === true;

    // Today in IST (Indian Standard Time, UTC+05:30)
    const istFormatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const todayIst = istFormatter.format(new Date());

    // 1. Query Supabase for active invoices created today
    const { data: bills, error: billsError } = await supabase
      .from('invoices')
      .select('id, invoice_no, invoice_date, status')
      .eq('invoice_date', todayIst)
      .neq('status', 'cancelled');

    if (billsError) {
      console.error('[API daily-sales-check] Error querying invoices:', billsError);
    }

    const billsTodayCount = bills ? bills.length : 0;

    if (billsTodayCount > 0 && !isForce) {
      return res.status(200).json({
        success: true,
        message: 'Active bills exist today. No reminder needed.',
        date: todayIst,
        billsTodayCount,
      });
    }

    // 0 bills today: trigger notifications!
    const notificationPayload = JSON.stringify({
      title: 'No sales today? ,no bills created',
      body: `Reminder: No bills have been recorded yet for today (${todayIst}). Tap to open Khansa Invoices and create a bill.`,
      url: '/new',
      tag: 'khansa-daily-no-sales',
    });

    let pushSuccessCount = 0;
    const { data: subscriptions, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*');

    if (!subError && subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth,
          },
        };

        try {
          await webpush.sendNotification(pushSubscription, notificationPayload, {
            TTL: 86400,
            urgency: 'high',
          });
          pushSuccessCount++;
        } catch (pushErr) {
          if (pushErr.statusCode === 404 || pushErr.statusCode === 410) {
            await supabase.from('push_subscriptions').delete().eq('id', sub.id);
          }
        }
      }
    }

    // Email alert via Apps Script webhook
    let webhookUrl =
      process.env.GSHEET_WEBHOOK_URL ||
      process.env.VITE_EMAIL_WEBHOOK_URL ||
      'https://script.google.com/macros/s/AKfycbwJaT3E_wJbsFgkvBUtc3sH2Lz_kEk3I3fJZNChOaXa46GqGLaNJIXrMn8HaJTSzioJ/exec';

    try {
      const { data: settingRow } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'khansa_gsheet_webhook_url')
        .maybeSingle();
      if (settingRow?.value) webhookUrl = settingRow.value;
    } catch {}

    const emailTo = process.env.NOTIFICATION_EMAIL || 'khansaenterprises19@gmail.com';
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'daily_sales_alert',
          date: todayIst,
          bills_count: 0,
          subject: `Daily Alert: No Bills Created Today (${todayIst})`,
          email_to: emailTo,
          body_text: `Khansa Invoices Daily Alert\n\nDate: ${todayIst}\nStatus: No sales / 0 bills created today as of 10:00 PM IST.\n\nPlease check Khansa Invoices: https://khansa-invoices.vercel.app/new`,
        }),
      });
    } catch (e) {
      console.warn('[API daily-sales-check] Webhook email failed:', e);
    }

    return res.status(200).json({
      success: true,
      date: todayIst,
      billsTodayCount,
      pushed: pushSuccessCount,
      totalSubscriptions: subscriptions?.length || 0,
    });
  } catch (err) {
    console.error('[API daily-sales-check] Exception:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
