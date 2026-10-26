import React, { useRef, useState, useLayoutEffect } from 'react';
import {
  formatPlainAmount,
  getRateGroupSummary,
  getHsnSummaryRows,
  paginateInvoiceLines,
} from '../lib/invoiceLayout.js';
import { formatMilliToQuantity } from '../lib/billPayload.js';
import { formatDisplayDate } from '../lib/billUtils.js';

const DEFAULT_FIRM = {
  name: 'KHANSA ENTERPRISES',
  address: '#158,Pudhupet 3rd Street,\nMELVISHARAM-632509\nRanipet District\nTamil Nadu.',
  phone: '8300533896, 9342614838',
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
        // Leave 8px padding total (4px on each side)
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
 * Follows the legacy Excel layout (SINGLE FORMAT.xlsm and 2BILLTAX FORMAT.xlsm).
 * Uses strictly plain hex/rgb color values to avoid modern color-space errors.
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

  return (
    <div
      className="invoice-page font-serif box-border mx-auto relative overflow-hidden"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '0',
        fontSize: '11px',
        lineHeight: '1.25',
        backgroundColor: '#ffffff',
        color: '#000000',
        border: '2px solid #000000',
        fontFamily: '"Times New Roman", Times, Georgia, serif',
        pageBreakAfter: 'always',
        breakAfter: 'page',
      }}
    >
      {/* Light "KHANSA" Watermark */}
      <div
        className="khansa-watermark pointer-events-none select-none"
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%) rotate(-30deg)',
          fontSize: '96px',
          fontWeight: '900',
          letterSpacing: '0.22em',
          color: 'rgba(0, 0, 0, 0.045)',
          zIndex: 1,
          whiteSpace: 'nowrap',
          fontFamily: '"Times New Roman", Times, Georgia, serif',
        }}
      >
        KHANSA
      </div>

      {/* CANCELLED Diagonal Watermark Stamp */}
      {isCancelled && (
        <div
          className="cancelled-watermark pointer-events-none select-none"
          style={{
            position: 'absolute',
            top: '46%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-30deg)',
            border: '6px solid rgba(220, 38, 38, 0.42)',
            color: 'rgba(220, 38, 38, 0.42)',
            padding: '16px 48px',
            borderRadius: '16px',
            fontSize: '56px',
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

      {/* 1. Header Bar: TAX INVOICE & Optional Copy Label */}
      <div
        className="flex items-center justify-between px-3 py-1.5"
        style={{ borderBottom: '1px solid #000000' }}
      >
        <div className="w-1/3"></div>
        <div className="w-1/3 text-center">
          <h1
            className="text-base font-black tracking-wider uppercase m-0"
            style={{ color: '#000000' }}
          >
            TAX INVOICE
          </h1>
        </div>
        <div className="w-1/3 text-right">
          {copyLabel ? (
            <span
              className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 inline-block"
              style={{ border: '1px solid #000000', color: '#000000' }}
            >
              {copyLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* CANCELLED Top Banner */}
      {isCancelled && (
        <div
          className="cancelled-banner"
          style={{
            backgroundColor: '#fee2e2',
            color: '#991b1b',
            borderBottom: '2px solid #dc2626',
            padding: '4px 8px',
            textAlign: 'center',
            fontSize: '11px',
            fontWeight: '900',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          *** THIS INVOICE IS CANCELLED &amp; VOID ***
        </div>
      )}

      {/* 2. Top Section: Firm Profile (Left) and Invoice Metadata (Right) */}
      <div className="flex" style={{ borderBottom: '1px solid #000000' }}>
        {/* Left: Firm Profile */}
        <div
          className="w-7/12 p-2.5 flex flex-col justify-between"
          style={{ borderRight: '1px solid #000000' }}
        >
          <div>
            <h2
              className="text-sm font-black uppercase tracking-wide leading-tight mb-1"
              style={{ color: '#000000' }}
            >
              {firm.name || 'KHANSA ENTERPRISES'}
            </h2>
            <p
              className="text-[10px] whitespace-pre-line leading-snug font-medium mb-1.5"
              style={{ color: '#1f2937' }}
            >
              {firm.address}
            </p>
          </div>
          <div
            className="text-[10px] space-y-0.5 font-semibold pt-1"
            style={{
              color: '#111827',
              borderTop: '1px dotted #9ca3af',
            }}
          >
            <p className="font-mono font-bold">
              GSTIN/UIN: <span className="font-black" style={{ color: '#000000' }}>{firm.gstin}</span>
            </p>
            {firm.email && <p>Email: {firm.email}</p>}
            {firm.phone && <p>Cell: {firm.phone}</p>}
          </div>
        </div>

        {/* Right: Invoice Reference Metadata */}
        <div className="w-5/12 flex flex-col justify-between text-[10px]">
          {/* Invoice No & Date */}
          <div className="flex" style={{ borderBottom: '1px solid #000000' }}>
            <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
              <span className="font-bold block" style={{ color: '#4b5563' }}>INVOICE No:</span>
              <span className="font-mono font-black text-xs block" style={{ color: '#000000' }}>
                {invoice.invoice_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block" style={{ color: '#4b5563' }}>Dated:</span>
              <span className="font-mono font-bold block" style={{ color: '#000000' }}>
                {formatDisplayDate(invoice.invoice_date) || '-'}
              </span>
            </div>
          </div>

          {/* Buyer Order & Date */}
          <div className="flex" style={{ borderBottom: '1px solid #000000' }}>
            <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
              <span className="font-bold block" style={{ color: '#4b5563' }}>Buyer Order:</span>
              <span className="font-semibold block" style={{ color: '#000000' }}>
                {invoice.buyer_order_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block" style={{ color: '#4b5563' }}>Dated:</span>
              <span className="font-semibold block" style={{ color: '#000000' }}>
                {invoice.buyer_order_date || '-'}
              </span>
            </div>
          </div>

          {/* Delivery No & Date */}
          <div className="flex">
            <div className="w-1/2 p-1.5" style={{ borderRight: '1px solid #000000' }}>
              <span className="font-bold block" style={{ color: '#4b5563' }}>Delivery No:</span>
              <span className="font-semibold block" style={{ color: '#000000' }}>
                {invoice.delivery_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block" style={{ color: '#4b5563' }}>Delivery Dt:</span>
              <span className="font-semibold block" style={{ color: '#000000' }}>
                {invoice.delivery_date ? formatDisplayDate(invoice.delivery_date) : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Buyer (Left) and Transport/Dispatch (Right) */}
      <div className="flex" style={{ borderBottom: '1px solid #000000' }}>
        {/* Left: Buyer Details */}
        <div
          className="w-7/12 p-2.5 flex flex-col justify-between"
          style={{ borderRight: '1px solid #000000' }}
        >
          <div>
            <span
              className="text-[10px] font-bold block uppercase mb-0.5"
              style={{ color: '#4b5563' }}
            >
              Buyer:
            </span>
            <p className="text-xs font-black uppercase leading-tight mb-1" style={{ color: '#000000' }}>
              {invoice.buyer_name}
            </p>
            <p
              className="text-[10px] whitespace-pre-line leading-snug font-medium"
              style={{ color: '#1f2937' }}
            >
              {invoice.buyer_address}
            </p>
          </div>
          <div
            className="text-[10px] font-mono font-bold pt-1.5 mt-1"
            style={{
              color: '#000000',
              borderTop: '1px dotted #9ca3af',
            }}
          >
            GSTIN: <span className="font-black">{invoice.buyer_gstin}</span>
          </div>
        </div>

        {/* Right: Transport, Destination & Terms */}
        <div className="w-5/12 flex flex-col justify-between text-[10px]">
          <div className="p-1.5" style={{ borderBottom: '1px solid #000000' }}>
            <span className="font-bold block" style={{ color: '#4b5563' }}>Despatched through:</span>
            <span className="font-semibold block" style={{ color: '#000000' }}>
              {invoice.despatched_through || '-'}
            </span>
          </div>

          <div className="p-1.5">
            <span className="font-bold block" style={{ color: '#4b5563' }}>Destination:</span>
            <span className="font-semibold block" style={{ color: '#000000' }}>
              {invoice.destination || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Line Items Table */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr
            className="font-black uppercase text-center"
            style={{
              backgroundColor: '#f9fafb',
              color: '#000000',
              borderBottom: '1px solid #000000',
            }}
          >
            <th className="py-1 px-1 w-[6%]" style={{ borderRight: '1px solid #000000' }}>SI. No</th>
            <th className="py-1 px-2 w-[40%] text-left" style={{ borderRight: '1px solid #000000' }}>Description of Goods</th>
            <th className="py-1 px-1 w-[13%]" style={{ borderRight: '1px solid #000000' }}>HSN/SAC</th>
            <th className="py-1 px-1 w-[8%]" style={{ borderRight: '1px solid #000000' }}>TAX%</th>
            <th className="py-1 px-1 w-[8%] text-right" style={{ borderRight: '1px solid #000000' }}>Quantity</th>
            <th className="py-1 px-1 w-[11%] text-right" style={{ borderRight: '1px solid #000000' }}>Rate</th>
            <th className="py-1 px-1 w-[5%]" style={{ borderRight: '1px solid #000000' }}>Per</th>
            <th className="py-1 px-2 w-[11%] text-right">Amount</th>
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
                  borderBottom: '1px solid #e5e7eb',
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
                <td className="py-1 px-1 text-right font-mono font-semibold" style={{ borderRight: '1px solid #000000' }}>
                  {formatMilliToQuantity(line.qty_milli)}
                </td>
                <td className="py-1 px-1 text-right font-mono font-semibold" style={{ borderRight: '1px solid #000000' }}>
                  {formatPlainAmount(line.rate_paise)}
                </td>
                <td className="py-1 px-1 text-center uppercase text-[9px] font-bold" style={{ borderRight: '1px solid #000000' }}>
                  {line.unit || 'nos'}
                </td>
                <td className="py-1 px-2 text-right font-mono font-bold">
                  {formatPlainAmount(amountPaise)}
                </td>
              </tr>
            );
          })}

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

          {/* Final Page: CGST & SGST Rows per Rate Group */}
          {isLast && rateGroups.map((group) => (
            <React.Fragment key={group.gstPercent}>
              <tr
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  color: '#000000',
                  fontWeight: 600,
                }}
              >
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-2 font-bold" style={{ borderRight: '1px solid #000000' }}>CGST</td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-1 text-center" style={{ borderRight: '1px solid #000000' }}>{group.cgstRate}%</td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-2 text-right font-mono font-semibold">
                  {formatPlainAmount(group.cgstPaise)}
                </td>
              </tr>
              <tr
                style={{
                  borderBottom: '1px solid #e5e7eb',
                  color: '#000000',
                  fontWeight: 600,
                }}
              >
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-2 font-bold" style={{ borderRight: '1px solid #000000' }}>SGST</td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-1 text-center" style={{ borderRight: '1px solid #000000' }}>{group.sgstRate}%</td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5" style={{ borderRight: '1px solid #000000' }}></td>
                <td className="py-0.5 px-2 text-right font-mono font-semibold">
                  {formatPlainAmount(group.sgstPaise)}
                </td>
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>

      {/* 5. Last Page: Totals, Words, HSN Summary & Signatures */}
      {isLast && (
        <>
          {/* Grand Total Row */}
          <div
            className="flex font-black text-xs"
            style={{
              borderTop: '2px solid #000000',
              borderBottom: '2px solid #000000',
              color: '#000000',
            }}
          >
            <div className="w-9/12 py-1.5 px-3 uppercase text-right tracking-wide">
              GRAND TOTAL
            </div>
            <div
              className="w-3/12 py-1.5 px-2 text-right font-mono text-sm"
              style={{ borderLeft: '1px solid #000000' }}
            >
              {formatPlainAmount(invoice.payable_paise)}
            </div>
          </div>

          {/* Amount in Words */}
          <div
            className="p-2 text-[10px]"
            style={{ borderBottom: '1px solid #000000' }}
          >
            <span className="font-bold mr-1" style={{ color: '#4b5563' }}>Amount in words:</span>
            <span className="font-bold uppercase" style={{ color: '#000000' }}>
              {invoice.amount_in_words || (hsnSummary ? hsnSummary.taxInWords : '')}
            </span>
          </div>

          {/* HSN/SAC Summary Table */}
          <div style={{ borderBottom: '1px solid #000000' }}>
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr
                  className="font-black text-center"
                  style={{
                    backgroundColor: '#f9fafb',
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                  }}
                >
                  <th rowSpan="2" className="py-1 px-1 w-3/12" style={{ borderRight: '1px solid #000000' }}>HSN/SAC</th>
                  <th rowSpan="2" className="py-1 px-1 w-3/12 text-right" style={{ borderRight: '1px solid #000000' }}>Taxable Value</th>
                  <th colSpan="2" className="py-0.5 px-1 w-3/12" style={{ borderRight: '1px solid #000000' }}>Central Tax</th>
                  <th colSpan="2" className="py-0.5 px-1 w-3/12">State Tax</th>
                </tr>
                <tr
                  className="font-black text-center"
                  style={{
                    backgroundColor: '#f9fafb',
                    color: '#000000',
                    borderBottom: '1px solid #000000',
                  }}
                >
                  <th className="py-0.5 px-1 w-[10%]" style={{ borderRight: '1px solid #000000' }}>Rate</th>
                  <th className="py-0.5 px-1 w-[20%] text-right" style={{ borderRight: '1px solid #000000' }}>Amount</th>
                  <th className="py-0.5 px-1 w-[10%]" style={{ borderRight: '1px solid #000000' }}>Rate</th>
                  <th className="py-0.5 px-1 w-[20%] text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnSummary?.rows.map((row) => (
                  <tr
                    key={`${row.hsn}_${row.gstPercent}`}
                    style={{
                      borderBottom: '1px solid #e5e7eb',
                      color: '#000000',
                    }}
                  >
                    <td className="py-1 px-1 text-center font-mono font-bold" style={{ borderRight: '1px solid #000000' }}>
                      {row.hsn}
                    </td>
                    <td className="py-1 px-1 text-right font-mono font-semibold" style={{ borderRight: '1px solid #000000' }}>
                      {formatPlainAmount(row.taxablePaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-semibold" style={{ borderRight: '1px solid #000000' }}>
                      {row.centralRate}%
                    </td>
                    <td className="py-1 px-1 text-right font-mono font-semibold" style={{ borderRight: '1px solid #000000' }}>
                      {formatPlainAmount(row.centralTaxPaise)}
                    </td>
                    <td className="py-1 px-1 text-center font-semibold" style={{ borderRight: '1px solid #000000' }}>
                      {row.stateRate}%
                    </td>
                    <td className="py-1 px-1 text-right font-mono font-semibold">
                      {formatPlainAmount(row.stateTaxPaise)}
                    </td>
                  </tr>
                ))}

                {/* HSN Total Row */}
                <tr
                  className="font-black"
                  style={{
                    borderTop: '1px solid #000000',
                    color: '#000000',
                  }}
                >
                  <td className="py-1 px-2 text-right uppercase" style={{ borderRight: '1px solid #000000' }}>
                    TOTAL
                  </td>
                  <td className="py-1 px-1 text-right font-mono" style={{ borderRight: '1px solid #000000' }}>
                    {formatPlainAmount(hsnSummary?.totalTaxablePaise)}
                  </td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-1 text-right font-mono" style={{ borderRight: '1px solid #000000' }}>
                    {formatPlainAmount(hsnSummary?.totalCentralTaxPaise)}
                  </td>
                  <td className="py-1" style={{ borderRight: '1px solid #000000' }}></td>
                  <td className="py-1 px-1 text-right font-mono">
                    {formatPlainAmount(hsnSummary?.totalStateTaxPaise)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Total Tax and Tax in Words */}
            <div className="flex text-[10px]" style={{ borderTop: '1px solid #000000' }}>
              <div className="w-9/12 p-1.5" style={{ borderRight: '1px solid #000000' }}>
                <span className="font-bold mr-1" style={{ color: '#4b5563' }}>Amount in words:</span>
                <span className="font-bold uppercase" style={{ color: '#000000' }}>
                  {hsnSummary?.taxInWords}
                </span>
              </div>
              <div className="w-3/12 p-1.5 flex justify-between items-center font-bold" style={{ color: '#000000' }}>
                <span>Total Tax:</span>
                <span className="font-mono font-black text-xs">
                  {formatPlainAmount(hsnSummary?.totalTaxPaise)}
                </span>
              </div>
            </div>
          </div>

          {/* Declaration */}
          <div
            className="p-2 text-[9px] leading-tight"
            style={{
              borderBottom: '1px solid #000000',
              color: '#1f2937',
            }}
          >
            <span className="font-black" style={{ color: '#000000' }}>Declaration: </span>
            {firm.declaration || DEFAULT_FIRM.declaration}
          </div>

          {/* Signature Block */}
          <div className="p-3 flex justify-between items-end min-h-[90px]">
            <div className="text-center">
              <div className="w-44 pt-1" style={{ borderTop: '1px dotted #000000' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#000000' }}>
                  Customers Seal and Signature
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-wider mb-8" style={{ color: '#000000' }}>
                For {firm.name || 'Khansa Enterprises'}
              </p>
              <div className="w-44 pt-1" style={{ borderTop: '1px dotted #000000' }}>
                <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#000000' }}>
                  Authorised Signature
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Page number footer */}
      {page && page.totalPages > 1 && (
        <div
          className="p-1 text-center text-[9px] font-mono"
          style={{
            borderTop: '1px solid #d1d5db',
            color: '#6b7280',
          }}
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
