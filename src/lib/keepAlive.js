import { supabase } from './supabase.js';

const LAST_PING_KEY = 'khansa_db_last_ping';

/**
 * Pings Supabase to prevent project from pausing on free tier.
 * Safe, idempotent, lightweight query.
 */
export async function pingDatabase() {
  try {
    const startTime = performance.now();
    const { data, error } = await supabase
      .from('counters')
      .select('fy')
      .limit(1);

    if (error) {
      console.warn('Keep-alive ping returned error:', error.message);
      return { success: false, error: error.message };
    }

    const durationMs = Math.round(performance.now() - startTime);
    const nowIso = new Date().toISOString();
    try {
      localStorage.setItem(LAST_PING_KEY, nowIso);
    } catch {
      // ignore localStorage quota error
    }

    return {
      success: true,
      timestamp: nowIso,
      durationMs,
      data,
    };
  } catch (err) {
    console.warn('Keep-alive ping exception:', err);
    return { success: false, error: err.message };
  }
}

export function getLastPingTimestamp() {
  try {
    return localStorage.getItem(LAST_PING_KEY);
  } catch {
    return null;
  }
}

/**
 * Initializes automatic background pinging (once per day or on app mount if stale).
 */
export function initKeepAlive() {
  const lastPing = getLastPingTimestamp();
  const oneDayMs = 24 * 60 * 60 * 1000;
  const shouldPingNow = !lastPing || (Date.now() - new Date(lastPing).getTime() > oneDayMs);

  if (shouldPingNow) {
    // Non-blocking ping
    setTimeout(() => {
      pingDatabase().catch(() => {});
    }, 2000);
  }
}

