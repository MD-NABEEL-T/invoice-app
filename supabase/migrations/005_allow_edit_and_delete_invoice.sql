-- =============================================================================
-- Migration 005: Allow Edit and Delete of Invoices
-- Adds functions:
--   1. public.update_invoice(p_invoice_id uuid, payload jsonb)
--   2. public.delete_invoice(p_invoice_id uuid)
-- Updates triggers to allow authorized updates and deletes.
-- =============================================================================

-- 1. Ensure foreign key on invoice_lines cascades on delete
ALTER TABLE public.invoice_lines
  DROP CONSTRAINT IF EXISTS invoice_lines_invoice_id_fkey;

ALTER TABLE public.invoice_lines
  ADD CONSTRAINT invoice_lines_invoice_id_fkey
  FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE;

-- 2. Drop legacy immutability blocking triggers that prevent delete/update
DROP TRIGGER IF EXISTS trg_block_delete_invoices ON public.invoices;
DROP TRIGGER IF EXISTS trg_block_delete_invoice_lines ON public.invoice_lines;
DROP TRIGGER IF EXISTS trg_block_update_invoice_lines ON public.invoice_lines;
DROP TRIGGER IF EXISTS trg_check_invoice_update ON public.invoices;

-- 3. Function: update_invoice(p_invoice_id uuid, payload jsonb)
CREATE OR REPLACE FUNCTION public.update_invoice(p_invoice_id uuid, payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_existing public.invoices%ROWTYPE;
    v_invoice_date date;
    
    v_calc_taxable bigint := 0;
    v_calc_cgst bigint := 0;
    v_calc_sgst bigint := 0;
    v_calc_payable bigint := 0;
    
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
    v_l record;
    v_line_idx int := 1;
BEGIN
    -- Auth check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    -- Existence check
    SELECT * INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found', p_invoice_id;
    END IF;

    IF payload IS NULL THEN
        RAISE EXCEPTION 'Payload is required';
    END IF;

    -- Extract header values
    v_invoice_date := COALESCE((payload->>'invoice_date'), (payload->>'invoiceDate'), v_existing.invoice_date::text)::date;

    v_buyer_order_no := COALESCE(payload->>'buyer_order_no', payload->>'buyerOrderNo', v_existing.buyer_order_no);
    IF v_buyer_order_no IS NULL OR btrim(v_buyer_order_no) = '' THEN
        RAISE EXCEPTION 'buyer_order_no is required';
    END IF;

    v_despatched_through := COALESCE(payload->>'despatched_through', payload->>'despatchedThrough', v_existing.despatched_through);
    IF v_despatched_through IS NULL OR btrim(v_despatched_through) = '' THEN
        RAISE EXCEPTION 'despatched_through is required';
    END IF;

    v_buyer_name := COALESCE(payload->>'buyer_name', payload->>'buyerName', v_existing.buyer_name);
    v_buyer_gstin := COALESCE(payload->>'buyer_gstin', payload->>'buyerGstin', v_existing.buyer_gstin);
    v_buyer_state_code := COALESCE(payload->>'buyer_state_code', payload->>'buyerStateCode', v_existing.buyer_state_code);
    v_buyer_address := COALESCE(payload->>'buyer_address', payload->>'buyerAddress', v_existing.buyer_address);
    v_buyer_id := NULLIF(COALESCE(payload->>'buyer_id', payload->>'buyerId', v_existing.buyer_id::text), '')::uuid;
    v_buyer_order_date := COALESCE(payload->>'buyer_order_date', payload->>'buyerOrderDate');
    v_delivery_no := COALESCE(payload->>'delivery_no', payload->>'deliveryNo');
    v_delivery_date := NULLIF(COALESCE(payload->>'delivery_date', payload->>'deliveryDate'), '')::date;
    v_destination := COALESCE(payload->>'destination', payload->>'destination');
    v_terms_of_delivery := COALESCE(payload->>'terms_of_delivery', payload->>'termsOfDelivery');

    -- Lines validation
    v_lines := payload->'lines';
    IF v_lines IS NULL OR jsonb_typeof(v_lines) <> 'array' THEN
        RAISE EXCEPTION 'lines array is required';
    END IF;

    v_line_count := jsonb_array_length(v_lines);
    IF v_line_count = 0 THEN
        RAISE EXCEPTION 'Invoice must contain at least one line';
    END IF;

    -- Calculate rate groups strictly matching tax.js
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

    -- Update invoice header snapshot (maintaining existing invoice_no, fy, number)
    UPDATE public.invoices
    SET
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
        taxable_paise = v_calc_taxable,
        cgst_paise = v_calc_cgst,
        sgst_paise = v_calc_sgst,
        payable_paise = v_calc_payable
    WHERE id = p_invoice_id;

    -- Replace line items
    DELETE FROM public.invoice_lines
    WHERE invoice_id = p_invoice_id;

    FOR v_l IN SELECT * FROM jsonb_array_elements(v_lines)
    LOOP
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
        ) VALUES (
            p_invoice_id,
            v_line_idx,
            btrim(COALESCE(v_l.value->>'description', '')),
            btrim(COALESCE(v_l.value->>'hsn', '')),
            btrim(COALESCE(v_l.value->>'unit', 'PCS')),
            COALESCE((v_l.value->>'qty_milli'), (v_l.value->>'qtyMilli'))::bigint,
            COALESCE((v_l.value->>'rate_paise'), (v_l.value->>'ratePaise'))::bigint,
            COALESCE((v_l.value->>'gst_percent'), (v_l.value->>'gstPercent'))::numeric,
            ROUND((COALESCE((v_l.value->>'qty_milli'), (v_l.value->>'qtyMilli'))::numeric * COALESCE((v_l.value->>'rate_paise'), (v_l.value->>'ratePaise'))::numeric) / 1000.0)::bigint
        );
        v_line_idx := v_line_idx + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'id', p_invoice_id,
        'invoice_no', v_existing.invoice_no,
        'taxable_paise', v_calc_taxable,
        'cgst_paise', v_calc_cgst,
        'sgst_paise', v_calc_sgst,
        'payable_paise', v_calc_payable
    );
END;
$$;

-- 4. Function: delete_invoice(p_invoice_id uuid)
CREATE OR REPLACE FUNCTION public.delete_invoice(p_invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_id uuid;
    v_existing public.invoices%ROWTYPE;
BEGIN
    -- Auth check
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    SELECT * INTO v_existing
    FROM public.invoices
    WHERE id = p_invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found', p_invoice_id;
    END IF;

    -- Delete line items and invoice (lines will also cascade)
    DELETE FROM public.invoice_lines WHERE invoice_id = p_invoice_id;
    DELETE FROM public.invoices WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'deleted_id', p_invoice_id,
        'invoice_no', v_existing.invoice_no
    );
END;
$$;

REVOKE ALL ON FUNCTION public.update_invoice(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_invoice(uuid, jsonb) TO authenticated;

REVOKE ALL ON FUNCTION public.delete_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_invoice(uuid) TO authenticated;

-- 5. Update branch labels in existing database
UPDATE public.buyer_addresses
SET label = 'LGD'
WHERE label = 'Branch 1';

UPDATE public.buyer_addresses
SET label = 'Unit 3 KH'
WHERE label = 'Branch 2';
