-- =============================================================================
-- Migration 002: Hardening (Phase 2b)
-- 1. Add public.set_starting_number(p_fy, p_last_used) with immutability guards
-- 2. Update public.create_invoice(payload) to disallow auto-creating counters
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Function: set_starting_number(p_fy text, p_last_used int)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_starting_number(p_fy text, p_last_used int)
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

    -- Guard: counters row already exists
    IF EXISTS (SELECT 1 FROM public.counters WHERE fy = p_fy) THEN
        RAISE EXCEPTION 'Counters row already exists for FY %', p_fy;
    END IF;

    -- Guard: invoice already exists
    IF EXISTS (SELECT 1 FROM public.invoices WHERE fy = p_fy) THEN
        RAISE EXCEPTION 'Invoices already exist for FY %', p_fy;
    END IF;

    INSERT INTO public.counters (fy, last_number)
    VALUES (p_fy, p_last_used);

    RETURN jsonb_build_object(
        'fy', p_fy,
        'last_number', p_last_used
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_starting_number(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_starting_number(text, int) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. Function: create_invoice(payload jsonb)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_invoice(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_invoice_date date;
    v_year int;
    v_month int;
    v_start_year int;
    v_end_year int;
    v_fy text;
    v_next_number int;
    v_invoice_no text;
    v_invoice_id uuid;
    
    v_calc_taxable bigint := 0;
    v_calc_cgst bigint := 0;
    v_calc_sgst bigint := 0;
    v_calc_payable bigint := 0;
    
    v_client_taxable bigint;
    v_client_cgst bigint;
    v_client_sgst bigint;
    v_client_payable bigint;
    
    v_buyer_id uuid;
    v_buyer_name text;
    v_buyer_gstin text;
    v_buyer_state_code text;
    v_buyer_address text;
    v_buyer_order_no text;
    v_buyer_order_date text;
    v_delivery_no text;
    v_delivery_date date;
    v_despatched_through text;
    v_destination text;
    v_terms_of_delivery text;
    
    v_lines jsonb;
    v_line_count int;
BEGIN
    -- 1. Check user authentication
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    -- 2. Extract and validate required invoice headers
    IF payload IS NULL THEN
        RAISE EXCEPTION 'Payload is required';
    END IF;

    IF payload->>'invoice_date' IS NULL AND payload->>'invoiceDate' IS NULL THEN
        RAISE EXCEPTION 'invoice_date is required';
    END IF;
    v_invoice_date := (COALESCE(payload->>'invoice_date', payload->>'invoiceDate'))::date;

    v_buyer_order_no := COALESCE(payload->>'buyer_order_no', payload->>'buyerOrderNo');
    IF v_buyer_order_no IS NULL OR btrim(v_buyer_order_no) = '' THEN
        RAISE EXCEPTION 'buyer_order_no is required';
    END IF;

    v_despatched_through := COALESCE(payload->>'despatched_through', payload->>'despatchedThrough');
    IF v_despatched_through IS NULL OR btrim(v_despatched_through) = '' THEN
        RAISE EXCEPTION 'despatched_through is required';
    END IF;

    v_buyer_name := COALESCE(payload->>'buyer_name', payload->>'buyerName');
    IF v_buyer_name IS NULL OR btrim(v_buyer_name) = '' THEN
        RAISE EXCEPTION 'buyer_name is required';
    END IF;

    v_buyer_gstin := COALESCE(payload->>'buyer_gstin', payload->>'buyerGstin');
    IF v_buyer_gstin IS NULL OR btrim(v_buyer_gstin) = '' THEN
        RAISE EXCEPTION 'buyer_gstin is required';
    END IF;

    v_buyer_state_code := COALESCE(payload->>'buyer_state_code', payload->>'buyerStateCode');
    IF v_buyer_state_code IS NULL OR btrim(v_buyer_state_code) = '' THEN
        RAISE EXCEPTION 'buyer_state_code is required';
    END IF;

    v_buyer_address := COALESCE(payload->>'buyer_address', payload->>'buyerAddress');
    IF v_buyer_address IS NULL OR btrim(v_buyer_address) = '' THEN
        RAISE EXCEPTION 'buyer_address is required';
    END IF;

    v_buyer_id := NULLIF(COALESCE(payload->>'buyer_id', payload->>'buyerId'), '')::uuid;
    v_buyer_order_date := COALESCE(payload->>'buyer_order_date', payload->>'buyerOrderDate');
    v_delivery_no := COALESCE(payload->>'delivery_no', payload->>'deliveryNo');
    v_delivery_date := NULLIF(COALESCE(payload->>'delivery_date', payload->>'deliveryDate'), '')::date;
    v_destination := COALESCE(payload->>'destination', payload->>'destination');
    v_terms_of_delivery := COALESCE(payload->>'terms_of_delivery', payload->>'termsOfDelivery');

    -- Lines array validation
    v_lines := payload->'lines';
    IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' THEN
        RAISE EXCEPTION 'lines array is required';
    END IF;

    v_line_count := jsonb_array_length(v_lines);
    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'Invoice must contain at least one line';
    END IF;

    -- 3. Derive Financial Year (April 1 to March 31, e.g. '26-27')
    v_year := EXTRACT(YEAR FROM v_invoice_date)::int;
    v_month := EXTRACT(MONTH FROM v_invoice_date)::int;

    IF v_month >= 4 THEN
        v_start_year := v_year;
    ELSE
        v_start_year := v_year - 1;
    END IF;
    v_end_year := v_start_year + 1;
    v_fy := LPAD((v_start_year % 100)::text, 2, '0') || '-' || LPAD((v_end_year % 100)::text, 2, '0');

    -- 4. Calculate line amounts and taxes per rate group strictly matching tax.js:
    -- amount_paise = round((qty_milli * rate_paise) / 1000)
    -- group_tax_paise = round((group_taxable * gst_percent) / 100)
    -- cgst_paise = floor(group_tax_paise / 2), sgst_paise = group_tax_paise - cgst_paise
    WITH parsed_lines AS (
        SELECT
            ROUND((COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::numeric * COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::numeric) / 1000.0)::bigint AS amount_paise,
            COALESCE((l->>'gst_percent'), (l->>'gstPercent'))::numeric AS gst_percent
        FROM jsonb_array_elements(v_lines) AS l
    ),
    rate_groups AS (
        SELECT
            gst_percent,
            SUM(amount_paise)::bigint AS taxable_paise,
            ROUND((SUM(amount_paise)::numeric * gst_percent) / 100.0)::bigint AS group_tax_paise,
            FLOOR(ROUND((SUM(amount_paise)::numeric * gst_percent) / 100.0) / 2.0)::bigint AS cgst_paise,
            (ROUND((SUM(amount_paise)::numeric * gst_percent) / 100.0)::bigint - FLOOR(ROUND((SUM(amount_paise)::numeric * gst_percent) / 100.0) / 2.0)::bigint) AS sgst_paise
        FROM parsed_lines
        GROUP BY gst_percent
    )
    SELECT
        COALESCE(SUM(taxable_paise), 0)::bigint,
        COALESCE(SUM(cgst_paise), 0)::bigint,
        COALESCE(SUM(sgst_paise), 0)::bigint,
        COALESCE(SUM(taxable_paise + group_tax_paise), 0)::bigint
    INTO
        v_calc_taxable,
        v_calc_cgst,
        v_calc_sgst,
        v_calc_payable
    FROM rate_groups;

    -- 5. Compare computed totals against client totals
    v_client_taxable := COALESCE(payload->>'taxable_paise', payload->>'taxablePaise')::bigint;
    v_client_cgst := COALESCE(payload->>'cgst_paise', payload->>'cgstPaise')::bigint;
    v_client_sgst := COALESCE(payload->>'sgst_paise', payload->>'sgstPaise')::bigint;
    v_client_payable := COALESCE(payload->>'payable_paise', payload->>'payablePaise')::bigint;

    IF v_client_taxable IS DISTINCT FROM v_calc_taxable OR
       v_client_cgst IS DISTINCT FROM v_calc_cgst OR
       v_client_sgst IS DISTINCT FROM v_calc_sgst OR
       v_client_payable IS DISTINCT FROM v_calc_payable THEN
        RAISE EXCEPTION 'Invoice totals mismatch. Client sent: taxable=%, cgst=%, sgst=%, payable=%. Computed: taxable=%, cgst=%, sgst=%, payable=%',
            v_client_taxable, v_client_cgst, v_client_sgst, v_client_payable,
            v_calc_taxable, v_calc_cgst, v_calc_sgst, v_calc_payable;
    END IF;

    -- 6. Atomically lock and increment counter for this financial year
    SELECT last_number
    INTO v_next_number
    FROM public.counters
    WHERE fy = v_fy
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Starting number not set for FY %. Set it in Settings first.', v_fy;
    END IF;

    v_next_number := v_next_number + 1;

    UPDATE public.counters
    SET last_number = v_next_number
    WHERE fy = v_fy;

    v_invoice_no := LPAD(v_next_number::text, 3, '0') || '/' || v_fy;
    v_invoice_id := gen_random_uuid();

    -- 7. Insert the invoice snapshot record
    INSERT INTO public.invoices (
        id,
        fy,
        number,
        invoice_no,
        invoice_date,
        buyer_id,
        buyer_name,
        buyer_gstin,
        buyer_state_code,
        buyer_address,
        buyer_order_no,
        buyer_order_date,
        delivery_no,
        delivery_date,
        despatched_through,
        destination,
        terms_of_delivery,
        status,
        taxable_paise,
        cgst_paise,
        sgst_paise,
        payable_paise,
        created_at
    ) VALUES (
        v_invoice_id,
        v_fy,
        v_next_number,
        v_invoice_no,
        v_invoice_date,
        v_buyer_id,
        v_buyer_name,
        v_buyer_gstin,
        v_buyer_state_code,
        v_buyer_address,
        v_buyer_order_no,
        v_buyer_order_date,
        v_delivery_no,
        v_delivery_date,
        v_despatched_through,
        v_destination,
        v_terms_of_delivery,
        'final',
        v_calc_taxable,
        v_calc_cgst,
        v_calc_sgst,
        v_calc_payable,
        now()
    );

    -- 8. Insert snapshot lines
    INSERT INTO public.invoice_lines (
        invoice_id,
        line_no,
        description,
        hsn,
        unit,
        qty_milli,
        rate_paise,
        gst_percent,
        amount_paise
    )
    SELECT
        v_invoice_id,
        COALESCE((l->>'line_no'), (l->>'lineNo'), ord::text)::int,
        (l->>'description')::text,
        (l->>'hsn')::text,
        COALESCE((l->>'unit')::text, 'NOS'),
        COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::bigint,
        COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::bigint,
        COALESCE((l->>'gst_percent'), (l->>'gstPercent'))::numeric,
        ROUND((COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::numeric * COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::numeric) / 1000.0)::bigint
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS arr(l, ord);

    -- 9. Return invoice id and generated sequence invoice_no
    RETURN jsonb_build_object(
        'id', v_invoice_id,
        'invoice_no', v_invoice_no
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_invoice(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(jsonb) TO authenticated;
