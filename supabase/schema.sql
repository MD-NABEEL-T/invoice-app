-- =============================================================================
-- GST Invoicing App - Database Schema (Phase 2)
-- Strictly intra-state (CGST + SGST), integer paise accounting.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. Table: firm_profile
-- Single-row configuration storing supplier firm details and invoice declaration.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.firm_profile (
    id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    name text NOT NULL,
    address text NOT NULL,
    phone text,
    email text,
    gstin text NOT NULL,
    state_code text NOT NULL,
    declaration text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 2. Table: buyers
-- Master list of customer companies.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    gstin text NOT NULL,
    state_code text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 3. Table: buyer_addresses
-- Delivery and branch addresses for buyers (one buyer can have multiple units).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.buyer_addresses (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    buyer_id uuid NOT NULL REFERENCES public.buyers(id) ON DELETE RESTRICT,
    label text NOT NULL,
    address text NOT NULL,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 4. Table: items
-- Item master catalog with verification flag and HSN format validation.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    description text NOT NULL,
    hsn text,
    gst_percent numeric CHECK (gst_percent IS NULL OR gst_percent >= 0),
    unit text,
    default_rate_paise bigint CHECK (default_rate_paise IS NULL OR default_rate_paise >= 0),
    verified boolean NOT NULL DEFAULT false,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- 5. Table: counters
-- Per-financial-year sequential invoice counter (e.g. '26-27' -> 48).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.counters (
    fy text PRIMARY KEY,
    last_number int NOT NULL DEFAULT 0 CHECK (last_number >= 0)
);

-- -----------------------------------------------------------------------------
-- 6. Table: invoices
-- Immutable invoice records with buyer and total snapshots.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    fy text NOT NULL,
    number int NOT NULL,
    invoice_no text NOT NULL UNIQUE,
    invoice_date date NOT NULL,
    buyer_id uuid REFERENCES public.buyers(id),
    buyer_name text NOT NULL,
    buyer_gstin text NOT NULL,
    buyer_state_code text NOT NULL,
    buyer_address text NOT NULL,
    buyer_order_no text NOT NULL,
    buyer_order_date text,
    delivery_no text,
    delivery_date date,
    despatched_through text NOT NULL,
    destination text,
    terms_of_delivery text,
    status text NOT NULL DEFAULT 'final' CHECK (status IN ('final', 'cancelled')),
    taxable_paise bigint NOT NULL CHECK (taxable_paise >= 0),
    cgst_paise bigint NOT NULL CHECK (cgst_paise >= 0),
    sgst_paise bigint NOT NULL CHECK (sgst_paise >= 0),
    payable_paise bigint NOT NULL CHECK (payable_paise >= 0),
    cancelled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invoices_fy_number_unique UNIQUE (fy, number)
);

-- -----------------------------------------------------------------------------
-- 7. Table: invoice_lines
-- Immutable line items with snapshot description, HSN, rate, and amount.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invoice_lines (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    line_no int NOT NULL,
    description text NOT NULL,
    hsn text,
    unit text NOT NULL,
    qty_milli bigint NOT NULL CHECK (qty_milli > 0),
    rate_paise bigint NOT NULL CHECK (rate_paise >= 0),
    gst_percent numeric NOT NULL CHECK (gst_percent >= 0),
    amount_paise bigint NOT NULL CHECK (amount_paise >= 0),
    CONSTRAINT invoice_lines_invoice_id_line_no_unique UNIQUE (invoice_id, line_no)
);

-- =============================================================================
-- Triggers: Immutability Enforcements
-- =============================================================================

-- Trigger Function: Block DELETE on invoices, invoice_lines, counters
CREATE OR REPLACE FUNCTION public.block_delete_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'DELETE is not allowed on table %', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_delete_invoices ON public.invoices;
CREATE TRIGGER trg_block_delete_invoices
BEFORE DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.block_delete_trigger();

DROP TRIGGER IF EXISTS trg_block_delete_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_block_delete_invoice_lines
BEFORE DELETE ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.block_delete_trigger();

DROP TRIGGER IF EXISTS trg_block_delete_counters ON public.counters;
CREATE TRIGGER trg_block_delete_counters
BEFORE DELETE ON public.counters
FOR EACH ROW
EXECUTE FUNCTION public.block_delete_trigger();

-- Trigger Function: Block UPDATE on invoice_lines
CREATE OR REPLACE FUNCTION public.block_update_invoice_lines_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'UPDATE is not allowed on invoice_lines';
END;
$$;

DROP TRIGGER IF EXISTS trg_block_update_invoice_lines ON public.invoice_lines;
CREATE TRIGGER trg_block_update_invoice_lines
BEFORE UPDATE ON public.invoice_lines
FOR EACH ROW
EXECUTE FUNCTION public.block_update_invoice_lines_trigger();

-- Trigger Function: Block UPDATE on invoices except via cancel_invoice()
CREATE OR REPLACE FUNCTION public.check_invoice_update_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    is_allowed text;
BEGIN
    is_allowed := current_setting('app.allow_invoice_status_update', true);
    IF is_allowed IS DISTINCT FROM 'true' THEN
        RAISE EXCEPTION 'UPDATE is not allowed on invoices directly. Use cancel_invoice() to cancel.';
    END IF;

    -- Verify that only status and cancelled_at have changed
    IF NEW.id IS DISTINCT FROM OLD.id OR
       NEW.fy IS DISTINCT FROM OLD.fy OR
       NEW.number IS DISTINCT FROM OLD.number OR
       NEW.invoice_no IS DISTINCT FROM OLD.invoice_no OR
       NEW.invoice_date IS DISTINCT FROM OLD.invoice_date OR
       NEW.buyer_id IS DISTINCT FROM OLD.buyer_id OR
       NEW.buyer_name IS DISTINCT FROM OLD.buyer_name OR
       NEW.buyer_gstin IS DISTINCT FROM OLD.buyer_gstin OR
       NEW.buyer_state_code IS DISTINCT FROM OLD.buyer_state_code OR
       NEW.buyer_address IS DISTINCT FROM OLD.buyer_address OR
       NEW.buyer_order_no IS DISTINCT FROM OLD.buyer_order_no OR
       NEW.buyer_order_date IS DISTINCT FROM OLD.buyer_order_date OR
       NEW.delivery_no IS DISTINCT FROM OLD.delivery_no OR
       NEW.delivery_date IS DISTINCT FROM OLD.delivery_date OR
       NEW.despatched_through IS DISTINCT FROM OLD.despatched_through OR
       NEW.destination IS DISTINCT FROM OLD.destination OR
       NEW.terms_of_delivery IS DISTINCT FROM OLD.terms_of_delivery OR
       NEW.taxable_paise IS DISTINCT FROM OLD.taxable_paise OR
       NEW.cgst_paise IS DISTINCT FROM OLD.cgst_paise OR
       NEW.sgst_paise IS DISTINCT FROM OLD.sgst_paise OR
       NEW.payable_paise IS DISTINCT FROM OLD.payable_paise OR
       NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'Only status and cancelled_at may be updated on invoices';
    END IF;

    IF OLD.status = 'cancelled' THEN
        RAISE EXCEPTION 'Invoice is already cancelled';
    END IF;

    IF NEW.status IS DISTINCT FROM 'cancelled' THEN
        RAISE EXCEPTION 'Status can only be updated to cancelled';
    END IF;

    IF NEW.cancelled_at IS NULL THEN
        RAISE EXCEPTION 'cancelled_at must be provided when cancelling an invoice';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_check_invoice_update ON public.invoices;
CREATE TRIGGER trg_check_invoice_update
BEFORE UPDATE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.check_invoice_update_trigger();

-- =============================================================================
-- Functions: Stored Procedures (SECURITY DEFINER)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Function: set_starting_number(p_fy text, p_last_used int)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_starting_number(p_fy text, p_last_used int)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    IF p_fy IS NULL OR p_fy !~ '^[0-9]{2}-[0-9]{2}$' THEN
        RAISE EXCEPTION 'Invalid FY format. Expected format like "26-27"';
    END IF;

    IF p_last_used IS NULL OR p_last_used < 0 THEN
        RAISE EXCEPTION 'Starting number (last_used) must be 0 or greater';
    END IF;

    IF EXISTS (SELECT 1 FROM public.counters WHERE fy = p_fy) THEN
        RAISE EXCEPTION 'Counters row already exists for FY %', p_fy;
    END IF;

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

-- -----------------------------------------------------------------------------
-- Function: cancel_invoice(invoice_id)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_invoice(invoice_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_inv record;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Unauthorized: User is not authenticated';
    END IF;

    SELECT id, invoice_no, status
    INTO v_inv
    FROM public.invoices
    WHERE id = invoice_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice with ID % not found', invoice_id;
    END IF;

    IF v_inv.status = 'cancelled' THEN
        RAISE EXCEPTION 'Invoice % is already cancelled', v_inv.invoice_no;
    END IF;

    -- Set transaction-local setting to authorize status change
    PERFORM set_config('app.allow_invoice_status_update', 'true', true);

    UPDATE public.invoices
    SET status = 'cancelled',
        cancelled_at = now()
    WHERE id = invoice_id;

    RETURN jsonb_build_object(
        'id', invoice_id,
        'invoice_no', v_inv.invoice_no,
        'status', 'cancelled'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- Function: create_invoice(payload)
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

-- =============================================================================
-- Row Level Security (RLS) Policies
-- =============================================================================

ALTER TABLE public.firm_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buyer_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_lines ENABLE ROW LEVEL SECURITY;

-- Master tables: authenticated users can read and write
DROP POLICY IF EXISTS "authenticated_all_firm_profile" ON public.firm_profile;
CREATE POLICY "authenticated_all_firm_profile" ON public.firm_profile
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_buyers" ON public.buyers;
CREATE POLICY "authenticated_all_buyers" ON public.buyers
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_buyer_addresses" ON public.buyer_addresses;
CREATE POLICY "authenticated_all_buyer_addresses" ON public.buyer_addresses
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated_all_items" ON public.items;
CREATE POLICY "authenticated_all_items" ON public.items
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Invoices & lines: authenticated users can only SELECT
DROP POLICY IF EXISTS "authenticated_select_invoices" ON public.invoices;
CREATE POLICY "authenticated_select_invoices" ON public.invoices
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "authenticated_select_invoice_lines" ON public.invoice_lines;
CREATE POLICY "authenticated_select_invoice_lines" ON public.invoice_lines
    FOR SELECT TO authenticated USING (true);

-- No RLS policies are created for anon (default deny all)
-- No RLS policies are created for counters (direct access denied; managed via SECURITY DEFINER function)

-- =============================================================================
-- Explicit Grants and Privileges
-- ("Automatically expose new tables" is OFF in project)
-- =============================================================================

-- Revoke all default privileges from public and anon
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;

-- Schema usage
GRANT USAGE ON SCHEMA public TO authenticated;

-- Master tables privileges
GRANT SELECT, INSERT, UPDATE ON public.firm_profile TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.buyers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.buyer_addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.items TO authenticated;

-- Read-only on invoices and lines
GRANT SELECT ON public.invoices TO authenticated;
GRANT SELECT ON public.invoice_lines TO authenticated;

-- Ensure NO INSERT, UPDATE, or DELETE grants on invoices, lines, and counters
REVOKE INSERT, UPDATE, DELETE ON public.invoices FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.invoice_lines FROM authenticated;
REVOKE ALL ON public.counters FROM authenticated;

-- Execute grants on functions
REVOKE EXECUTE ON FUNCTION public.create_invoice(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(jsonb) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.cancel_invoice(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_invoice(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.set_starting_number(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_starting_number(text, int) TO authenticated;

-- =============================================================================
-- Starting Sequence Number Setup
-- =============================================================================
-- Initialize counter for a financial year via authenticated RPC or SQL:
-- SELECT public.set_starting_number('26-27', <last number used>);
