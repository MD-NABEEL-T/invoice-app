import React from 'react';
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
  phone: '9445671796',
  email: 'mohammedafzalarni@yahoo.com',
  gstin: '33AGXPF4947Q1ZH',
  declaration: 'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct',
};

/**
 * Individual A4 Invoice Page Component.
 * Follows the legacy Excel layout (SINGLE FORMAT.xlsm and 2BILLTAX FORMAT.xlsm).
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

  return (
    <div
      className="invoice-page bg-white text-black font-sans box-border mx-auto border-2 border-black"
      style={{
        width: '210mm',
        minHeight: '297mm',
        padding: '0',
        fontSize: '11px',
        lineHeight: '1.25',
        pageBreakAfter: 'always',
        breakAfter: 'page',
      }}
    >
      {/* 1. Header Bar: TAX INVOICE & Optional Copy Label */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-black">
        <div className="w-1/3"></div>
        <div className="w-1/3 text-center">
          <h1 className="text-base font-black tracking-wider uppercase m-0">
            TAX INVOICE
          </h1>
        </div>
        <div className="w-1/3 text-right">
          {copyLabel && (
            <span className="text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 border border-black inline-block">
              {copyLabel}
            </span>
          )}
        </div>
      </div>

      {/* 2. Top Section: Firm Profile (Left) and Invoice Metadata (Right) */}
      <div className="flex border-b border-black">
        {/* Left: Firm Profile */}
        <div className="w-7/12 p-2.5 border-r border-black flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-black uppercase tracking-wide leading-tight mb-1">
              {firm.name || 'KHANSA ENTERPRISES'}
            </h2>
            <p className="text-[10px] whitespace-pre-line leading-snug font-medium mb-1.5 text-gray-800">
              {firm.address}
            </p>
          </div>
          <div className="text-[10px] space-y-0.5 font-semibold text-gray-900 pt-1 border-t border-dotted border-gray-400">
            <p className="font-mono font-bold">
              GSTIN/UIN: <span className="font-black">{firm.gstin}</span>
            </p>
            {firm.email && <p>Email: {firm.email}</p>}
            {firm.phone && <p>Cell: {firm.phone}</p>}
          </div>
        </div>

        {/* Right: Invoice Reference Metadata */}
        <div className="w-5/12 flex flex-col justify-between text-[10px]">
          {/* Invoice No & Date */}
          <div className="flex border-b border-black">
            <div className="w-1/2 p-1.5 border-r border-black">
              <span className="font-bold block text-gray-600">INVOICE No:</span>
              <span className="font-mono font-black text-xs block text-black">
                {invoice.invoice_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block text-gray-600">Dated:</span>
              <span className="font-mono font-bold block text-black">
                {formatDisplayDate(invoice.invoice_date) || '-'}
              </span>
            </div>
          </div>

          {/* Buyer Order & Date */}
          <div className="flex border-b border-black">
            <div className="w-1/2 p-1.5 border-r border-black">
              <span className="font-bold block text-gray-600">Buyer Order:</span>
              <span className="font-semibold block text-black">
                {invoice.buyer_order_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block text-gray-600">Dated:</span>
              <span className="font-semibold block text-black">
                {invoice.buyer_order_date || '-'}
              </span>
            </div>
          </div>

          {/* Delivery No & Date */}
          <div className="flex">
            <div className="w-1/2 p-1.5 border-r border-black">
              <span className="font-bold block text-gray-600">Delivery No:</span>
              <span className="font-semibold block text-black">
                {invoice.delivery_no || '-'}
              </span>
            </div>
            <div className="w-1/2 p-1.5">
              <span className="font-bold block text-gray-600">Delivery Dt:</span>
              <span className="font-semibold block text-black">
                {invoice.delivery_date ? formatDisplayDate(invoice.delivery_date) : '-'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. Middle Section: Buyer (Left) and Transport/Dispatch (Right) */}
      <div className="flex border-b border-black">
        {/* Left: Buyer Details */}
        <div className="w-7/12 p-2.5 border-r border-black flex flex-col justify-between">
          <div>
            <span className="text-[10px] font-bold block text-gray-600 uppercase mb-0.5">
              Buyer:
            </span>
            <p className="text-xs font-black uppercase leading-tight mb-1">
              {invoice.buyer_name}
            </p>
            <p className="text-[10px] whitespace-pre-line leading-snug font-medium text-gray-800">
              {invoice.buyer_address}
            </p>
          </div>
          <div className="text-[10px] font-mono font-bold pt-1.5 mt-1 border-t border-dotted border-gray-400">
            GSTIN: <span className="font-black">{invoice.buyer_gstin}</span>
          </div>
        </div>

        {/* Right: Transport, Destination & Terms */}
        <div className="w-5/12 flex flex-col justify-between text-[10px]">
          <div className="p-1.5 border-b border-black">
            <span className="font-bold block text-gray-600">Despatched through:</span>
            <span className="font-semibold block text-black">
              {invoice.despatched_through || '-'}
            </span>
          </div>

          <div className="p-1.5 border-b border-black">
            <span className="font-bold block text-gray-600">Destination:</span>
            <span className="font-semibold block text-black">
              {invoice.destination || '-'}
            </span>
          </div>

          <div className="p-1.5">
            <span className="font-bold block text-gray-600">Terms of Delivery:</span>
            <span className="font-semibold block text-black">
              {invoice.terms_of_delivery || '-'}
            </span>
          </div>
        </div>
      </div>

      {/* 4. Line Items Table */}
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr className="border-b border-black bg-gray-50/50 font-black uppercase text-center">
            <th className="py-1 px-1 border-r border-black w-[6%]">SI. No</th>
            <th className="py-1 px-2 border-r border-black w-[40%] text-left">Description of Goods</th>
            <th className="py-1 px-1 border-r border-black w-[13%]">HSN/SAC</th>
            <th className="py-1 px-1 border-r border-black w-[8%]">TAX%</th>
            <th className="py-1 px-1 border-r border-black w-[8%] text-right">Quantity</th>
            <th className="py-1 px-1 border-r border-black w-[11%] text-right">Rate</th>
            <th className="py-1 px-1 border-r border-black w-[5%]">Per</th>
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
              <tr key={line.id || idx} className="border-b border-gray-200">
                <td className="py-1 px-1 border-r border-black text-center font-bold">
                  {lineNo}
                </td>
                <td className="py-1 px-2 border-r border-black text-left font-semibold">
                  {line.description}
                </td>
                <td className="py-1 px-1 border-r border-black text-center font-mono font-medium">
                  {line.hsn || '-'}
                </td>
                <td className="py-1 px-1 border-r border-black text-center font-semibold">
                  {line.gst_percent !== undefined ? `${line.gst_percent}%` : '-'}
                </td>
                <td className="py-1 px-1 border-r border-black text-right font-mono font-semibold">
                  {formatMilliToQuantity(line.qty_milli)}
                </td>
                <td className="py-1 px-1 border-r border-black text-right font-mono font-semibold">
                  {formatPlainAmount(line.rate_paise)}
                </td>
                <td className="py-1 px-1 border-r border-black text-center uppercase text-[9px] font-bold">
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
              <td colSpan="8" className="py-4 text-center font-bold text-gray-500 italic">
                ... Continued on Next Page (Page {page.pageNumber + 1} of {page.totalPages}) ...
              </td>
            </tr>
          )}

          {/* Final Page: CGST & SGST Rows per Rate Group */}
          {isLast && rateGroups.map((group) => (
            <React.Fragment key={group.gstPercent}>
              <tr className="border-b border-gray-200 font-semibold">
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 px-2 border-r border-black font-bold">CGST</td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 px-1 border-r border-black text-center">{group.cgstRate}%</td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 px-2 text-right font-mono font-semibold">
                  {formatPlainAmount(group.cgstPaise)}
                </td>
              </tr>
              <tr className="border-b border-gray-200 font-semibold">
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 px-2 border-r border-black font-bold">SGST</td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 px-1 border-r border-black text-center">{group.sgstRate}%</td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 border-r border-black"></td>
                <td className="py-0.5 border-r border-black"></td>
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
          <div className="flex border-t-2 border-b-2 border-black font-black text-xs">
            <div className="w-9/12 py-1.5 px-3 uppercase text-right tracking-wide">
              Grand Total (round off)
            </div>
            <div className="w-3/12 py-1.5 px-2 text-right font-mono text-sm border-l border-black">
              {formatPlainAmount(invoice.payable_paise)}
            </div>
          </div>

          {/* Amount in Words */}
          <div className="p-2 border-b border-black text-[10px]">
            <span className="font-bold text-gray-600 mr-1">Amount in words:</span>
            <span className="font-bold text-black uppercase">
              {invoice.amount_in_words || (hsnSummary ? hsnSummary.taxInWords : '')}
            </span>
          </div>

          {/* HSN/SAC Summary Table */}
          <div className="border-b border-black">
            <table className="w-full border-collapse text-[9px]">
              <thead>
                <tr className="border-b border-black font-black text-center bg-gray-50/50">
                  <th rowSpan="2" className="py-1 px-1 border-r border-black w-3/12">HSN/SAC</th>
                  <th rowSpan="2" className="py-1 px-1 border-r border-black w-3/12 text-right">Taxable Value</th>
                  <th colSpan="2" className="py-0.5 px-1 border-r border-black w-3/12">Central Tax</th>
                  <th colSpan="2" className="py-0.5 px-1 w-3/12">State Tax</th>
                </tr>
                <tr className="border-b border-black font-black text-center bg-gray-50/50">
                  <th className="py-0.5 px-1 border-r border-black w-[10%]">Rate</th>
                  <th className="py-0.5 px-1 border-r border-black w-[20%] text-right">Amount</th>
                  <th className="py-0.5 px-1 border-r border-black w-[10%]">Rate</th>
                  <th className="py-0.5 px-1 w-[20%] text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {hsnSummary?.rows.map((row) => (
                  <tr key={`${row.hsn}_${row.gstPercent}`} className="border-b border-gray-200">
                    <td className="py-1 px-1 border-r border-black text-center font-mono font-bold">
                      {row.hsn}
                    </td>
                    <td className="py-1 px-1 border-r border-black text-right font-mono font-semibold">
                      {formatPlainAmount(row.taxablePaise)}
                    </td>
                    <td className="py-1 px-1 border-r border-black text-center font-semibold">
                      {row.centralRate}%
                    </td>
                    <td className="py-1 px-1 border-r border-black text-right font-mono font-semibold">
                      {formatPlainAmount(row.centralTaxPaise)}
                    </td>
                    <td className="py-1 px-1 border-r border-black text-center font-semibold">
                      {row.stateRate}%
                    </td>
                    <td className="py-1 px-1 text-right font-mono font-semibold">
                      {formatPlainAmount(row.stateTaxPaise)}
                    </td>
                  </tr>
                ))}

                {/* HSN Total Row */}
                <tr className="border-t border-black font-black">
                  <td className="py-1 px-2 border-r border-black text-right uppercase">
                    Total (round off)
                  </td>
                  <td className="py-1 px-1 border-r border-black text-right font-mono">
                    {formatPlainAmount(hsnSummary?.totalTaxablePaise)}
                  </td>
                  <td className="py-1 border-r border-black"></td>
                  <td className="py-1 px-1 border-r border-black text-right font-mono">
                    {formatPlainAmount(hsnSummary?.totalCentralTaxPaise)}
                  </td>
                  <td className="py-1 border-r border-black"></td>
                  <td className="py-1 px-1 text-right font-mono">
                    {formatPlainAmount(hsnSummary?.totalStateTaxPaise)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Total Tax and Tax in Words */}
            <div className="flex border-t border-black text-[10px]">
              <div className="w-9/12 p-1.5 border-r border-black">
                <span className="font-bold text-gray-600 mr-1">Amount in words:</span>
                <span className="font-bold text-black uppercase">
                  {hsnSummary?.taxInWords}
                </span>
              </div>
              <div className="w-3/12 p-1.5 flex justify-between items-center font-bold">
                <span>Total Tax:</span>
                <span className="font-mono font-black text-xs">
                  {formatPlainAmount(hsnSummary?.totalTaxPaise)}
                </span>
              </div>
            </div>
          </div>

          {/* Declaration */}
          <div className="p-2 border-b border-black text-[9px] leading-tight text-gray-800">
            <span className="font-black text-black">Declaration: </span>
            {firm.declaration || DEFAULT_FIRM.declaration}
          </div>

          {/* Signature Block */}
          <div className="p-3 flex justify-between items-end min-h-[90px]">
            <div className="text-center">
              <div className="w-44 border-t border-dotted border-black pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black">
                  Customers Seal and Signature
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-wider mb-8 text-black">
                For {firm.name || 'Khansa Enterprises'}
              </p>
              <div className="w-44 border-t border-dotted border-black pt-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-black">
                  Authorised Signature
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Page number footer */}
      {page && page.totalPages > 1 && (
        <div className="p-1 text-center text-[9px] font-mono text-gray-500 border-t border-gray-300">
          Page {page.pageNumber} of {page.totalPages}
        </div>
      )}
    </div>
  );
}

/**
 * Main InvoiceSheet component that paginates invoice lines across pages
 * and renders the full set of pages for on-screen preview, browser print, or PDF capture.
 */
export default function InvoiceSheet({
  invoice,
  firmProfile,
  copyLabel = '',
}) {
  if (!invoice) return null;

  // Split lines into pages
  const pages = paginateInvoiceLines(invoice.lines || []);

  return (
    <div className="invoice-sheet-container space-y-6">
      {pages.map((p) => (
        <InvoicePage
          key={p.pageNumber}
          invoice={invoice}
          firmProfile={firmProfile}
          page={p}
          copyLabel={copyLabel}
        />
      ))}
    </div>
  );
}
