-- =============================================================================
-- Migration 004: Change Starting Number (Phase 4b)
-- Function: public.change_starting_number(p_fy text, p_last_used int)
-- Allows modifying the starting number if and only if:
--   1. The counters row exists for that financial year
--   2. ZERO invoices exist for that financial year
-- =============================================================================

CREATE OR REPLACE FUNCTION public.change_starting_number(p_fy text, p_last_used int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    -- Format guard
    IF p_fy IS NULL OR p_fy !~ '^[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid FY format. Expected format like "26-27"';
    END IF;

    -- Starting number guard
    IF p_last_used IS NULL OR p_last_used < 0 THEN
        RAISE EXCEPTION 'Starting number (last_used) must be 0 or greater';
    END IF;

    -- Must raise unless a counters row exists for that fy
    IF NOT EXISTS (SELECT 1 FROM public.counters WHERE fy = p_fy) THEN
        RAISE EXCEPTION 'Counters row does not exist for FY %', p_fy;
    END IF;

    -- Must raise unless zero invoices exist for that fy
    IF EXISTS (SELECT 1 FROM public.invoices WHERE fy = p_fy) THEN
        RAISE EXCEPTION 'Cannot change starting number: invoices already exist for FY %', p_fy;
    END IF;

    -- Update last_number only
    UPDATE public.counters
    SET last_number = p_last_used
    WHERE fy = p_fy;

    RETURN jsonb_build_object(
        'fy', p_fy,
        'last_number', p_last_used
    );
END;
$$;

REVOKE ALL ON FUNCTION public.change_starting_number(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.change_starting_number(text, int) TO authenticated;
