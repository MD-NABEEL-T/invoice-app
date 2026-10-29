import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';

const AuthContext = createContext({
  session: null,
  user: null,
  loading: false,
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function initAuth() {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        if (existingSession) {
          if (mounted) {
            setSession(existingSession);
            setUser(existingSession.user);
            setLoading(false);
          }
          return;
        }

        // Transparent background authentication: sign in silently using app credentials
        const email = import.meta.env.VITE_APP_AUTH_EMAIL || 'test@example.com';
        const password = import.meta.env.VITE_APP_AUTH_PASSWORD || 'Test@12345';

        if (email && password) {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          if (!error && data?.session) {
            if (mounted) {
              setSession(data.session);
              setUser(data.user);
            }
          }
        }
      } catch (err) {
        console.warn('Silent auto-auth initialization error:', err);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (mounted) {
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      }
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white font-sans">
        <div className="w-14 h-14 rounded-2xl bg-blue-600 flex items-center justify-center font-black text-2xl text-white shadow-lg mb-4">
          K
        </div>
        <div className="w-8 h-8 border-3 border-blue-400/30 border-t-blue-500 rounded-full animate-spin"></div>
        <p className="mt-4 text-sm font-bold tracking-wide uppercase text-slate-300">
          Khansa Enterprises
        </p>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, user, loading: false }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
