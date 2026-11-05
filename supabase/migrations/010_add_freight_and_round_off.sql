-- Migration 010: Freight Charges, Rupee Round-Off, and Optional Buyer Order No
-- 1. Add freight_paise and round_off_paise columns to invoices table
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS freight_paise bigint DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS round_off_paise bigint DEFAULT 0;

-- 2. Make buyer_order_no optional in invoices table (default to empty string)
ALTER TABLE public.invoices ALTER COLUMN buyer_order_no DROP NOT NULL;
ALTER TABLE public.invoices ALTER COLUMN buyer_order_no SET DEFAULT '';

-- 3. Update create_invoice RPC to support freight_paise, round_off_paise, and optional buyer_order_no
CREATE OR REPLACE FUNCTION public.create_invoice(payload jsonb)
RETURNS public.invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer_id uuid;
    v_buyer_name text;
    v_buyer_gstin text;
    v_buyer_state_code text;
    v_buyer_address text;
    v_invoice_date date;
    v_buyer_order_no text;
    v_buyer_order_date text;
    v_delivery_no text;
    v_delivery_date date;
    v_despatched_through text;
    v_destination text;
    v_terms_of_delivery text;
    v_lines jsonb;
    v_year int;
    v_month int;
    v_start_year int;
    v_end_year int;
    v_fy text;
    v_calc_taxable bigint;
    v_calc_cgst bigint;
    v_calc_sgst bigint;
    v_calc_payable bigint;
    v_freight_paise bigint;
    v_round_off_paise bigint;
    v_next_number int;
    v_invoice_no text;
    v_invoice_id uuid;
    v_created_invoice public.invoices%ROWTYPE;
    v_line_count int;
BEGIN
    v_buyer_id := (payload->>'buyer_id')::uuid;
    v_buyer_name := btrim(COALESCE(payload->>'buyer_name', ''));
    v_buyer_gstin := btrim(COALESCE(payload->>'buyer_gstin', ''));
    v_buyer_state_code := btrim(COALESCE(payload->>'buyer_state_code', '33'));
    v_buyer_address := btrim(COALESCE(payload->>'buyer_address', ''));
    v_invoice_date := (payload->>'invoice_date')::date;
    v_buyer_order_no := btrim(COALESCE(payload->>'buyer_order_no', ''));
    v_buyer_order_date := NULLIF(btrim(COALESCE(payload->>'buyer_order_date', '')), '');
    v_delivery_no := NULLIF(btrim(COALESCE(payload->>'delivery_no', '')), '');
    v_delivery_date := (payload->>'delivery_date')::date;
    v_despatched_through := btrim(COALESCE(payload->>'despatched_through', ''));
    v_destination := NULLIF(btrim(COALESCE(payload->>'destination', '')), '');
    v_terms_of_delivery := NULLIF(btrim(COALESCE(payload->>'terms_of_delivery', '')), '');
    v_lines := payload->'lines';
    v_freight_paise := COALESCE((payload->>'freight_paise')::bigint, 0);

    IF v_buyer_name = '' THEN
        RAISE EXCEPTION 'buyer_name is required';
    END IF;
    IF v_buyer_address = '' THEN
        RAISE EXCEPTION 'buyer_address is required';
    END IF;
    IF v_invoice_date IS NULL THEN
        RAISE EXCEPTION 'invoice_date is required';
    END IF;
    IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' THEN
        RAISE EXCEPTION 'lines array is required';
    END IF;

    v_line_count := jsonb_array_length(v_lines);
    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'Invoice must contain at least one line';
    END IF;

    -- Financial Year
    v_year := EXTRACT(YEAR FROM v_invoice_date)::int;
    v_month := EXTRACT(MONTH FROM v_invoice_date)::int;
    IF v_month >= 4 THEN
        v_start_year := v_year;
    ELSE
        v_start_year := v_year - 1;
    END IF;
    v_end_year := v_start_year + 1;
    v_fy := LPAD((v_start_year % 100)::text, 2, '0') || '-' || LPAD((v_end_year % 100)::text, 2, '0');

    -- Calculate line amounts and taxes per rate group strictly using CTE
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
        COALESCE(SUM(sgst_paise), 0)::bigint
    INTO
        v_calc_taxable,
        v_calc_cgst,
        v_calc_sgst
    FROM rate_groups;

    -- Calculate payable with freight and round-off to nearest whole rupee
    v_calc_payable := v_calc_taxable + v_calc_cgst + v_calc_sgst + v_freight_paise;
    v_round_off_paise := (ROUND(v_calc_payable::numeric / 100.0) * 100)::bigint - v_calc_payable;
    v_calc_payable := v_calc_payable + v_round_off_paise;

    -- Counter row lock and increment
    SELECT last_number
    INTO v_next_number
    FROM public.counters
    WHERE fy = v_fy
    FOR UPDATE;

    IF NOT FOUND THEN
        v_next_number := 1;
        INSERT INTO public.counters (fy, last_number) VALUES (v_fy, 1);
    ELSE
        v_next_number := v_next_number + 1;
        UPDATE public.counters
        SET last_number = v_next_number
        WHERE fy = v_fy;
    END IF;

    v_invoice_no := LPAD(v_next_number::text, 3, '0') || '/' || v_fy;
    v_invoice_id := gen_random_uuid();

    -- Insert invoice record
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
        freight_paise,
        round_off_paise,
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
        v_freight_paise,
        v_round_off_paise,
        now()
    )
    RETURNING * INTO v_created_invoice;

    -- Insert lines
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
        (line_data.ordinality)::int AS line_no,
        btrim(COALESCE(l->>'description', 'Item')),
        NULLIF(btrim(COALESCE(l->>'hsn', '')), ''),
        COALESCE(l->>'unit', 'PCS'),
        COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::bigint,
        COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::bigint,
        COALESCE((l->>'gst_percent'), (l->>'gstPercent'))::numeric,
        ROUND((COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::numeric * COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::numeric) / 1000.0)::bigint
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS line_data(l, ordinality);

    RETURN v_created_invoice;
