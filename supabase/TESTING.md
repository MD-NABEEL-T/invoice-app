# Supabase API Testing Guide (Phase 2)

This guide documents the 9 API test cases to verify the Supabase database schema, RLS policies, security definer RPC functions, and immutability triggers.

All test bills use invoice dates in **April 2099** (financial year **'99-00'**) so the production sequential number series (e.g. '26-27') is completely isolated and never touched during testing.

---

## Environment Setup

The test scripts read the following variables from `.env.local`:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL (e.g. `https://<ref>.supabase.co`) |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key (`sb_publishable_...`) |
| `TEST_EMAIL` | Email of registered user |
| `TEST_PASSWORD` | Password of registered user |

> **Header Rule**: In all requests, send the publishable key in the `apikey` header. Send authenticated user credentials in `Authorization: Bearer <USER_JWT>`.

---

## Test 1: User Login
**Purpose**: Authenticate user via Supabase GoTrue Auth and retrieve a JWT access token.

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/auth/v1/token?grant_type=password`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "email": "{{TEST_EMAIL}}",
    "password": "{{TEST_PASSWORD}}"
  }
  ```
- **Expected Status**: `200 OK`
- **Checks**:
  - Status is 200
  - Response contains `access_token`

---

## Test 2: Call `create_invoice` Twice (Sequential Numbering & Format)
**Purpose**: Call `/rest/v1/rpc/create_invoice` twice to verify atomic sequential numbering (001, 002) and format (`001/99-00`, `002/99-00`).

### Request 2A: First Invoice
- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "invoice_date": "2099-04-10",
    "buyer_name": "KH EXPORT INDIA PRIVATE LTD",
    "buyer_gstin": "33AAACR1714R1ZA",
    "buyer_state_code": "33",
    "buyer_address": "Leather Goods Division\n4/74 V.O.C street seneerkuppam, Poonamallee\nChennai-56",
    "buyer_order_no": "PO-1001",
    "buyer_order_date": "08/04/2099",
    "delivery_no": "0000",
    "delivery_date": null,
    "despatched_through": "Direct Delivery",
    "destination": "Chennai",
    "terms_of_delivery": null,
    "taxable_paise": 20000,
    "cgst_paise": 1800,
    "sgst_paise": 1800,
    "payable_paise": 23600,
    "lines": [
      {
        "line_no": 1,
        "description": "Cleaning Detergent",
        "hsn": "3402",
        "unit": "KG",
        "qty_milli": 1000,
        "rate_paise": 20000,
        "gst_percent": 18
      }
    ]
  }
  ```
- **Expected Status**: `200 OK`
- **Expected Response**:
  ```json
  {
    "id": "<uuid>",
    "invoice_no": "001/99-00"
  }
  ```

### Request 2B: Second Invoice
- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON): Same as 2A with `"buyer_order_no": "PO-1002"`.
- **Expected Status**: `200 OK`
- **Expected Response**:
  ```json
  {
    "id": "<uuid>",
    "invoice_no": "002/99-00"
  }
  ```

---

## Test 3: Mixed GST Rates (5% and 18%) & Totals Verification
**Purpose**: Verify multi-rate grouping calculations (Invoice 046 sample: 625.00 @ 5% + 500.00 @ 18%).
- Taxable: 62,500 + 50,000 = 112,500 paise (₹1,125.00)
- 5% Group Tax: round(62,500 * 0.05) = 3,125 paise -> CGST 1,562 + SGST 1,563
- 18% Group Tax: round(50,000 * 0.18) = 9,000 paise -> CGST 4,500 + SGST 4,500
- Total CGST: 1,562 + 4,500 = 6,062 paise (₹60.62)
- Total SGST: 1,563 + 4,500 = 6,063 paise (₹60.63)
- Total Payable: 112,500 + 6,062 + 6,063 = 124,625 paise (₹1,246.25)

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "invoice_date": "2099-04-12",
    "buyer_name": "KH EXPORT INDIA PRIVATE LTD",
    "buyer_gstin": "33AAACR1714R1ZA",
    "buyer_state_code": "33",
    "buyer_address": "LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509",
    "buyer_order_no": "PO-1046",
    "buyer_order_date": "10/04/2099",
    "delivery_no": "0000",
    "delivery_date": null,
    "despatched_through": "Tempo",
    "destination": "Melvisharam",
    "terms_of_delivery": null,
    "taxable_paise": 112500,
    "cgst_paise": 6062,
    "sgst_paise": 6063,
    "payable_paise": 124625,
    "lines": [
      {
        "line_no": 1,
        "description": "Hair cap net",
        "hsn": "6505",
        "unit": "PCS",
        "qty_milli": 1000,
        "rate_paise": 62500,
        "gst_percent": 5
      },
      {
        "line_no": 2,
        "description": "Nozzle",
        "hsn": "8481",
        "unit": "PCS",
        "qty_milli": 1000,
        "rate_paise": 50000,
        "gst_percent": 18
      }
    ]
  }
  ```
