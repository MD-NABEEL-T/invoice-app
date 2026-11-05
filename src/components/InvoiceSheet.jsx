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

  // Minimum 5 item rows padded with empty boxed cells matching Excel Book1.xlsx
  const minRows = isLast ? Math.max(5, lines.length) : lines.length;
  const emptyRowCount = minRows - lines.length;

  return (
    <div
      className="invoice-page box-border mx-auto relative overflow-hidden bg-white text-black"
      style={{
        width: '794px',
        maxWidth: '100%',
        minHeight: '1123px',
        padding: '24px 24px',
        fontSize: '11pt',
        lineHeight: '1.3',
        backgroundColor: '#ffffff',
        color: '#000000',
        border: 'none',
        fontFamily: 'Carlito, Calibri, Arial, sans-serif',
        pageBreakAfter: 'always',
        breakAfter: 'page',
        boxSizing: 'border-box',
        boxShadow: '0 8px 30px rgba(0, 0, 0, 0.12)',
      }}
    >
      {/* Optional Top Copy Label (e.g. ORIGINAL FOR RECIPIENT) */}
      {copyLabel ? (
        <div className="text-right pb-1 pr-1">
          <span
            className="text-[9pt] font-bold uppercase tracking-wider px-2 py-0.5 inline-block"
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
        {/* Row 1: Full-Width TAX INVOICE Title Header Bar Matching Excel */}
        <div
          className="py-1 text-center"
          style={{
            borderBottom: '1px solid #000000',
            backgroundColor: '#ffffff',
          }}
        >
          <h1
            className="text-[14pt] font-bold uppercase tracking-wider m-0 leading-tight"
            style={{ color: '#000000' }}
          >
            TAX INVOICE
          </h1>
        </div>

        {/* Rows 2-6 Header Block: Left (A:B = 32.39%) and Right (C:H = 67.61%) */}
        <div className="flex" style={{ borderBottom: '1px solid #000000', display: 'flex' }}>
          {/* Left Column A:B (32.39% width): Firm Profile (Rows 2-4) and Buyer Details (Rows 5-6) */}
          <div
            style={{
              width: '32.39%',
              borderRight: '1px solid #000000',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            {/* Rows 2-4: Firm Details (Centered, bold, top-aligned) */}
            <div className="p-2 text-center" style={{ minHeight: '170px' }}>
              <h2
                className="text-[15pt] font-bold uppercase tracking-wide leading-tight mb-1"
                style={{ color: '#000000' }}
              >
                {firm.name || 'KHANSA ENTERPRISES'}
              </h2>
              <div
                className="text-[11pt] whitespace-pre-line leading-tight font-bold"
                style={{ color: '#000000' }}
              >
                {firm.address}
              </div>
              <div className="text-[11pt] font-bold pt-1 leading-snug" style={{ color: '#000000' }}>
                <p>GSTIN/UIN:{firm.gstin || '33AGXPF4947Q1ZH'}</p>
                {firm.email && (
                  <p className="text-[10pt] font-bold">
                    Email:{firm.email}
                  </p>
                )}
                {firm.phone && (
                  <p className="text-[11pt] font-bold">
                    Cell:{firm.phone}
                  </p>
                )}
              </div>
            </div>

            {/* Rows 5-6: Buyer Section (Boxed, bold, centered with "Buyer:" alone on first line) */}
            <div
              className="p-2"
              style={{
                borderTop: '1px solid #000000',
                minHeight: '142px',
              }}
            >
              <span className="text-[11pt] font-bold block text-left" style={{ color: '#000000' }}>
                Buyer:
              </span>
              <div className="text-center pt-1">
                <p className="text-[13pt] font-bold uppercase leading-tight mb-1" style={{ color: '#000000' }}>
                  {invoice.buyer_name}
                </p>
                <div
                  className="text-[11pt] whitespace-pre-line leading-tight font-bold"
                  style={{ color: '#000000' }}
                >
                  {invoice.buyer_address}
                </div>
                {invoice.buyer_gstin && (
                  <p className="text-[11pt] font-bold pt-1" style={{ color: '#000000' }}>
                    GSTIN:{invoice.buyer_gstin}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column C:H (67.61% width): 4 boxed cells per row [C][D:E][F][G:H] */}
          <div
            style={{
              width: '67.61%',
              display: 'flex',
              flexDirection: 'column',
              fontSize: '11pt',
            }}
          >
            {/* Row 2: INVOICE No: (11pt bold) | no (14pt bold) ; Dated: (11pt bold) | date (13pt bold) */}
            <div className="flex font-bold" style={{ borderBottom: '1px solid #000000', minHeight: '66px', display: 'flex' }}>
              <div className="p-1.5 text-[11pt]" style={{ width: '17.99%', borderRight: '1px solid #000000' }}>
                INVOICE No:
              </div>
              <div className="p-1.5 text-[14pt]" style={{ width: '27.89%', borderRight: '1px solid #000000' }}>
                {invoice.invoice_no || '-'}
              </div>
              <div className="p-1.5 text-[11pt]" style={{ width: '15.67%', borderRight: '1px solid #000000' }}>
                Dated:
              </div>
              <div className="p-1.5 text-[13pt]" style={{ width: '38.45%' }}>
                {formatDisplayDate(invoice.invoice_date) || '-'}
              </div>
            </div>

            {/* Row 3: Buyer Order: (11pt bold) | order no (12pt bold) ; Dated: (11pt bold) | date (12pt bold) - hidden if empty */}
            <div className="flex font-bold" style={{ borderBottom: '1px solid #000000', minHeight: '66px', display: 'flex' }}>
              <div className="p-1.5 text-[11pt]" style={{ width: '17.99%', borderRight: '1px solid #000000' }}>
                {invoice.buyer_order_no ? 'Buyer Order:' : ''}
              </div>
              <div className="p-1.5 text-[12pt] whitespace-pre-line" style={{ width: '27.89%', borderRight: '1px solid #000000' }}>
                {invoice.buyer_order_no || ''}
              </div>
              <div className="p-1.5 text-[11pt]" style={{ width: '15.67%', borderRight: '1px solid #000000' }}>
                {invoice.buyer_order_no && invoice.buyer_order_date ? 'Dated:' : ''}
              </div>
              <div className="p-1.5 text-[12pt] whitespace-pre-line" style={{ width: '38.45%' }}>
                {invoice.buyer_order_no && invoice.buyer_order_date
                  ? invoice.buyer_order_date.split('\n').map((d) => formatDisplayDate(d) || d).join('\n')
                  : ''}
              </div>
            </div>

            {/* Row 4: Delivery No: (11pt bold) | no (12pt bold) ; Delivery Dt: (11pt bold) | date (12pt bold) */}
            <div className="flex font-bold" style={{ borderBottom: '1px solid #000000', minHeight: '38px', display: 'flex' }}>
              <div className="p-1.5 text-[11pt]" style={{ width: '17.99%', borderRight: '1px solid #000000' }}>
                Delivery No:
              </div>
              <div className="p-1.5 text-[12pt]" style={{ width: '27.89%', borderRight: '1px solid #000000' }}>
                {invoice.delivery_no || '-'}
              </div>
              <div className="p-1.5 text-[11pt]" style={{ width: '15.67%', borderRight: '1px solid #000000' }}>
                Delivery Dt:
              </div>
              <div className="p-1.5 text-[12pt]" style={{ width: '38.45%' }}>
                {invoice.delivery_date ? formatDisplayDate(invoice.delivery_date) : '-'}
              </div>
            </div>

            {/* Row 5: Despatched through: (11pt bold) | value (12pt bold) ; Destination: (11pt bold) | value (12pt bold) */}
            <div className="flex font-bold" style={{ borderBottom: '1px solid #000000', minHeight: '66px', display: 'flex' }}>
              <div className="p-1.5 text-[11pt]" style={{ width: '17.99%', borderRight: '1px solid #000000' }}>
                Despatched through:
              </div>
              <div className="p-1.5 text-[12pt]" style={{ width: '27.89%', borderRight: '1px solid #000000' }}>
                {invoice.despatched_through || '-'}
              </div>
              <div className="p-1.5 text-[11pt]" style={{ width: '15.67%', borderRight: '1px solid #000000' }}>
                Destination:
              </div>
              <div className="p-1.5 text-[12pt]" style={{ width: '38.45%' }}>
                {invoice.destination || '-'}
              </div>
            </div>

            {/* Row 6: Terms of Delivery: (C:H merged, 11pt bold, centered, top-aligned) */}
            <div className="p-1.5 text-center font-bold text-[11pt]" style={{ minHeight: '76px' }}>
              <div>Terms of Delivery:</div>
              {invoice.terms_of_delivery && (
                <div className="font-normal text-[11pt] pt-1 whitespace-pre-line">
                  {invoice.terms_of_delivery}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 2. Line Items Table with Exact 8-Column Percentage Grid */}
        <table className="w-full border-collapse" style={{ fontSize: '12pt', borderCollapse: 'collapse' }}>
          <thead>
            <tr
              className="font-bold text-center text-[11.5pt]"
              style={{
                backgroundColor: '#ffffff',
                color: '#000000',
                borderBottom: '1px solid #000000',
                height: '36px',
              }}
            >
              <th style={{ width: '9.22%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>SI. No</th>
              <th style={{ width: '23.16%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>Description of Goods</th>
              <th style={{ width: '12.16%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>HSN/SAC</th>
              <th style={{ width: '5.63%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>TAX%</th>
              <th style={{ width: '13.23%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>Quantity</th>
              <th style={{ width: '10.59%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>Rate</th>
              <th style={{ width: '10.69%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>Per</th>
              <th style={{ width: '15.31%', borderBottom: '1px solid #000000' }}>Amount</th>
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
                    borderBottom: '1px solid #000000',
                    minHeight: '32px',
                  }}
                >
                  <td className="py-1 px-1 text-center font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {lineNo}
                  </td>
                  <td className="py-1 px-2 text-left font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {line.description}
                  </td>
                  <td className="py-1 px-1 text-center font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {line.hsn || '-'}
                  </td>
                  <td className="py-1 px-1 text-right font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {line.gst_percent !== undefined ? `${line.gst_percent}%` : '-'}
                  </td>
                  <td className="py-1 px-1 text-right font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {formatMilliToQuantity(line.qty_milli)}
                  </td>
                  <td className="py-1 px-1 text-right font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {formatPlainAmount(line.rate_paise)}
                  </td>
                  <td className="py-1 px-1 text-left lowercase font-normal" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    {String(line.unit || 'nos').toLowerCase()}
                  </td>
                  <td className="py-1 px-2 text-right font-normal" style={{ borderBottom: '1px solid #000000' }}>
                    {formatPlainAmount(amountPaise)}
                  </td>
                </tr>
              );
            })}

            {/* Spacer Rows: Pad so bill has at least 5 boxed rows matching Excel (min 8mm / 32px each) */}
            {emptyRowCount > 0 && Array.from({ length: emptyRowCount }).map((_, rIdx) => (
              <tr key={`empty-${rIdx}`} style={{ height: '32px', borderBottom: '1px solid #000000' }}>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderBottom: '1px solid #000000' }}>&nbsp;</td>
              </tr>
            ))}

            {/* Intermediate Page Continuation Message */}
            {!isLast && (
              <tr style={{ borderBottom: '1px solid #000000' }}>
                <td
                  colSpan="8"
                  className="py-4 text-center font-bold text-[11pt]"
                  style={{ color: '#000000', borderBottom: '1px solid #000000' }}
                >
                  ... Continued on Next Page (Page {page.pageNumber + 1} of {page.totalPages}) ...
                </td>
              </tr>
            )}

            {/* Final Page: Clean CGST & SGST Rows (12pt, min 8mm) immediately after items, all boxed */}
            {isLast && rateGroups.map((group) => (
              <React.Fragment key={group.gstPercent}>
                <tr
                  style={{
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                    height: '32px',
                  }}
                >
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-left font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>CGST</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-1 text-right font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>{group.cgstRate}%</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-right font-normal text-[12pt]" style={{ borderBottom: '1px solid #000000' }}>
                    {formatPlainAmount(group.cgstPaise)}
                  </td>
                </tr>
                <tr
                  style={{
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                    height: '32px',
                  }}
                >
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-left font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>SGST</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-1 text-right font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>{group.sgstRate}%</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-right font-normal text-[12pt]" style={{ borderBottom: '1px solid #000000' }}>
                    {formatPlainAmount(group.sgstPaise)}
                  </td>
                </tr>
              </React.Fragment>
            ))}

            {/* Freight row (if freight_paise > 0) */}
            {isLast && Number(invoice.freight_paise) > 0 && (
              <tr style={{ borderBottom: '1px solid #000000', height: '32px' }}>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td className="py-1 px-2 text-left font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                  Freight Charges
                </td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                <td className="py-1 px-2 text-right font-normal text-[12pt]" style={{ borderBottom: '1px solid #000000' }}>
                  {formatPlainAmount(invoice.freight_paise)}
                </td>
              </tr>
            )}

            {/* Round Off row (+/- paise) */}
            {isLast && (() => {
              const freight = Number(invoice.freight_paise) || 0;
              const totalTax = rateGroups.reduce((acc, g) => acc + (g.cgstPaise || 0) + (g.sgstPaise || 0), 0);
              const lineTaxableSum = (invoice.lines || []).reduce((acc, l) => {
                const q = l.qty_milli || 0;
                const r = l.rate_paise || 0;
                return acc + (l.amount_paise != null ? Number(l.amount_paise) : Math.round((q * r) / 1000));
              }, 0);
              const subtotalBeforeRound = lineTaxableSum + totalTax + freight;
              const ro = invoice.round_off_paise != null
                ? Number(invoice.round_off_paise)
                : (invoice.payable_paise != null ? (Number(invoice.payable_paise) - subtotalBeforeRound) : 0);

              if (ro === 0) return null;
              const sign = ro > 0 ? '+' : '';
              return (
                <tr style={{ borderBottom: '1px solid #000000', height: '32px' }}>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-left font-normal text-[12pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    Round Off
                  </td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>&nbsp;</td>
                  <td className="py-1 px-2 text-right font-normal text-[12pt]" style={{ borderBottom: '1px solid #000000' }}>
                    {sign}{(ro / 100).toFixed(2)}
                  </td>
                </tr>
              );
            })()}

            {/* Final Page: Grand Total Row (A:B 12pt bold centered, C:H 14pt bold right-aligned) */}
            {isLast && (
              <tr
                className="font-bold"
                style={{
                  borderTop: '1px solid #000000',
                  borderBottom: '1px solid #000000',
                  color: '#000000',
                  height: '32px',
                }}
              >
                <td
                  colSpan="2"
                  className="py-1 px-2 text-center font-bold text-[12pt]"
                  style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}
                >
                  Grand Total(round off)
                </td>
                <td colSpan="6" className="py-1 px-2 text-right font-bold text-[14pt]" style={{ borderBottom: '1px solid #000000' }}>
                  {formatPlainAmount(invoice.payable_paise)}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {/* 3. Amount in Words Row (A:B 11pt bold, C:H 11.5pt bold, top and bottom borders only) */}
        {isLast && (
          <div
            className="p-2 flex items-baseline text-[11pt]"
            style={{
              borderTop: '1px solid #000000',
              borderBottom: '1px solid #000000',
            }}
          >
            <div style={{ width: '32.39%' }} className="font-bold text-[11pt] whitespace-nowrap">
              Amount in words:
            </div>
            <div style={{ width: '67.61%' }} className="font-bold text-[11.5pt] uppercase leading-snug">
              {invoice.amount_in_words || (invoice.payable_paise != null ? numberToWordsIndian(invoice.payable_paise) : '')}
            </div>
          </div>
        )}

        {/* 4. HSN/SAC Summary Table with 2-level headers matching Excel */}
        {isLast && (
          <div>
            <table className="w-full border-collapse" style={{ fontSize: '11pt', borderCollapse: 'collapse' }}>
              <thead>
                <tr
                  className="font-bold text-center text-[11pt]"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    height: '32px',
                  }}
                >
                  <th
                    rowSpan="2"
                    style={{ width: '9.22%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000', verticalAlign: 'middle' }}
                  >
                    HSN/SAC
                  </th>
                  <th
                    rowSpan="2"
                    style={{ width: '23.16%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000', verticalAlign: 'middle' }}
                  >
                    Taxable Value
                  </th>
                  <th
                    colSpan="2"
                    style={{ width: '31.02%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}
                  >
                    Central Tax
                  </th>
                  <th
                    colSpan="2"
                    style={{ width: '36.60%', borderBottom: '1px solid #000000' }}
                  >
                    State Tax
                  </th>
                </tr>
                <tr
                  className="font-bold text-center text-[11pt]"
                  style={{
                    backgroundColor: '#ffffff',
                    color: '#000000',
                    height: '32px',
                  }}
                >
                  <th style={{ width: '12.16%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    Rate
                  </th>
                  <th style={{ width: '18.86%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    Amount
                  </th>
                  <th style={{ width: '10.59%', borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    Rate
                  </th>
                  <th style={{ width: '26.01%', borderBottom: '1px solid #000000' }}>
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
                      borderBottom: '1px solid #000000',
                      height: '32px',
                    }}
                  >
                    <td className="py-1 px-1 text-center font-normal text-[11pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                      {row.hsn}
                    </td>
                    <td className="py-1 px-2 text-right font-normal text-[11pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                      {formatPlainAmount(row.taxablePaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-normal text-[11pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                      {row.centralRate}%
                    </td>
                    <td className="py-1 px-2 text-center font-normal text-[11pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                      {formatPlainAmount(row.centralTaxPaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-normal text-[11pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                      {row.stateRate}%
                    </td>
                    <td className="py-1 px-2 text-center font-normal text-[11pt]" style={{ borderBottom: '1px solid #000000' }}>
                      {formatPlainAmount(row.stateTaxPaise)}
                    </td>
                  </tr>
                ))}

                {/* HSN Total Row (11.5pt regular label, 11.5pt bold tax) */}
                <tr
                  style={{
                    borderTop: '1px solid #000000',
                    borderBottom: '1px solid #000000',
                    color: '#000000',
                    height: '32px',
                  }}
                >
                  <td colSpan="5" className="py-1 px-2 text-left font-normal text-[11.5pt]" style={{ borderRight: '1px solid #000000', borderBottom: '1px solid #000000' }}>
                    Total(round off)
                  </td>
                  <td className="py-1 px-2 text-center font-bold text-[11.5pt]" style={{ borderBottom: '1px solid #000000' }}>
                    {formatPlainAmount(hsnSummary?.totalTaxPaise)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Amount in words for Tax (Top border only, 11pt bold label, 11.5pt bold text) */}
            <div
              className="p-2 flex items-baseline text-[11pt]"
              style={{ borderTop: '1px solid #000000' }}
            >
              <div style={{ width: '32.39%' }} className="font-bold text-[11pt] whitespace-nowrap">
                Amount in words
              </div>
              <div style={{ width: '67.61%' }} className="font-bold text-[11.5pt] uppercase leading-snug">
                {hsnSummary?.taxInWords}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* FOOTER (Strictly outside table box, NO borders) */}
      {isLast && (
        <div className="pt-3 text-black">
          {/* Declaration: 11pt left */}
          <div className="text-[11pt] leading-tight pb-3 font-normal">
            Declaration: {firm.declaration || DEFAULT_FIRM.declaration}
          </div>

          {/* For Khansa Enterprises: right-aligned, 11.5pt semibold */}
          <div className="text-right text-[11.5pt] font-semibold">
            For {firm.name || 'Khansa Enterprises'}
          </div>

          {/* ~16mm blank space for signing */}
          <div style={{ height: '60px' }}></div>

          {/* Signatures: 12pt bold */}
          <div className="flex justify-between items-end text-[12pt] font-bold">
            <div>Customers Seal and Signature</div>
            <div>Authorised Signatory</div>
          </div>
        </div>
      )}

      {/* Page number footer if multi-page */}
      {page && page.totalPages > 1 && (
        <div
          className="pt-2 text-center text-[9pt] font-mono"
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
