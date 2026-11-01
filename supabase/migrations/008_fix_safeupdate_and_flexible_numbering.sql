-- =============================================================================
-- Migration 008: Fix safeupdate WHERE clause error & flexible bill numbering
-- =============================================================================

-- 1. Fix create_invoice: Add WHERE true to DELETE FROM _tmp_lines to satisfy pg_safeupdate
CREATE OR REPLACE FUNCTION public.create_invoice(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_invoice_id uuid;
    v_invoice_date date;
    v_invoice_no text;
    v_buyer_order_no text;
    v_buyer_order_date text;
    v_delivery_no text;
    v_delivery_date date;
    v_despatched_through text;
    v_destination text;
    v_terms_of_delivery text;
    v_buyer_id uuid;
    v_buyer_name text;
    v_buyer_gstin text;
    v_buyer_state_code text;
    v_buyer_address text;
    v_lines jsonb;
    v_line_count int;
    v_fy text;
    v_year int;
    v_month int;
    v_start_year int;
    v_end_year int;
    v_next_number int;
    v_calc_taxable bigint := 0;
    v_calc_cgst bigint := 0;
    v_calc_sgst bigint := 0;
    v_calc_payable bigint := 0;
    v_client_taxable bigint;
    v_client_cgst bigint;
    v_client_sgst bigint;
    v_client_payable bigint;
    v_line_idx int := 1;
    v_l record;
    v_rate_group record;
BEGIN
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

    v_lines := COALESCE(payload->'lines', '[]'::jsonb);
    v_line_count := jsonb_array_length(v_lines);
    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'At least one line item is required';
    END IF;

    -- Financial year calculation
    v_year := EXTRACT(YEAR FROM v_invoice_date)::int;
    v_month := EXTRACT(MONTH FROM v_invoice_date)::int;
    IF v_month >= 4 THEN
        v_start_year := v_year;
        v_end_year := v_year + 1;
    ELSE
        v_start_year := v_year - 1;
        v_end_year := v_year;
    END IF;
    v_fy := to_char(v_start_year % 100, 'fm00') || '-' || to_char(v_end_year % 100, 'fm00');

    -- Atomic sequential numbering via counters row lock (create counter row if absent)
    INSERT INTO public.counters (fy, last_number)
    VALUES (v_fy, 0)
    ON CONFLICT (fy) DO NOTHING;

    SELECT last_number + 1 INTO v_next_number
    FROM public.counters
    WHERE fy = v_fy
    FOR UPDATE;

    UPDATE public.counters
    SET last_number = v_next_number
    WHERE fy = v_fy;

    v_invoice_no := to_char(v_next_number, 'fm000') || '/' || v_fy;

    -- Compute line totals & tax
    CREATE TEMP TABLE IF NOT EXISTS _tmp_lines (
        item_id uuid,
        description text,
        hsn text,
        gst_rate numeric(5,2),
        quantity numeric(12,3),
        unit text,
        rate_paise bigint,
        taxable_value_paise bigint
    ) ON COMMIT DROP;
    -- Explicit WHERE true prevents safeupdate 'DELETE requires a WHERE clause' errors
    DELETE FROM _tmp_lines WHERE true;

    FOR v_l IN SELECT * FROM jsonb_to_recordset(v_lines) AS (
        item_id uuid,
        description text,
        hsn text,
        gst_rate numeric,
        quantity numeric,
        unit text,
        rate_paise bigint,
        ratePaise bigint
    )
    LOOP
        DECLARE
            v_line_rate_paise bigint := COALESCE(v_l.rate_paise, v_l.ratePaise);
            v_line_taxable bigint;
        BEGIN
            IF v_l.description IS NULL OR btrim(v_l.description) = '' THEN
                RAISE EXCEPTION 'Line % description is required', v_line_idx;
            END IF;
            IF v_l.quantity IS NULL OR v_l.quantity <= 0 THEN
                RAISE EXCEPTION 'Line % quantity must be greater than zero', v_line_idx;
            END IF;
            IF v_line_rate_paise IS NULL OR v_line_rate_paise <= 0 THEN
                RAISE EXCEPTION 'Line % rate must be greater than zero', v_line_idx;
            END IF;
            IF v_l.unit IS NULL OR btrim(v_l.unit) = '' THEN
                RAISE EXCEPTION 'Line % unit is required', v_line_idx;
            END IF;

            v_line_taxable := ROUND(v_l.quantity * v_line_rate_paise)::bigint;

            INSERT INTO _tmp_lines VALUES (
                v_l.item_id,
                v_l.description,
                v_l.hsn,
                v_l.gst_rate,
                v_l.quantity,
                v_l.unit,
                v_line_rate_paise,
                v_line_taxable
            );
            v_line_idx := v_line_idx + 1;
        END;
    END LOOP;

    -- Aggregate taxable value
    SELECT COALESCE(SUM(taxable_value_paise), 0) INTO v_calc_taxable FROM _tmp_lines WHERE true;

    -- Aggregate GST per rate group
    FOR v_rate_group IN
        SELECT
            gst_rate,
            COALESCE(SUM(taxable_value_paise), 0) AS group_taxable
        FROM _tmp_lines
        WHERE true
        GROUP BY gst_rate
    LOOP
        DECLARE
            v_half_rate numeric(5,2);
            v_group_cgst bigint;
            v_group_sgst bigint;
        BEGIN
            v_half_rate := (v_rate_group.gst_rate / 2.0);
            v_group_cgst := ROUND((v_rate_group.group_taxable * v_half_rate) / 100.0)::bigint;
            v_group_sgst := ROUND((v_rate_group.group_taxable * v_half_rate) / 100.0)::bigint;
            v_calc_cgst := v_calc_cgst + v_group_cgst;
            v_calc_sgst := v_calc_sgst + v_group_sgst;
        END;
    END LOOP;

    v_calc_payable := v_calc_taxable + v_calc_cgst + v_calc_sgst;

    -- Insert invoice
    INSERT INTO public.invoices (
        invoice_no,
        invoice_date,
        fy,
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
        taxable_value_paise,
        cgst_paise,
        sgst_paise,
        total_payable_paise,
        status
    ) VALUES (
        v_invoice_no,
        v_invoice_date,
        v_fy,
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
        v_calc_taxable,
        v_calc_cgst,
        v_calc_sgst,
        v_calc_payable,
        'final'
    ) RETURNING id INTO v_invoice_id;

    -- Insert invoice lines
    INSERT INTO public.invoice_lines (
        invoice_id,
        line_no,
        item_id,
        description,
        hsn,
        gst_rate,
        quantity,
        unit,
        rate_paise,
        taxable_value_paise
    )
    SELECT
        v_invoice_id,
        row_number() OVER (),
        item_id,
        description,
        hsn,
        gst_rate,
        quantity,
        unit,
        rate_paise,
        taxable_value_paise
    FROM _tmp_lines
    WHERE true;

    RETURN jsonb_build_object(
        'id', v_invoice_id,
        'invoice_no', v_invoice_no,
        'fy', v_fy,
        'taxable_value_paise', v_calc_taxable,
        'cgst_paise', v_calc_cgst,
        'sgst_paise', v_calc_sgst,
        'total_payable_paise', v_calc_payable,
        'status', 'final'
    );
END;
$$;

-- 2. Fix update_invoice: Add WHERE true to DELETE FROM _tmp_update_lines
CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_existing public.invoices%ROWTYPE;
    v_invoice_date date;
    v_buyer_order_no text;
    v_buyer_order_date text;
    v_delivery_no text;
    v_delivery_date date;
    v_despatched_through text;
    v_destination text;
    v_terms_of_delivery text;
    v_buyer_id uuid;
    v_buyer_name text;
    v_buyer_gstin text;
    v_buyer_state_code text;
    v_buyer_address text;
    v_lines jsonb;
    v_line_count int;
    v_calc_taxable bigint := 0;
    v_calc_cgst bigint := 0;
    v_calc_sgst bigint := 0;
    v_calc_payable bigint := 0;
    v_line_idx int := 1;
    v_l record;
    v_rate_group record;
BEGIN
    SELECT * INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found', p_invoice_id;
    END IF;

    IF payload IS NULL THEN
        RAISE EXCEPTION 'Payload is required';
    END IF;

    v_invoice_date := COALESCE((payload->>'invoice_date')::date, (payload->>'invoiceDate')::date, v_existing.invoice_date);
    v_buyer_order_no := COALESCE(payload->>'buyer_order_no', payload->>'buyerOrderNo', v_existing.buyer_order_no);
    v_buyer_order_date := COALESCE(payload->>'buyer_order_date', payload->>'buyerOrderDate', v_existing.buyer_order_date);
    v_delivery_no := COALESCE(payload->>'delivery_no', payload->>'deliveryNo', v_existing.delivery_no);
    v_delivery_date := NULLIF(COALESCE(payload->>'delivery_date', payload->>'deliveryDate'), '')::date;
    v_despatched_through := COALESCE(payload->>'despatched_through', payload->>'despatchedThrough', v_existing.despatched_through);
    v_destination := COALESCE(payload->>'destination', payload->>'destination', v_existing.destination);
    v_terms_of_delivery := COALESCE(payload->>'terms_of_delivery', payload->>'termsOfDelivery', v_existing.terms_of_delivery);
    v_buyer_id := COALESCE(NULLIF(COALESCE(payload->>'buyer_id', payload->>'buyerId'), '')::uuid, v_existing.buyer_id);
    v_buyer_name := COALESCE(payload->>'buyer_name', payload->>'buyerName', v_existing.buyer_name);
    v_buyer_gstin := COALESCE(payload->>'buyer_gstin', payload->>'buyerGstin', v_existing.buyer_gstin);
    v_buyer_state_code := COALESCE(payload->>'buyer_state_code', payload->>'buyerStateCode', v_existing.buyer_state_code);
    v_buyer_address := COALESCE(payload->>'buyer_address', payload->>'buyerAddress', v_existing.buyer_address);

    v_lines := COALESCE(payload->'lines', '[]'::jsonb);
    v_line_count := jsonb_array_length(v_lines);
    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'At least one line item is required';
    END IF;

    CREATE TEMP TABLE IF NOT EXISTS _tmp_update_lines (
        item_id uuid,
        description text,
        hsn text,
        gst_rate numeric(5,2),
        quantity numeric(12,3),
        unit text,
        rate_paise bigint,
        taxable_value_paise bigint
    ) ON COMMIT DROP;
    -- Explicit WHERE true prevents safeupdate errors
    DELETE FROM _tmp_update_lines WHERE true;

    FOR v_l IN SELECT * FROM jsonb_to_recordset(v_lines) AS (
        item_id uuid,
        description text,
        hsn text,
        gst_rate numeric,
        quantity numeric,
        unit text,
        rate_paise bigint,
        ratePaise bigint
    )
    LOOP
        DECLARE
            v_line_rate_paise bigint := COALESCE(v_l.rate_paise, v_l.ratePaise);
            v_line_taxable bigint;
        BEGIN
            v_line_taxable := ROUND(v_l.quantity * v_line_rate_paise)::bigint;

            INSERT INTO _tmp_update_lines VALUES (
                v_l.item_id,
                v_l.description,
                v_l.hsn,
                v_l.gst_rate,
                v_l.quantity,
                v_l.unit,
                v_line_rate_paise,
                v_line_taxable
            );
            v_line_idx := v_line_idx + 1;
        END;
    END LOOP;

    SELECT COALESCE(SUM(taxable_value_paise), 0) INTO v_calc_taxable FROM _tmp_update_lines WHERE true;

    FOR v_rate_group IN
        SELECT
            gst_rate,
            COALESCE(SUM(taxable_value_paise), 0) AS group_taxable
        FROM _tmp_update_lines
        WHERE true
        GROUP BY gst_rate
    LOOP
        DECLARE
            v_half_rate numeric(5,2);
            v_group_cgst bigint;
            v_group_sgst bigint;
        BEGIN
            v_half_rate := (v_rate_group.gst_rate / 2.0);
            v_group_cgst := ROUND((v_rate_group.group_taxable * v_half_rate) / 100.0)::bigint;
            v_group_sgst := ROUND((v_rate_group.group_taxable * v_half_rate) / 100.0)::bigint;
            v_calc_cgst := v_calc_cgst + v_group_cgst;
            v_calc_sgst := v_calc_sgst + v_group_sgst;
        END;
    END LOOP;

    v_calc_payable := v_calc_taxable + v_calc_cgst + v_calc_sgst;

    UPDATE public.invoices SET
        invoice_date = v_invoice_date,
        buyer_id = v_buyer_id,
        buyer_name = v_buyer_name,
        buyer_gstin = v_buyer_gstin,
        buyer_state_code = v_buyer_state_code,
        buyer_address = v_buyer_address,
        buyer_order_no = v_buyer_order_no,
        buyer_order_date = v_buyer_order_date,
        delivery_no = v_delivery_no,
        delivery_date = v_delivery_date,
        despatched_through = v_despatched_through,
        destination = v_destination,
        terms_of_delivery = v_terms_of_delivery,
        taxable_value_paise = v_calc_taxable,
        cgst_paise = v_calc_cgst,
        sgst_paise = v_calc_sgst,
        total_payable_paise = v_calc_payable
    WHERE id = p_invoice_id;

    DELETE FROM public.invoice_lines WHERE invoice_id = p_invoice_id;

    INSERT INTO public.invoice_lines (
        invoice_id,
        line_no,
        item_id,
        description,
        hsn,
        gst_rate,
        quantity,
        unit,
        rate_paise,
        taxable_value_paise
    )
    SELECT
        p_invoice_id,
        row_number() OVER (),
        item_id,
        description,
        hsn,
        gst_rate,
        quantity,
        unit,
        rate_paise,
        taxable_value_paise
    FROM _tmp_update_lines
    WHERE true;

    RETURN jsonb_build_object(
        'id', p_invoice_id,
        'invoice_no', v_existing.invoice_no,
        'fy', v_existing.fy,
        'taxable_value_paise', v_calc_taxable,
        'cgst_paise', v_calc_cgst,
        'sgst_paise', v_calc_sgst,
        'total_payable_paise', v_calc_payable,
        'status', v_existing.status
    );
END;
$$;

-- 3. Flexible starting number function (can be updated anytime!)
CREATE OR REPLACE FUNCTION public.set_invoice_counter(p_fy text, p_next_number int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_last_used int;
BEGIN
    IF p_fy IS NULL OR p_fy !~ '^[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid FY format. Expected format: 26-27';
    END IF;

    IF p_next_number < 1 THEN
        RAISE EXCEPTION 'Next bill number must be at least 1';
    END IF;

    v_last_used := p_next_number - 1;

    INSERT INTO public.counters (fy, last_number)
    VALUES (p_fy, v_last_used)
    ON CONFLICT (fy) DO UPDATE SET last_number = v_last_used;

    RETURN jsonb_build_object(
        'fy', p_fy,
        'next_number', p_next_number,
        'last_number', v_last_used,
        'formatted_next_bill', LPAD(p_next_number::text, 3, '0') || '/' || p_fy
    );
END;
$$;

-- Grant execution to anon and authenticated
GRANT EXECUTE ON FUNCTION public.create_invoice(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_invoice(uuid, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_invoice_counter(text, int) TO anon, authenticated;

