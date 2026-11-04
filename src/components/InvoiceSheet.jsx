import React, { useRef, useState, useLayoutEffect } from 'react';
import {
  formatPlainAmount,
  getRateGroupSummary,
  getHsnSummaryRows,
  paginateInvoiceLines,
} from '../lib/invoiceLayout.js';
import { formatMilliToQuantity } from '../lib/billPayload.js';
import { formatDisplayDate, numberToWordsIndian } from '../lib/billUtils.js';

const DEFAULT_FIRM = {
  name: 'KHANSA ENTERPRISES',
  address: '#158,Pudhupet 3rd Street,\nMELVISHARAM-632509\nRanipet District\nTamil Nadu.',
  phone: '8300533896/9342614838',
  email: 'mohammedafzalarni@yahoo.com',
  gstin: '33AGXPF4947Q1ZH',
  declaration: 'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct',
};

/**
 * Responsive Scaling Wrapper:
 * When viewport/container width is smaller than standard A4 width (794px),
 * scales the sheet to fit the screen width and adjusts the wrapper height
 * to match the scaled height exactly (avoiding blank space).
 */
export function ScaledSheetWrapper({ children, enabled = true }) {
  const containerRef = useRef(null);
  const innerRef = useRef(null);
  const [scale, setScale] = useState(1);
  const [scaledHeight, setScaledHeight] = useState(null);

  useLayoutEffect(() => {
    if (!enabled) return;

    const updateScale = () => {
      if (!containerRef.current || !innerRef.current) return;
      const availableWidth = containerRef.current.clientWidth;
      const sheetWidth = 794; // 210mm @ 96 DPI
      const innerHeight = innerRef.current.offsetHeight;

      if (availableWidth < sheetWidth && availableWidth > 0) {
        const targetWidth = Math.max(availableWidth - 8, 280);
        const nextScale = Math.min(1, targetWidth / sheetWidth);
        setScale(nextScale);
        setScaledHeight(Math.ceil(innerHeight * nextScale));
      } else {
        setScale(1);
        setScaledHeight(null);
      }
    };

    updateScale();

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined' && containerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        updateScale();
      });
      resizeObserver.observe(containerRef.current);
      if (innerRef.current) {
        resizeObserver.observe(innerRef.current);
      }
    }

    window.addEventListener('resize', updateScale);
    return () => {
      window.removeEventListener('resize', updateScale);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [enabled, children]);

  if (!enabled) {
    return <div className="invoice-sheet-container space-y-6">{children}</div>;
  }

  const isScaled = scale < 1;

  return (
    <div
      ref={containerRef}
      className="invoice-scale-outer w-full flex justify-center overflow-hidden"
    >
      <div
        className="invoice-scale-wrapper"
        style={{
          width: isScaled ? `${Math.round(794 * scale)}px` : '794px',
          height: isScaled && scaledHeight ? `${scaledHeight}px` : 'auto',
          overflow: isScaled ? 'hidden' : 'visible',
          transition: 'width 0.15s ease-out, height 0.15s ease-out',
        }}
      >
        <div
          ref={innerRef}
          className="invoice-scale-inner invoice-sheet-container space-y-6"
          style={{
            width: '794px',
            transform: isScaled ? `scale(${scale})` : 'none',
            transformOrigin: 'top left',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/**
 * Individual A4 Invoice Page Component.
 * Follows the exact layout, font sizes, sans-serif family, and alignment
 * of the user's Excel invoice (Book1 / Invoice 240/26-27).
 * - No outer border box around the page margins (clean whitespace).
 * - Sans-serif typography (Calibri, Arial, sans-serif).
 * - Clean CGST and SGST alignment integrated directly into table flow.
 * - Signatures positioned comfortably right below the declaration.
 */
export function InvoicePage({
  invoice,
  firmProfile,
  page,
  copyLabel = '',
}) {
  const firm = firmProfile || DEFAULT_FIRM;
  const isFirst = page?.isFirst ?? true;
  const isLast = page?.isLast ?? true;
  const lines = page?.lines || invoice?.lines || [];

  const rateGroups = isLast ? getRateGroupSummary(invoice?.lines || []) : [];
  const hsnSummary = isLast ? getHsnSummaryRows(invoice?.lines || []) : null;
  const isCancelled = invoice?.status === 'cancelled';

  // Spacer rows: for bills with 1-2 items, add 1-2 rows for natural proportion,
  // but keep 0 spacer rows for bills with 3+ items so the invoice is guaranteed to fit on 1 single A4 page.
  const emptyRowCount = isLast && lines.length <= 2 ? Math.max(0, 3 - lines.length) : 0;

  return (
    <div
      className="invoice-page box-border mx-auto relative overflow-hidden bg-white text-black"
      style={{
        width: '794px',
        maxWidth: '100%',
        minHeight: 'auto',
        padding: '0',
        fontSize: '12px',
        lineHeight: '1.3',
        backgroundColor: '#ffffff',
        color: '#000000',
        border: 'none',
        fontFamily: 'Calibri, Arial, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        pageBreakAfter: 'always',
        breakAfter: 'page',
        boxSizing: 'border-box',
      }}
    >
      {/* Optional Top Copy Label (e.g. ORIGINAL FOR RECIPIENT) */}
      {copyLabel ? (
        <div className="text-right pb-1 pr-1">
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 inline-block"
            style={{ border: '1px solid #000000', color: '#000000' }}
          >
            {copyLabel}
          </span>
        </div>
      ) : null}

      {/* CANCELLED Diagonal Watermark Stamp */}
      {isCancelled && (
        <div
          className="cancelled-watermark pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '40%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            border: '5px solid rgba(220, 38, 38, 0.45)',
            color: 'rgba(220, 38, 38, 0.45)',
            padding: '14px 40px',
            borderRadius: '12px',
            fontSize: '52px',
            fontWeight: '900',
            letterSpacing: '0.25em',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            zIndex: 35,
          }}
        >
          CANCELLED
        </div>
      )}

      {/* Main Invoice Box: Enclosed in 1px solid black border matching Excel */}
      <div
        className="invoice-table-wrapper"
        style={{
          border: '1px solid #000000',
          backgroundColor: '#ffffff',
        }}
      >
        {/* Full-Width TAX INVOICE Title Header Bar Matching Excel */}
        <div
          className="py-1 text-center"
          style={{
            borderBottom: '1px solid #000000',
            backgroundColor: '#ffffff',
          }}
        >
          <h1
            className="text-[14px] font-black uppercase tracking-wider m-0"
            style={{ color: '#000000' }}
          >
            TAX INVOICE
          </h1>
        </div>

        {/* 1. Header Grid: Left (Firm + Buyer) and Right (Details) */}
        <div className="flex" style={{ borderBottom: '1px solid #000000', display: 'flex' }}>
          {/* Left Column (58% width): Firm Profile on top, Buyer details below */}
          <div
            style={{
              width: '58%',
              borderRight: '1px solid #000000',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            {/* Firm Details */}
            <div className="p-2">
              <h2
                className="text-[14px] font-black uppercase tracking-wide leading-tight mb-1"
                style={{ color: '#000000', fontFamily: 'Arial, Calibri, sans-serif' }}
              >
                {firm.name || 'KHANSA ENTERPRISES'}
              </h2>
              <div
                className="text-[11.5px] whitespace-pre-line leading-tight font-medium"
                style={{ color: '#000000' }}
              >
                {firm.address}
              </div>
              <div className="text-[11.5px] font-semibold pt-1 leading-snug" style={{ color: '#000000' }}>
                <p>
                  <span className="font-bold">GSTIN/UIN:</span> {firm.gstin || '33AGXPF4947Q1ZH'}
                </p>
                {firm.email && (
                  <p>
                    <span className="font-bold">Email:</span> {firm.email}
                  </p>
                )}
                {firm.phone && (
                  <p>
                    <span className="font-bold">Cell:</span> {firm.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Buyer Section */}
            <div
              className="p-2"
              style={{
                borderTop: '1px solid #000000',
              }}
            >
              <span className="text-[11.5px] font-bold block" style={{ color: '#000000' }}>
                Buyer:
              </span>
              <p className="text-[12.5px] font-black uppercase leading-tight mb-0.5" style={{ color: '#000000' }}>
                {invoice.buyer_name}
              </p>
              <div
                className="text-[11.5px] whitespace-pre-line leading-tight font-medium"
                style={{ color: '#000000' }}
              >
                {invoice.buyer_address}
              </div>
              {invoice.buyer_gstin && (
                <p className="text-[11.5px] font-bold pt-1" style={{ color: '#000000' }}>
                  GSTIN: {invoice.buyer_gstin}
                </p>
              )}
            </div>
          </div>

          {/* Right Column (42% width): Reference Metadata Grid */}
          <div
            style={{
              width: '42%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              fontSize: '11.5px',
            }}
          >
            {/* Row 1: INVOICE No & Dated */}
            <div className="flex" style={{ borderBottom: '1px solid #000000', display: 'flex' }}>
              <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
                <span className="font-bold block" style={{ color: '#000000' }}>INVOICE No:</span>
                <span className="font-black text-[13px] block" style={{ color: '#000000' }}>
                  {invoice.invoice_no || '-'}
                </span>
              </div>
              <div className="w-1/2 p-1.5">
                <span className="font-bold block" style={{ color: '#000000' }}>Dated:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {formatDisplayDate(invoice.invoice_date) || '-'}
                </span>
              </div>
            </div>

            {/* Row 2: Buyer Order & Dated */}
            <div className="flex" style={{ borderBottom: '1px solid #000000', display: 'flex' }}>
              <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
                <span className="font-bold block" style={{ color: '#000000' }}>Buyer Order:</span>
                <span className="font-semibold block whitespace-pre-line" style={{ color: '#000000' }}>
                  {invoice.buyer_order_no || '-'}
                </span>
              </div>
              <div className="w-1/2 p-1.5">
                <span className="font-bold block" style={{ color: '#000000' }}>Dated:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {invoice.buyer_order_date || '-'}
                </span>
              </div>
            </div>

            {/* Row 3: Delivery No & Delivery Dt */}
            <div className="flex" style={{ borderBottom: '1px solid #000000', display: 'flex' }}>
              <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
                <span className="font-bold block" style={{ color: '#000000' }}>Delivery No:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {invoice.delivery_no || '-'}
                </span>
              </div>
              <div className="w-1/2 p-1.5">
                <span className="font-bold block" style={{ color: '#000000' }}>Delivery Dt:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {invoice.delivery_date ? formatDisplayDate(invoice.delivery_date) : '-'}
                </span>
              </div>
            </div>

            {/* Row 4: Despatched through & Destination */}
            <div className="flex" style={{ display: 'flex' }}>
              <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
                <span className="font-bold block" style={{ color: '#000000' }}>Despatched through:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {invoice.despatched_through || '-'}
                </span>
              </div>
              <div className="w-1/2 p-1.5">
                <span className="font-bold block" style={{ color: '#000000' }}>Destination:</span>
                <span className="font-semibold block" style={{ color: '#000000' }}>
                  {invoice.destination || '-'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 2. Line Items Table */}
        <table className="w-full border-collapse" style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              className="font-bold uppercase text-center"
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                borderBottom: '1px solid #000000',
              }}
            >
              <th className="py-1.5 px-1 w-[6%]" style={{ borderRight: '1px solid #000000' }}>SI. No</th>
              <th className="py-1.5 px-2 w-[42%] text-left" style={{ borderRight: '1px solid #000000' }}>Description of Goods</th>
              <th className="py-1.5 px-1 w-[12%]" style={{ borderRight: '1px solid #000000' }}>HSN/SAC</th>
              <th className="py-1.5 px-1 w-[8%]" style={{ borderRight: '1px solid #000000' }}>TAX%</th>
              <th className="py-1.5 px-1 w-[9%] text-right" style={{ borderRight: '1px solid #000000' }}>Quantity</th>
              <th className="py-1.5 px-1 w-[10%] text-right" style={{ borderRight: '1px solid #000000' }}>Rate</th>
              <th className="py-1.5 px-1 w-[4%]" style={{ borderRight: '1px solid #000000' }}>Per</th>
              <th className="py-1.5 px-2 w-[9%] text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => {
              const lineNo = line.line_no !== undefined ? line.line_no : idx + 1;
              const amountPaise = Number(
                line.amount_paise !== undefined && line.amount_paise !== null
                  ? line.amount_paise
                  : Math.round(((line.qty_milli || 0) * (line.rate_paise || 0)) / 1000)
              );

              return (
                <tr
                  key={line.id || idx}
                  style={{
                    color: '#000000',
                  }}
                >
                  <td className="py-1 px-1 text-center font-bold" style={{ borderRight: '1px solid #000000' }}>
                    {lineNo}
                  </td>
                  <td className="py-1 px-2 text-left font-semibold" style={{ borderRight: '1px solid #000000' }}>
                    {line.description}
                  </td>
                  <td className="py-1 px-1 text-center font-mono font-medium" style={{ borderRight: '1px solid #000000' }}>
                    {line.hsn || '-'}
                  </td>
                  <td className="py-1 px-1 text-center font-semibold" style={{ borderRight: '1px solid #000000' }}>
                    {line.gst_percent !== undefined ? `${line.gst_percent}%` : '-'}
                  </td>
                  <td className="py-1 px-1 text-right font-semibold" style={{ borderRight: '1px solid #000000' }}>
                    {formatMilliToQuantity(line.qty_milli)}
                  </td>
                  <td className="py-1 px-1 text-right font-semibold" style={{ borderRight: '1px solid #000000' }}>
                    {formatPlainAmount(line.rate_paise)}
                  </td>
                  <td className="py-1 px-1 text-center lowercase font-bold" style={{ borderRight: '1px solid #000000' }}>
                    {String(line.unit || 'nos').toLowerCase()}
                  </td>
                  <td className="py-1 px-2 text-right font-bold">
                    {formatPlainAmount(amountPaise)}
                  </td>
                </tr>
              );
            })}

            {/* Spacer Rows to maintain clean proportions like the user's Excel sheet */}
            {emptyRowCount > 0 && Array.from({ length: emptyRowCount }).map((_, rIdx) => (
              <tr key={`empty-${rIdx}`} style={{ height: '22px' }}>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000' }}>&nbsp;</td>
                <td>&nbsp;</td>
              </tr>
            ))}

            {/* Intermediate Page Continuation Message */}
            {!isLast && (
              <tr>
                <td
                  colSpan="8"
                  className="py-4 text-center font-bold italic"
                  style={{ color: '#6b7280' }}
                >
                  ... Continued on Next Page (Page {page.pageNumber + 1} of {page.totalPages}) ...
                </td>
              </tr>
            )}

            {/* Final Page: Clean CGST & SGST Rows integrated directly beneath line items */}
            {isLast && rateGroups.map((group) => (
              <React.Fragment key={group.gstPercent}>
                <tr
                  style={{
                    color: '#000000',
                    fontWeight: 600,
                  }}
                >
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-2 font-bold" style={{ borderRight: '1px solid #000000' }}>CGST</td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-1 text-center font-semibold" style={{ borderRight: '1px solid #000000' }}>{group.cgstRate}%</td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-2 text-right font-bold">
                    {formatPlainAmount(group.cgstPaise)}
                  </td>
                </tr>
                <tr
                  style={{
                    color: '#000000',
                    fontWeight: 600,
                  }}
                >
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-2 font-bold" style={{ borderRight: '1px solid #000000' }}>SGST</td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-1 text-center font-semibold" style={{ borderRight: '1px solid #000000' }}>{group.sgstRate}%</td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-2 text-right font-bold">
                    {formatPlainAmount(group.sgstPaise)}
                  </td>
                </tr>
              </React.Fragment>
            ))}

            {/* Final Page: Grand Total Row right at the bottom of the items table */}
            {isLast && (
              <tr
                className="font-black"
                style={{
                  borderTop: '1px solid #000000',
                  color: '#000000',
                  fontSize: '13px',
                }}
              >
                <td
                  colSpan="7"
                  className="py-1.5 px-2 text-left uppercase font-black"
                  style={{ borderRight: '1px solid #000000' }}
                >
                  Grand Total(round off)
                </td>
                <td className="py-1.5 px-2 text-right font-black">
                  {formatPlainAmount(invoice.payable_paise)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 3. Amount in Words Row */}
        {isLast && (
          <div
            className="p-1.5 flex items-baseline text-[12px]"
            style={{
              borderTop: '1px solid #000000',
              borderBottom: '1px solid #000000',
            }}
          >
            <span className="font-bold mr-2 whitespace-nowrap" style={{ color: '#000000' }}>
              Amount in words:
            </span>
            <span className="font-bold uppercase" style={{ color: '#000000' }}>
              {invoice.amount_in_words || (invoice.payable_paise != null ? numberToWordsIndian(invoice.payable_paise) : '')}
            </span>
          </div>
        )}

        {/* 4. HSN/SAC Summary Table with 2-level headers matching Image 2 */}
        {isLast && (
          <div style={{ borderBottom: '1px solid #000000' }}>
            <table className="w-full border-collapse" style={{ fontSize: '11.5px', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  className="font-bold text-center"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                  }}
                >
                  <th
                    rowSpan="2"
                    className="py-1 px-1.5 w-[20%] text-center font-bold"
                    style={{ borderRight: '1px solid #000000', verticalAlign: 'middle' }}
                  >
                    HSN/SAC
                  </th>
                  <th
                    rowSpan="2"
                    className="py-1 px-2 w-[22%] text-right font-bold"
                    style={{ borderRight: '1px solid #000000', verticalAlign: 'middle' }}
                  >
                    Taxable Value
                  </th>
                  <th
                    colSpan="2"
                    className="py-0.5 px-1 w-[29%] text-center font-bold"
                    style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}
                  >
                    Central Tax
                  </th>
                  <th
                    colSpan="2"
                    className="py-0.5 px-1 w-[29%] text-center font-bold"
                    style={{ borderBottom: '1px solid #000000' }}
                  >
                    State Tax
                  </th>
                </tr>
                <tr
                  className="font-bold text-center"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                  }}
                >
                  <th className="py-0.5 px-1 w-[12%] text-center" style={{ borderRight: '1px solid #000000' }}>
                    Rate
                  </th>
                  <th className="py-0.5 px-2 w-[17%] text-right" style={{ borderRight: '1px solid #000000' }}>
                    Amount
                  </th>
                  <th className="py-0.5 px-1 w-[12%] text-center" style={{ borderRight: '1px solid #000000' }}>
                    Rate
                  </th>
                  <th className="py-0.5 px-2 w-[17%] text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {hsnSummary?.rows.map((row) => (
                  <tr
                    key={`${row.hsn}_${row.gstPercent}`}
                    style={{
                      color: '#000000',
                    }}
                  >
                    <td className="py-1 px-1.5 text-center font-medium" style={{ borderRight: '1px solid #000000' }}>
                      {row.hsn}
                    </td>
                    <td className="py-1 px-2 text-right font-medium" style={{ borderRight: '1px solid #000000' }}>
                      {formatPlainAmount(row.taxablePaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-medium" style={{ borderRight: '1px solid #000000' }}>
                      {row.centralRate}%
                    </td>
                    <td className="py-1 px-2 text-right font-medium" style={{ borderRight: '1px solid #000000' }}>
                      {formatPlainAmount(row.centralTaxPaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-medium" style={{ borderRight: '1px solid #000000' }}>
                      {row.stateRate}%
                    </td>
                    <td className="py-1 px-2 text-right font-medium">
                      {formatPlainAmount(row.stateTaxPaise)}
                    </td>
                  </tr>
                ))}

                {/* HSN Total Row */}
                <tr
                  className="font-bold"
                  style={{
                    borderTop: '1px solid #000000',
                    color: '#000000',
                  }}
                >
                  <td className="py-1 px-2 text-left uppercase font-bold" style={{ borderRight: '1px solid #000000' }}>
                    Total(round off)
                  </td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-2 text-right font-bold">
                    {formatPlainAmount(hsnSummary?.totalTaxPaise)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Amount in words for Tax */}
            <div
              className="p-1.5 flex items-baseline text-[11.5px]"
              style={{ borderTop: '1px solid #000000' }}
            >
              <span className="font-bold mr-2 whitespace-nowrap" style={{ color: '#000000' }}>
                Amount in words:
              </span>
              <span className="font-bold uppercase" style={{ color: '#000000' }}>
                {hsnSummary?.taxInWords}
              </span>
            </div>
          </div>
        )}

        {/* 5. Declaration Box */}
        <div
          className="p-1.5 text-[11px] leading-tight"
          style={{
            borderBottom: '1px solid #000000',
            color: '#000000',
          }}
        >
          <span className="font-bold" style={{ color: '#000000' }}>Declaration: </span>
          {firm.declaration || DEFAULT_FIRM.declaration}
        </div>

        {/* 6. Signature Block: Sits comfortably right below the declaration matching Excel */}
        <div className="p-2.5 bg-white" style={{ minHeight: '75px' }}>
          {/* Top of Signature: "For Khansa Enterprises" right-aligned */}
          <div className="text-right mb-5">
            <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: '#000000' }}>
              For {firm.name || 'Khansa Enterprises'}
            </span>
          </div>

          {/* Bottom of Signature: Customers Seal and Signature (left) & Authorised Signature (right) */}
          <div className="flex justify-between items-end">
            <div className="text-left">
              <p className="text-[11.5px] font-bold uppercase" style={{ color: '#000000' }}>
                Customers Seal and Signature
              </p>
            </div>

            <div className="text-right">
              <p className="text-[11.5px] font-bold uppercase" style={{ color: '#000000' }}>
                Authorised Signature
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Page number footer if multi-page */}
      {page && page.totalPages > 1 && (
        <div
          className="pt-2 text-center text-[10px] font-mono"
          style={{ color: '#6b7280' }}
        >
          Page {page.pageNumber} of {page.totalPages}
        </div>
      )}
    </div>
  );
}

/**
 * Main InvoiceSheet component that paginates invoice lines across pages
 * and renders the full set of pages.
 * Supports auto-scaling on mobile devices when scaleToFit is true.
 */
export default function InvoiceSheet({
  invoice,
  firmProfile,
  copyLabel = '',
  scaleToFit = true,
}) {
  if (!invoice) return null;

  // Split lines into pages
  const pages = paginateInvoiceLines(invoice.lines || []);

  const content = pages.map((p) => (
    <InvoicePage
      key={p.pageNumber}
      invoice={invoice}
      firmProfile={firmProfile}
      page={p}
      copyLabel={copyLabel}
    />
  ));

  return (
    <ScaledSheetWrapper enabled={scaleToFit}>
      {content}
    </ScaledSheetWrapper>
  );
}
