-- =============================================================================
-- Migration 007: Clean Mock Data & Initialize Real-Time Billing at 001/26-27
-- =============================================================================
-- Run this script in your Supabase SQL Editor to:
-- 1. Wipe all test/mock invoices and invoice lines.
-- 2. Clean out old test financial year counters (99-00, 98-99, 96-97).
-- 3. Set FY 26-27 counter to 0 (so your very next bill is 001/26-27!).
-- =============================================================================

-- 1. Wipe mock invoice lines and invoices
TRUNCATE TABLE public.invoice_lines CASCADE;
TRUNCATE TABLE public.invoices CASCADE;

-- 2. Reset counters cleanly
ALTER TABLE public.counters DISABLE TRIGGER trg_block_delete_counters;
DELETE FROM public.counters;
ALTER TABLE public.counters ENABLE TRIGGER trg_block_delete_counters;

-- 3. Initialize current FY 26-27 at 0 (Next invoice: 0 + 1 = 001/26-27)
INSERT INTO public.counters (fy, last_number)
VALUES ('26-27', 0)
ON CONFLICT (fy) DO UPDATE SET last_number = 0;