- **Expected Status**: `200 OK`
- **Expected Response**:
  ```json
  {
    "id": "<uuid>",
    "invoice_no": "003/99-00"
  }
  ```

---

## Test 4: Send Payload with Wrong Totals (Expect Failure)
**Purpose**: Confirm the SQL function recalculates taxes and raises an exception when the client payload totals do not match computed values.

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON): Same as Test 3, but with forged `payable_paise`:
  ```json
  {
    "invoice_date": "2099-04-12",
    "buyer_name": "KH EXPORT INDIA PRIVATE LTD",
    "buyer_gstin": "33AAACR1714R1ZA",
    "buyer_state_code": "33",
    "buyer_address": "Leather Goods Division",
    "buyer_order_no": "PO-TAMPERED",
    "despatched_through": "Tempo",
    "taxable_paise": 112500,
    "cgst_paise": 6062,
    "sgst_paise": 6063,
    "payable_paise": 999999,
    "lines": [
      {
        "line_no": 1,
        "description": "Hair cap net",
        "hsn": "6505",
        "unit": "PCS",
        "qty_milli": 1000,
        "rate_paise": 62500,
        "gst_percent": 5
      }
    ]
  }
  ```
- **Expected Status**: `400 Bad Request`
- **Expected Response**: Message includes `totals mismatch`.

---

## Test 5: Try to DELETE an Invoice (Expect Failure)
**Purpose**: Verify the database trigger blocks `DELETE` on the `invoices` table.

- **Method**: `DELETE`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/invoices?id=eq.<INVOICE_ID_1>`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  ```
- **Expected Status**: `400 Bad Request` or `403 Forbidden`
- **Expected Response**: Blocked by `block_delete_trigger` or permissions.

---

## Test 6: Try to Directly UPDATE an Invoice (Expect Failure)
**Purpose**: Verify that direct edits to invoices are blocked by the immutability trigger.

- **Method**: `PATCH`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/invoices?id=eq.<INVOICE_ID_1>`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "despatched_through": "Altered Courier"
  }
  ```
- **Expected Status**: `400 Bad Request` or `403 Forbidden`
- **Expected Response**: Blocked by `check_invoice_update_trigger` or permissions.

---

## Test 7: Cancel Invoice & Confirm Number is NOT Reused
**Purpose**: Cancel an invoice via `cancel_invoice()` and verify that the next issued invoice receives the next number in sequence rather than reusing the cancelled one.