END;
$$;

-- 4. Update update_invoice RPC to support freight_paise, round_off_paise, and optional buyer_order_no
CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_existing public.invoices%ROWTYPE;
    v_invoice_date date;
    v_calc_taxable bigint := 0;
    v_calc_cgst bigint := 0;
    v_calc_sgst bigint := 0;
    v_calc_payable bigint := 0;
    v_freight_paise bigint := 0;
    v_round_off_paise bigint := 0;
    v_lines jsonb;
BEGIN
    SELECT * INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found', p_invoice_id;
    END IF;

    IF v_existing.status = 'cancelled' THEN
        RAISE EXCEPTION 'Cancelled invoice % cannot be edited', v_existing.invoice_no;
    END IF;

    v_invoice_date := (COALESCE(payload->>'invoice_date', payload->>'invoiceDate', v_existing.invoice_date::text))::date;
    v_freight_paise := COALESCE((payload->>'freight_paise')::bigint, 0);
    v_round_off_paise := COALESCE((payload->>'round_off_paise')::bigint, 0);
    v_lines := payload->'lines';

    IF v_lines IS NOT NULL AND jsonb_typeof(v_lines) = 'array' AND jsonb_array_length(v_lines) > 0 THEN
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
    ELSE
        v_calc_taxable := v_existing.taxable_paise;
        v_calc_cgst := v_existing.cgst_paise;
        v_calc_sgst := v_existing.sgst_paise;
        v_calc_payable := v_existing.payable_paise;
    END IF;

    -- Add freight and round-off to final payable
    v_calc_payable := v_calc_payable + v_freight_paise + v_round_off_paise;

    UPDATE public.invoices
    SET
        invoice_date = v_invoice_date,
        buyer_id = NULLIF(COALESCE(payload->>'buyer_id', payload->>'buyerId'), '')::uuid,
        buyer_name = COALESCE(payload->>'buyer_name', payload->>'buyerName', v_existing.buyer_name),
        buyer_gstin = COALESCE(payload->>'buyer_gstin', payload->>'buyerGstin', v_existing.buyer_gstin),
        buyer_state_code = COALESCE(payload->>'buyer_state_code', payload->>'buyerStateCode', v_existing.buyer_state_code),
        buyer_address = COALESCE(payload->>'buyer_address', payload->>'buyerAddress', v_existing.buyer_address),
        buyer_order_no = COALESCE(payload->>'buyer_order_no', payload->>'buyerOrderNo', v_existing.buyer_order_no),
        buyer_order_date = COALESCE(payload->>'buyer_order_date', payload->>'buyerOrderDate', v_existing.buyer_order_date),
        delivery_no = COALESCE(payload->>'delivery_no', payload->>'deliveryNo', v_existing.delivery_no),
        delivery_date = NULLIF(COALESCE(payload->>'delivery_date', payload->>'deliveryDate'), '')::date,
        despatched_through = COALESCE(payload->>'despatched_through', payload->>'despatchedThrough', v_existing.despatched_through),
        destination = COALESCE(payload->>'destination', payload->>'destination', v_existing.destination),
        terms_of_delivery = COALESCE(payload->>'terms_of_delivery', payload->>'termsOfDelivery', v_existing.terms_of_delivery),
        taxable_paise = v_calc_taxable,
        cgst_paise = v_calc_cgst,
        sgst_paise = v_calc_sgst,
        payable_paise = v_calc_payable,
        freight_paise = v_freight_paise,
        round_off_paise = v_round_off_paise
    WHERE id = p_invoice_id;

    IF v_lines IS NOT NULL AND jsonb_typeof(v_lines) = 'array' AND jsonb_array_length(v_lines) > 0 THEN
        DELETE FROM public.invoice_lines WHERE invoice_id = p_invoice_id;

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
            p_invoice_id,
            (line_data.ordinality)::int AS line_no,
            btrim(COALESCE(l->>'description', 'Item')),
            NULLIF(btrim(COALESCE(l->>'hsn', '')), ''),
            COALESCE(l->>'unit', 'PCS'),
            COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::bigint,
            COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::bigint,
            COALESCE((l->>'gst_percent'), (l->>'gstPercent'))::numeric,
            ROUND((COALESCE((l->>'qty_milli'), (l->>'qtyMilli'))::numeric * COALESCE((l->>'rate_paise'), (l->>'ratePaise'))::numeric) / 1000.0)::bigint
        FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS line_data(l, ordinality);
    END IF;

    RETURN jsonb_build_object(
        'id', p_invoice_id,
        'invoice_no', v_existing.invoice_no,
        'taxable_paise', v_calc_taxable,
        'cgst_paise', v_calc_cgst,
        'sgst_paise', v_calc_sgst,
        'payable_paise', v_calc_payable,
        'freight_paise', v_freight_paise,
        'round_off_paise', v_round_off_paise,
        'status', v_existing.status
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice(uuid, jsonb) TO anon, authenticated;

