-- =============================================================================
-- Migration 010: Background Push Subscriptions and App Settings
-- Supports background Web Push notifications at 10:00 PM IST when app is closed.
-- =============================================================================

-- 1. Create push_subscriptions table
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Grant permissions to anon and authenticated
GRANT ALL ON public.push_subscriptions TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.push_subscriptions_id_seq TO anon, authenticated;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "anon_all_push_subscriptions" ON public.push_subscriptions
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_push_subscriptions" ON public.push_subscriptions;
CREATE POLICY "auth_all_push_subscriptions" ON public.push_subscriptions
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 2. Create app_settings table for shared settings (Webhook URL, notification prefs)
CREATE TABLE IF NOT EXISTS public.app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

GRANT ALL ON public.app_settings TO anon, authenticated;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all_app_settings" ON public.app_settings;
CREATE POLICY "anon_all_app_settings" ON public.app_settings
    FOR ALL TO anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "auth_all_app_settings" ON public.app_settings;
CREATE POLICY "auth_all_app_settings" ON public.app_settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