### Request 7A: Cancel Invoice 3
- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/cancel_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "invoice_id": "<INVOICE_ID_3>"
  }
  ```
- **Expected Status**: `200 OK`
- **Expected Response**:
  ```json
  {
    "id": "<INVOICE_ID_3>",
    "invoice_no": "003/99-00",
    "status": "cancelled"
  }
  ```

### Request 7B: Create Next Invoice
- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON): Use valid payload with `"invoice_date": "2099-04-14"` and `"buyer_order_no": "PO-1004"`.
- **Expected Status**: `200 OK`
- **Expected Response**:
  ```json
  {
    "id": "<uuid>",
    "invoice_no": "004/99-00"
  }
  ```

---

## Test 8: Anonymous Request with Only API Key (Expect No Data)
**Purpose**: Confirm Row Level Security denies anonymous access when only `apikey` is provided without an `Authorization: Bearer <JWT>` header.

- **Method**: `GET`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/invoices`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  ```
  *(Omit `Authorization` header)*
- **Expected Status**: `200 OK` with an empty array `[]` (RLS denies read) or `401 Unauthorized` / `403 Forbidden`.

---

## Test 9: Direct INSERT into `invoices` (Expect Failure)
**Purpose**: Confirm that direct table insertion is denied because `INSERT` privileges are revoked from `authenticated` users on `invoices`.

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/invoices`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body** (raw JSON):
  ```json
  {
    "fy": "99-00",
    "number": 99,
    "invoice_no": "099/99-00",
    "invoice_date": "2099-04-15",
    "buyer_name": "KH EXPORT INDIA PRIVATE LTD",
    "buyer_gstin": "33AAACR1714R1ZA",
    "buyer_state_code": "33",
    "buyer_address": "Poonamallee",
    "buyer_order_no": "PO-HACK",
    "despatched_through": "Direct",
    "taxable_paise": 10000,
    "cgst_paise": 250,
    "sgst_paise": 250,
    "payable_paise": 10500
  }
  ```
- **Expected Status**: `403 Forbidden` or `401 Unauthorized`

---

## Test 10: 10 Parallel `create_invoice` Calls (Concurrency & Nonce)
**Purpose**: Execute 10 simultaneous `create_invoice` RPC requests for FY `'99-00'` using `Promise.all` to verify that PostgreSQL row-level locks on `counters` guarantee 10 unique, strictly consecutive invoice numbers without race conditions.

- **Method**: `POST` (x10 concurrently)
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Expected Checks**:
  - All 10 requests return `200 OK`.
  - All 10 invoice numbers end in `/99-00`.
  - The 10 sequential numbers are unique and strictly consecutive ($N, N+1, \dots, N+9$).

---

## Test 11: Financial Year Boundary Detection
**Purpose**: Verify that invoice dates around the April 1 fiscal boundary are routed to the proper financial year:
- `2099-03-31` (last day of March) -> FY `'98-99'`
- `2099-04-01` (first day of April) -> FY `'99-00'`

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/create_invoice`
- **Expected Checks**:
  - Bill dated `2099-03-31` receives `.../98-99`.
  - Bill dated `2099-04-01` receives `.../99-00`.

---

## Test 12: Input & Unset Counter Validation Rejections
**Purpose**: Confirm that `create_invoice` raises an exception for any invalid payload and does NOT auto-create counters:
1. Empty `buyer_order_no` (whitespace only) -> Rejection: `buyer_order_no is required`.
2. Missing `despatched_through` -> Rejection: `despatched_through is required`.
3. Empty `lines: []` -> Rejection: `Invoice must contain at least one line`.
4. Invoice date in uninitialized FY (e.g. `2097-05-01` -> `'97-98'`) -> Rejection: `'Starting number not set for FY 97-98. Set it in Settings first.'`.

---

## Test 13: `set_starting_number` Immutability Guard
**Purpose**: Verify that `set_starting_number` cannot alter or overwrite an existing counter series or a financial year where invoices already exist.

- **Method**: `POST`
- **URL**: `{{VITE_SUPABASE_URL}}/rest/v1/rpc/set_starting_number`
- **Headers**:
  ```http
  apikey: {{VITE_SUPABASE_PUBLISHABLE_KEY}}
  Authorization: Bearer {{USER_JWT}}
  Content-Type: application/json
  ```
- **Body**:
  ```json
  {
    "p_fy": "99-00",
    "p_last_used": 50
  }
  ```
- **Expected Status**: Error / Exception (e.g. `Counters row already exists for FY 99-00`).

