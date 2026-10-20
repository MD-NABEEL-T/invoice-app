-- =============================================================================
-- Migration 003: Numbering Status (Phase 4)
-- Function: get_numbering_status(p_fy text)
-- Returns: jsonb { is_set: boolean, last_number: int | null }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_numbering_status(p_fy text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_last_number int;
BEGIN
    -- Auth guard
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    -- Format guard
    IF p_fy IS NULL OR p_fy !~ '^[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid FY format. Expected format like "26-27"';
    END IF;

    SELECT last_number
    INTO v_last_number
    FROM public.counters
    WHERE fy = p_fy;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'is_set', false,
            'last_number', NULL
        );
    ELSE
        RETURN jsonb_build_object(
            'is_set', true,
            'last_number', v_last_number
        );
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_numbering_status(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_numbering_status(text) TO authenticated;
