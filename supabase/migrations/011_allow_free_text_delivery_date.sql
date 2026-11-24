-- Migration 011: Allow free-text delivery_date with punctuation and multiple dates
--
-- 1. Alter delivery_date column in invoices table from date to text
ALTER TABLE public.invoices ALTER COLUMN delivery_date TYPE text USING delivery_date::text;

-- 2. Update create_invoice RPC to accept free text delivery_date without casting to date
DROP FUNCTION IF EXISTS public.create_invoice(jsonb);
CREATE OR REPLACE FUNCTION public.create_invoice(payload jsonb)
RETURNS jsonb
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
    v_delivery_date text;
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
    v_delivery_date := NULLIF(btrim(COALESCE(payload->>'delivery_date', payload->>'deliveryDate', '')), '');
    v_despatched_through := btrim(COALESCE(payload->>'despatched_through', ''));
    v_destination := NULLIF(btrim(COALESCE(payload->>'destination', '')), '');
    v_terms_of_delivery := NULLIF(btrim(COALESCE(payload->>'terms_of_delivery', '')), '');
    v_lines := payload->'lines';
    v_freight_paise := COALESCE((payload->>'freight_paise')::bigint, 0);
    v_round_off_paise := COALESCE((payload->>'round_off_paise')::bigint, 0);

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

    -- Financial year derivation from invoice_date (April 1 to March 31)
    v_year := EXTRACT(YEAR FROM v_invoice_date)::int;
    v_month := EXTRACT(MONTH FROM v_invoice_date)::int;
    IF v_month >= 4 THEN
        v_start_year := v_year;
        v_end_year := v_year + 1;
    ELSE
        v_start_year := v_year - 1;
        v_end_year := v_year;
    END IF;
    v_fy := to_char(v_start_year % 100, 'FM00') || '-' || to_char(v_end_year % 100, 'FM00');

    -- Atomic next number allocation
    INSERT INTO public.counters (fy, last_number)
    VALUES (v_fy, 1)
    ON CONFLICT (fy) DO UPDATE
    SET last_number = counters.last_number + 1
    RETURNING last_number INTO v_next_number;

    v_invoice_no := to_char(v_next_number, 'FM000') || '/' || v_fy;

    -- Strict server-side tax calculation
    SELECT
        COALESCE(SUM((l->>'amount_paise')::bigint), 0),
        COALESCE(SUM((l->>'cgst_paise')::bigint), 0),
        COALESCE(SUM((l->>'sgst_paise')::bigint), 0)
    INTO v_calc_taxable, v_calc_cgst, v_calc_sgst
    FROM jsonb_array_elements(v_lines) AS l;

    v_calc_payable := v_calc_taxable + v_calc_cgst + v_calc_sgst + v_freight_paise + v_round_off_paise;

    v_invoice_id := gen_random_uuid();

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
    ) RETURNING * INTO v_created_invoice;

    INSERT INTO public.invoice_lines (
        invoice_id,
        line_no,
        description,
        hsn,
        unit,
        qty_milli,
        rate_paise,
        gst_percent,
        amount_paise,
        freight_paise
    )
    SELECT
        v_invoice_id,
        ordinality::int,
        btrim(COALESCE(l->>'description', '')),
        btrim(COALESCE(l->>'hsn', '')),
        btrim(COALESCE(l->>'unit', 'PCS')),
        (l->>'qty_milli')::bigint,
        (l->>'rate_paise')::bigint,
        (l->>'gst_percent')::numeric,
        (l->>'amount_paise')::bigint,
        COALESCE((l->>'freight_paise')::bigint, 0)
    FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS line_data(l, ordinality);

    RETURN to_jsonb(v_created_invoice);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_invoice(jsonb) TO anon, authenticated;

-- 3. Update update_invoice RPC to accept free text delivery_date and clear destination/terms_of_delivery when omitted
DROP FUNCTION IF EXISTS public.update_invoice(uuid, jsonb);
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

    -- Compute line totals
    IF v_lines IS NOT NULL AND jsonb_typeof(v_lines) = 'array' THEN
        SELECT
            COALESCE(SUM((l->>'amount_paise')::bigint), 0),
            COALESCE(SUM((l->>'cgst_paise')::bigint), 0),
            COALESCE(SUM((l->>'sgst_paise')::bigint), 0)
        INTO v_calc_taxable, v_calc_cgst, v_calc_sgst
        FROM jsonb_array_elements(v_lines) AS l;
    END IF;

    v_calc_payable := v_calc_taxable + v_calc_cgst + v_calc_sgst + v_freight_paise + v_round_off_paise;

    UPDATE public.invoices
    SET
        invoice_date = v_invoice_date,
        buyer_id = NULLIF(COALESCE(payload->>'buyer_id', payload->>'buyerId'), '')::uuid,
        buyer_name = COALESCE(payload->>'buyer_name', payload->>'buyerName', v_existing.buyer_name),
        buyer_gstin = COALESCE(payload->>'buyer_gstin', payload->>'buyerGstin', v_existing.buyer_gstin),
        buyer_state_code = COALESCE(payload->>'buyer_state_code', payload->>'buyerStateCode', v_existing.buyer_state_code),
        buyer_address = COALESCE(payload->>'buyer_address', payload->>'buyerAddress', v_existing.buyer_address),
        buyer_order_no = COALESCE(payload->>'buyer_order_no', payload->>'buyerOrderNo', v_existing.buyer_order_no),
        buyer_order_date = NULLIF(btrim(COALESCE(payload->>'buyer_order_date', payload->>'buyerOrderDate', '')), ''),
        delivery_no = NULLIF(btrim(COALESCE(payload->>'delivery_no', payload->>'deliveryNo', '')), ''),
        delivery_date = NULLIF(btrim(COALESCE(payload->>'delivery_date', payload->>'deliveryDate', '')), ''),
        despatched_through = COALESCE(payload->>'despatched_through', payload->>'despatchedThrough', v_existing.despatched_through),
        destination = NULLIF(btrim(COALESCE(payload->>'destination', '')), ''),
        terms_of_delivery = NULLIF(btrim(COALESCE(payload->>'terms_of_delivery', '')), ''),
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
            amount_paise,
            freight_paise
        )
        SELECT
            p_invoice_id,
            ordinality::int,
            btrim(COALESCE(l->>'description', '')),
            btrim(COALESCE(l->>'hsn', '')),
            btrim(COALESCE(l->>'unit', 'PCS')),
            (l->>'qty_milli')::bigint,
            (l->>'rate_paise')::bigint,
            (l->>'gst_percent')::numeric,
            (l->>'amount_paise')::bigint,
            COALESCE((l->>'freight_paise')::bigint, 0)
        FROM jsonb_array_elements(v_lines) WITH ORDINALITY AS line_data(l, ordinality);
    END IF;

    SELECT * INTO v_existing FROM public.invoices WHERE id = p_invoice_id;
    RETURN to_jsonb(v_existing);
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_invoice(uuid, jsonb) TO anon, authenticated;
