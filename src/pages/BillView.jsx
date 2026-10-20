import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatRupees, formatDisplayDate } from '../lib/billUtils.js';
import { calcInvoice } from '../lib/tax.js';
import { numberToWordsIndian, formatMilliToQuantity } from '../lib/billPayload.js';

export default function BillView() {
  const { id } = useParams();
  const [invoice, setInvoice] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function loadInvoice() {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('*, lines:invoice_lines(*)')
          .eq('id', id)
          .single();

        if (error) throw error;
        if (!data) throw new Error('Invoice not found');

        if (!isCancelled) {
          // Sort lines by line_no
          if (Array.isArray(data.lines)) {
            data.lines.sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
          }
          setInvoice(data);
        }
      } catch (err) {
        console.error('Error loading bill:', err);
        if (!isCancelled) {
          setErrorMsg(err.message || 'Failed to load bill details.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    if (id) {
      loadInvoice();
    }

    return () => {
      isCancelled = true;
    };
  }, [id]);

  // Rate-group calculation for breakdown display
  const rateGroups = useMemo(() => {
    if (!invoice?.lines || invoice.lines.length === 0) return [];
    const formatted = invoice.lines.map((l) => ({
      qtyMilli: Number(l.qty_milli || 0),
      ratePaise: Number(l.rate_paise || 0),
      gstPercent: Number(l.gst_percent || 0),
    }));
    const calc = calcInvoice(formatted);
    return calc.rateGroups;
  }, [invoice]);

  if (loading) {
    return (
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-8 text-center space-y-3">
        <p className="text-lg font-bold text-slate-700">Loading bill details...</p>
      </div>
    );
  }

  if (errorMsg || !invoice) {
    return (
      <div className="bg-white rounded-3xl border-2 border-red-300 p-8 text-center space-y-4 max-w-lg mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-red-100 text-red-700 flex items-center justify-center">
          <svg className="w-8 h-8 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h3 className="text-xl font-black text-slate-900">
          Bill Not Found
        </h3>
        <p className="text-sm font-semibold text-slate-600">
          {errorMsg || 'The requested invoice could not be retrieved.'}
        </p>
        <div className="pt-2">
          <Link
            to="/bills"
            className="inline-flex items-center justify-center min-h-[48px] px-6 py-2.5 rounded-2xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
          >
            &larr; Back to Bills
          </Link>
        </div>
      </div>
    );
  }

  const isCancelled = invoice.status === 'cancelled';

  return (
    <div className="space-y-6 pb-12">
      {/* Top Navigation Row */}
      <div className="flex items-center justify-between">
        <Link
          to="/bills"
          className="inline-flex items-center space-x-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition min-h-[44px]"
        >
          <span>&larr;</span>
          <span>Bills Register</span>
        </Link>
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
          Read-Only View
        </span>
      </div>

      {/* Invoice Main Banner Card */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        {/* Invoice Number & Cancelled Tag */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
              Invoice Number
            </span>
            <h2 className="text-3xl font-black text-slate-900 font-mono tracking-tight">
              {invoice.invoice_no}
            </h2>
          </div>

          <div className="flex items-center space-x-2">
            {isCancelled ? (
              <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-black bg-red-100 text-red-900 border-2 border-red-500">
                CANCELLED
              </span>
            ) : (
              <span className="inline-flex items-center px-3.5 py-1.5 rounded-full text-sm font-black bg-emerald-100 text-emerald-900 border border-emerald-400">
                FINALIZED
              </span>
            )}
          </div>
        </div>

        {/* Cancelled Banner if cancelled */}
        {isCancelled && (
          <div className="p-3.5 rounded-2xl bg-red-50 border-2 border-red-400 text-red-900 text-sm font-bold flex items-center justify-between">
            <span>⚠️ This invoice has been cancelled and is void.</span>
            {invoice.cancelled_at && (
              <span className="text-xs text-red-700">
                Cancelled on {formatDisplayDate(invoice.cancelled_at)}
              </span>
            )}
          </div>
        )}

        {/* Date & Buyer Summary Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm font-semibold text-slate-700 pt-1">
          <div>
            <span className="text-xs uppercase font-bold text-slate-400 block mb-0.5">
              Invoice Date
            </span>
            <span className="text-base font-black text-slate-900 font-mono">
              {formatDisplayDate(invoice.invoice_date)}
            </span>
          </div>

          <div>
            <span className="text-xs uppercase font-bold text-slate-400 block mb-0.5">
              Financial Year
            </span>
            <span className="text-base font-black text-slate-900 font-mono">
              FY {invoice.fy}
            </span>
          </div>
        </div>

        {/* Buyer & Delivery Details */}
        <div className="pt-2 border-t border-slate-200 space-y-3">
          <div>
            <span className="text-xs uppercase font-bold text-slate-400 block mb-0.5">
              Buyer Company
            </span>
            <p className="text-lg font-black text-slate-900">
              {invoice.buyer_name}
            </p>
            <div className="flex flex-wrap gap-2 text-xs font-mono font-bold text-slate-600 mt-1">
              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                GSTIN: {invoice.buyer_gstin}
              </span>
              <span className="bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                State Code: {invoice.buyer_state_code}
              </span>
            </div>
          </div>

          <div>
            <span className="text-xs uppercase font-bold text-slate-400 block mb-0.5">
              Branch Delivery Address
            </span>
            <p className="text-sm font-semibold text-slate-800 whitespace-pre-line bg-slate-50 p-3 rounded-2xl border border-slate-200 leading-relaxed">
              {invoice.buyer_address}
            </p>
          </div>
        </div>

        {/* All Header Reference Fields */}
        <div className="pt-2 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs font-semibold text-slate-600">
          <div>
            <span className="text-slate-400 block uppercase font-bold">Buyer Order No</span>
            <span className="text-sm font-bold text-slate-900">{invoice.buyer_order_no || '-'}</span>
          </div>

          <div>
            <span className="text-slate-400 block uppercase font-bold">Buyer Order Date</span>
            <span className="text-sm font-bold text-slate-900">{invoice.buyer_order_date || '-'}</span>
          </div>

          <div>
            <span className="text-slate-400 block uppercase font-bold">Delivery No</span>
            <span className="text-sm font-bold text-slate-900">{invoice.delivery_no || '-'}</span>
          </div>

          <div>
            <span className="text-slate-400 block uppercase font-bold">Delivery Date</span>
            <span className="text-sm font-bold text-slate-900">
              {invoice.delivery_date ? formatDisplayDate(invoice.delivery_date) : '-'}
            </span>
          </div>

          <div>
            <span className="text-slate-400 block uppercase font-bold">Despatched Through</span>
            <span className="text-sm font-bold text-slate-900">{invoice.despatched_through || '-'}</span>
          </div>

          <div>
            <span className="text-slate-400 block uppercase font-bold">Destination</span>
            <span className="text-sm font-bold text-slate-900">{invoice.destination || '-'}</span>
          </div>

          <div className="col-span-2 sm:col-span-3">
            <span className="text-slate-400 block uppercase font-bold">Terms of Delivery</span>
            <span className="text-sm font-bold text-slate-900">{invoice.terms_of_delivery || '-'}</span>
          </div>
        </div>
      </div>

      {/* Lines Section */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">
          Line Items ({invoice.lines?.length || 0})
        </h3>

        <div className="space-y-3">
          {(invoice.lines || []).map((line, idx) => (
            <div
              key={line.id || idx}
              className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/50 space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="text-xs font-bold text-slate-400 uppercase">
                    Line #{line.line_no || idx + 1}
                  </span>
                  <h4 className="text-base font-black text-slate-900 leading-snug">
                    {line.description}
                  </h4>
                </div>
                <span className="text-base font-black font-mono text-slate-900">
                  {formatRupees(line.amount_paise)}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-slate-600 bg-white p-2.5 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block uppercase font-bold">HSN Code</span>
                  <span className="font-mono text-sm font-bold text-slate-900">
                    {line.hsn || '-'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-bold">Unit</span>
                  <span className="text-sm font-bold text-slate-900">{line.unit || 'NOS'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-bold">Quantity</span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatMilliToQuantity(line.qty_milli)}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block uppercase font-bold">Rate &bull; GST</span>
                  <span className="text-sm font-bold text-slate-900">
                    {formatRupees(line.rate_paise)} &bull; {line.gst_percent}%
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tax Breakdown & Totals Section */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">
          Rate-Group Tax Breakdown &amp; Totals
        </h3>

        {/* Rate groups */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-black uppercase text-slate-500">
                <th className="py-2">GST %</th>
                <th className="py-2 text-right">Taxable Value</th>
                <th className="py-2 text-right">CGST</th>
                <th className="py-2 text-right">SGST</th>
                <th className="py-2 text-right">Group Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
              {rateGroups.map((g) => (
                <tr key={g.gstPercent}>
                  <td className="py-2.5 font-bold">{g.gstPercent}%</td>
                  <td className="py-2.5 text-right font-mono">{formatRupees(g.taxablePaise)}</td>
                  <td className="py-2.5 text-right font-mono">{formatRupees(g.cgstPaise)}</td>
                  <td className="py-2.5 text-right font-mono">{formatRupees(g.sgstPaise)}</td>
                  <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                    {formatRupees(g.taxPaise)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals Summary */}
        <div className="space-y-2 pt-2 border-t border-slate-200 text-sm font-semibold">
          <div className="flex justify-between text-slate-600">
            <span>Total Taxable Amount</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(invoice.taxable_paise)}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Total CGST</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(invoice.cgst_paise)}
            </span>
          </div>

          <div className="flex justify-between text-slate-600">
            <span>Total SGST</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(invoice.sgst_paise)}
            </span>
          </div>

          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 text-lg font-black text-slate-900">
            <span>Grand Total</span>
            <span className="text-2xl font-mono text-blue-900">
              {formatRupees(invoice.payable_paise)}
            </span>
          </div>
        </div>

        {/* Amount in words */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <span className="font-bold text-slate-400 uppercase block mb-0.5">
            Amount in Words:
          </span>
          <p className="font-bold text-slate-800 leading-relaxed">
            {numberToWordsIndian(invoice.payable_paise)}
          </p>
        </div>
      </div>
    </div>
  );
}
