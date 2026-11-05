import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY is not defined in environment.');
}

// In single-tenant public access mode, purge any legacy auth tokens
// left in localStorage from previous login phases so "JWT expired" never occurs.
if (typeof window !== 'undefined' && window.localStorage) {
  try {
    Object.keys(window.localStorage).forEach((key) => {
      if (key.startsWith('sb-') && (key.endsWith('-auth-token') || key.includes('auth'))) {
        window.localStorage.removeItem(key);
      }
    });
  } catch {
    // Ignore storage access errors in private browsing
  }
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
