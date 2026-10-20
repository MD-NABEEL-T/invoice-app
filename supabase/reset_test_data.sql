-- =============================================================================
-- !!! LOUD WARNING: USE ONLY TO CLEAR TEST DATA, NEVER AFTER GO-LIVE !!!
-- =============================================================================
-- This script truncates invoice_lines, invoices, and counters.
-- It is designed solely for resetting the test suites ('98-99' and '99-00').
--
-- SAFETY GUARD:
-- This script will abort immediately with a fatal exception if ANY invoice or
-- counter exists for any financial year other than ('98-99', '99-00').
-- =============================================================================

DO $$
DECLARE
    v_live_invoice_count int;
    v_live_counter_count int;
BEGIN
    -- Guard 1: Verify no non-test invoices exist
    SELECT COUNT(*)
    INTO v_live_invoice_count
    FROM public.invoices
    WHERE fy NOT IN ('98-99', '99-00');

    IF v_live_invoice_count > 0 THEN
        RAISE EXCEPTION 'SAFETY GUARD TRIGGERED: % live invoice(s) found with fy NOT IN (''98-99'', ''99-00''). Truncate aborted to protect production data!', v_live_invoice_count;
    END IF;

    -- Guard 2: Verify no non-test counters exist
    SELECT COUNT(*)
    INTO v_live_counter_count
    FROM public.counters
    WHERE fy NOT IN ('98-99', '99-00');

    IF v_live_counter_count > 0 THEN
        RAISE EXCEPTION 'SAFETY GUARD TRIGGERED: % live counter(s) found with fy NOT IN (''98-99'', ''99-00''). Truncate aborted to protect production data!', v_live_counter_count;
    END IF;

    -- Safe to truncate: clears invoice_lines (via CASCADE or explicit), invoices, and counters
    TRUNCATE TABLE public.invoice_lines, public.invoices, public.counters RESTART IDENTITY CASCADE;

    RAISE NOTICE 'Test data for fy (''98-99'', ''99-00'') has been safely cleared.';
END $$;
