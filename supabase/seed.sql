-- =============================================================================
-- GST Invoicing App - Seed Data (Phase 2)
-- Extracted from data/SINGLE FORMAT.xlsm and data/2BILLTAX FORMAT.xlsm
-- =============================================================================

-- 1. Firm Profile (from cell A2 and declaration from cell A24 of data/SINGLE FORMAT.xlsm)
INSERT INTO public.firm_profile (
    id,
    name,
    address,
    phone,
    email,
    gstin,
    state_code,
    declaration
) VALUES (
    1,
    'KHANSA ENTERPRISES',
    '#158,Pudhupet 3rd Street,
MELVISHARAM-632509
Ranipet District
Tamil Nadu.',
    '9445671796',
    'mohammedafzalarni@yahoo.com',
    '33AGXPF4947Q1ZH',
    '33',
    'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct'
)
ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    address = EXCLUDED.address,
    phone = EXCLUDED.phone,
    email = EXCLUDED.email,
    gstin = EXCLUDED.gstin,
    state_code = EXCLUDED.state_code,
    declaration = EXCLUDED.declaration,
    updated_at = now();

-- 2. Buyer and Branch Addresses
DO $$
DECLARE
    v_buyer_id uuid;
BEGIN
    -- Buyer: KH EXPORT INDIA PRIVATE LTD (with GSTIN 33AAACR1714R1ZA)
    SELECT id INTO v_buyer_id
    FROM public.buyers
    WHERE gstin = '33AAACR1714R1ZA'
    LIMIT 1;

    IF v_buyer_id IS NULL THEN
        INSERT INTO public.buyers (
            name,
            gstin,
            state_code,
            active
        ) VALUES (
            'KH EXPORT INDIA PRIVATE LTD',
            '33AAACR1714R1ZA',
            '33',
            true
        )
        RETURNING id INTO v_buyer_id;
    ELSE
        UPDATE public.buyers
        SET name = 'KH EXPORT INDIA PRIVATE LTD',
            state_code = '33',
            active = true,
            updated_at = now()
        WHERE id = v_buyer_id;
    END IF;

    -- Branch 1: visible in data/SINGLE FORMAT.xlsm (cell A5)
    IF NOT EXISTS (
        SELECT 1 FROM public.buyer_addresses
        WHERE buyer_id = v_buyer_id AND label = 'Branch 1'
    ) THEN
        INSERT INTO public.buyer_addresses (buyer_id, label, address, active)
        VALUES (
            v_buyer_id,
            'Branch 1',
            'Leather Goods Division
4/74 V.O.C street seneerkuppam, Poonamallee
Chennai-56',
            true
        );
    ELSE
        UPDATE public.buyer_addresses
        SET address = 'Leather Goods Division
4/74 V.O.C street seneerkuppam, Poonamallee
Chennai-56',
            active = true,
            updated_at = now()
        WHERE buyer_id = v_buyer_id AND label = 'Branch 1';
    END IF;

    -- Branch 2: visible in data/2BILLTAX FORMAT.xlsm (cell A5)
    IF NOT EXISTS (
        SELECT 1 FROM public.buyer_addresses
        WHERE buyer_id = v_buyer_id AND label = 'Branch 2'
    ) THEN
        INSERT INTO public.buyer_addresses (buyer_id, label, address, active)
        VALUES (
            v_buyer_id,
            'Branch 2',
            'LEATHER GOODS DIVISION UNIT-III
256,257 KATHIYAVADI ROAD,
MELVISHARAM-632509',
            true
        );
    ELSE
        UPDATE public.buyer_addresses
        SET address = 'LEATHER GOODS DIVISION UNIT-III
256,257 KATHIYAVADI ROAD,
MELVISHARAM-632509',
            active = true,
            updated_at = now()
        WHERE buyer_id = v_buyer_id AND label = 'Branch 2';
    END IF;

    -- Deactivate legacy Branch 3 placeholder if it exists (Phase 4b)
    UPDATE public.buyer_addresses
    SET active = false,
        updated_at = now()
    WHERE buyer_id = v_buyer_id 
      AND (label = 'Branch 3' OR address ILIKE '%ADDRESS PENDING%');
END $$;
