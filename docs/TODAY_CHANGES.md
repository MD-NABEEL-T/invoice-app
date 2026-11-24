# Summary of Changes - 24 November 2026

## 1. Destination & Terms of Delivery Isolation
- **What Changed**: Isolated `destination` and `terms_of_delivery` across form state, draft restore, payload builder, preview, PDF generator, and email webhook. Added distinct input IDs/names and `autoComplete="off"`. Added a quick-select branch dropdown for Terms of Delivery.
- **Files**:
  - `src/pages/NewBill.jsx`
  - `src/lib/billPayload.test.js`

## 2. Free Text Delivery Date & Buyer Order Details
- **What Changed**: Converted `delivery_date` and `buyer_order_date` from rigid date pickers to free-text inputs (allowing commas, slashes, multiple dates, punctuation, up to 200 characters). Updated print preview and PDF generation to wrap long text across rows without visual overlap.
- **Files**:
  - `src/pages/NewBill.jsx`
  - `src/lib/billUtils.js`
  - `src/components/InvoiceSheet.jsx`
  - `supabase/migrations/011_allow_free_text_delivery_date.sql`
  - `supabase/RUN_TODAY.sql`

## 3. New Bill Defaults
- **What Changed**: On a new bill only (not when editing, copying, or restoring drafts), buyer defaults to `KH EXPORT INDIA PRIVATE LTD` and delivery unit defaults to `Unit-III (Melvisharam)` (the branch used on the most recent bill).
- **Files**:
  - `src/pages/NewBill.jsx`

## 4. Reports & HSN Summary Improvements
- **What Changed**: Grouped HSN summary by `(HSN, GST rate)` across all active bills in the period, merging quantities with joined units (e.g. `10 NOS + 5 PCS`) by default. Maintained distinction between 4-digit and 8-digit HSN codes (e.g. `3919` vs `39191000`). Added "Split by unit (GST portal UQC)" checkbox (default OFF). Flagged missing HSN as `MISSING HSN` instead of defaulting to `4107`.
- **Files**:
  - `src/lib/reports.js`
  - `src/lib/reports.test.js`
  - `src/pages/Reports.jsx`
