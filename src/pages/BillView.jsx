import React, { useEffect, useState, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatRupees, formatDisplayDate } from '../lib/billUtils.js';
import { calcInvoice } from '../lib/tax.js';
import { numberToWordsIndian, formatMilliToQuantity } from '../lib/billPayload.js';
import InvoiceSheet, { InvoicePage } from '../components/InvoiceSheet.jsx';
import { getInvoicePdfFilename, getCopyLabel, paginateInvoiceLines } from '../lib/invoiceLayout.js';
import { generateInvoicePdfBlob, downloadInvoicePdf, shareInvoicePdf } from '../lib/pdfGenerator.js';

export default function BillView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [firmProfile, setFirmProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Delete modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  // Cancel modal state (Phase 7)
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');

  // View mode: 'cards' or 'preview'
  const [viewMode, setViewMode] = useState('cards');

  // Print & PDF modal state
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [copyCount, setCopyCount] = useState(() => {
    try {
      const saved = parseInt(localStorage.getItem('khansa_print_copies'), 10);
      return saved >= 1 && saved <= 5 ? saved : 3;
    } catch {
      return 3;
    }
  });

  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [pdfMessage, setPdfMessage] = useState('');
  const [pdfMeasurement, setPdfMeasurement] = useState(null);

  // Check if copy labeling is enabled in settings
  const isLabelCopiesEnabled = () => {
    try {
      return localStorage.getItem('khansa_label_copies') === 'true';
    } catch {
      return false;
    }
  };

  const handleCopyCountChange = (delta) => {
    const nextVal = Math.max(1, Math.min(5, copyCount + delta));
    setCopyCount(nextVal);
    try {
      localStorage.setItem('khansa_print_copies', String(nextVal));
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      setLoading(true);
      setErrorMsg('');
      try {
        // Fetch invoice with its lines
        const { data: invData, error: invError } = await supabase
          .from('invoices')
          .select('*, lines:invoice_lines(*)')
          .eq('id', id)
          .single();

        if (invError) throw invError;
        if (!invData) throw new Error('Invoice not found');

        // Fetch firm profile
        const { data: firmData } = await supabase
          .from('firm_profile')
          .select('name, address, phone, email, gstin, declaration')
          .eq('id', 1)
          .maybeSingle();

        if (!isCancelled) {
          if (Array.isArray(invData.lines)) {
            invData.lines.sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
          }
          setInvoice(invData);
          if (firmData) {
            setFirmProfile(firmData);
          }
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
      loadData();
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

  // Paginated pages for print/PDF
  const paginatedPages = useMemo(() => {
    if (!invoice?.lines) return [];
    return paginateInvoiceLines(invoice.lines);
  }, [invoice?.lines]);

  // Action (a): Browser Print
  const handlePrint = () => {
    setShowPrintModal(false);
    // 300ms tick to let modal unmount and mobile layout stabilize before print
    setTimeout(() => {
      window.print();
    }, 300);
  };

  // Action (b) & (c): PDF generation for Share / Download
  const handlePdfAction = async (actionType = 'download') => {
    setGeneratingPdf(true);
    setPdfMessage('Rendering invoice pages to PDF...');
    try {
      const container = document.getElementById('pdf-download-container') || document.getElementById('print-container');
      if (!container) throw new Error('PDF container not available in DOM');

      const pageElements = container.querySelectorAll('.invoice-page');
      if (pageElements.length === 0) throw new Error('No invoice pages found to render');

      const filename = getInvoicePdfFilename(invoice.invoice_no);

      const { blob, sizeBytes, sizeKb } = await generateInvoicePdfBlob(pageElements, {
        scale: 2,
        jpegQuality: 0.85,
      });

      setPdfMeasurement({ sizeBytes, sizeKb, pagesCount: pageElements.length });

      if (actionType === 'share') {
        const shareResult = await shareInvoicePdf(blob, filename, {
          title: `Invoice ${invoice.invoice_no}`,
          text: `Tax Invoice ${invoice.invoice_no}`,
        });

        if (shareResult.fallbackNeeded) {
          downloadInvoicePdf(blob, filename);
          setPdfMessage(
            `Web Share not supported on this browser. Downloaded ${filename} (${sizeKb} KB) instead.`
          );
        } else if (shareResult.success) {
          setPdfMessage(`PDF shared successfully (${sizeKb} KB).`);
        } else {
          setPdfMessage('Share was closed.');
        }
      } else {
        // Download action
        downloadInvoicePdf(blob, filename);
        setPdfMessage(`Downloaded ${filename} (${sizeKb} KB).`);
      }
    } catch (err) {
      console.error('PDF generation error:', err);
      setPdfMessage(`Failed to generate PDF: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Action: Delete Invoice
  const handleConfirmDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setDeleteError('');
    try {
      const { error: rpcErr } = await supabase.rpc('delete_invoice', { p_invoice_id: id });
      if (rpcErr) {
        // Fallback direct delete if RPC not yet deployed
        const { error: linesErr } = await supabase.from('invoice_lines').delete().eq('invoice_id', id);
        if (linesErr) console.warn('Direct lines delete warning:', linesErr);
        const { error: invErr } = await supabase.from('invoices').delete().eq('id', id);
        if (invErr) throw invErr;
      }
      navigate('/bills');
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      setDeleteError(err.message || 'Could not delete invoice.');
      setIsDeleting(false);
    }
  };

  // Action: Cancel Invoice (Phase 7)
  const handleConfirmCancel = async () => {
    if (isCancelling) return;
    setIsCancelling(true);
    setCancelError('');
    try {
      const { error: rpcErr } = await supabase.rpc('cancel_invoice', { invoice_id: id });
      if (rpcErr) {
        // Fallback direct update
        const { error: updateErr } = await supabase
          .from('invoices')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('id', id);
        if (updateErr) throw updateErr;
      }
      setInvoice((prev) => ({
        ...prev,
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      }));
      setShowCancelModal(false);
    } catch (err) {
      console.error('Failed to cancel invoice:', err);
      setCancelError(err.message || 'Could not cancel invoice.');
    } finally {
      setIsCancelling(false);
    }
  };

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
  const labelCopiesEnabled = isLabelCopiesEnabled();

  return (
    <div className="space-y-6 pb-28 sm:pb-12">
      {/* Top Navigation & Primary Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div className="flex items-center space-x-3">
          <Link
            to="/bills"
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-slate-700 bg-white border border-slate-300 px-3.5 py-2 rounded-xl hover:bg-slate-50 transition min-h-[44px]"
          >
            <span>&larr;</span>
            <span>Bills Register</span>
          </Link>

          {/* View Mode Toggle Button */}
          <div className="inline-flex p-1 bg-slate-200 rounded-xl border border-slate-300">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'cards'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Summary View
            </button>
            <button
              type="button"
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                viewMode === 'preview'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              A4 Print Preview
            </button>
          </div>

          {/* Copy as New Bill Button (Phase 7) */}
          <Link
            to={`/new?copyFrom=${id}`}
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-emerald-800 bg-emerald-50 border border-emerald-300 px-3.5 py-2 rounded-xl hover:bg-emerald-100 transition min-h-[44px]"
            title="Duplicate items and details into a new bill"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
            <span>Copy as New</span>
          </Link>

          {/* Edit Bill Button (disabled if cancelled) */}
          {!isCancelled && (
            <Link
              to={`/bills/${id}/edit`}
              className="inline-flex items-center space-x-1.5 text-sm font-bold text-blue-700 bg-blue-50 border border-blue-300 px-3.5 py-2 rounded-xl hover:bg-blue-100 transition min-h-[44px]"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Edit</span>
            </Link>
          )}

          {/* Cancel Bill Button (Phase 7) */}
          {!isCancelled && (
            <button
              type="button"
              onClick={() => {
                setCancelError('');
                setShowCancelModal(true);
              }}
              className="inline-flex items-center space-x-1.5 text-sm font-bold text-amber-800 bg-amber-50 border border-amber-300 px-3.5 py-2 rounded-xl hover:bg-amber-100 transition min-h-[44px] cursor-pointer"
            >
              <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              <span>Cancel</span>
            </button>
          )}

          {/* Delete Bill Button */}
          <button
            type="button"
            onClick={() => {
              setDeleteError('');
              setShowDeleteModal(true);
            }}
            className="inline-flex items-center space-x-1.5 text-sm font-bold text-red-700 bg-red-50 border border-red-300 px-3.5 py-2 rounded-xl hover:bg-red-100 transition min-h-[44px] cursor-pointer"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <span>Delete</span>
          </button>
        </div>

        {/* Big Print / Share Primary Button (Desktop/Tablet) */}
        <button
          type="button"
          onClick={() => {
            setPdfMessage('');
            setShowPrintModal(true);
          }}
          className="hidden sm:inline-flex min-h-[50px] px-6 py-2.5 rounded-2xl bg-blue-700 text-white font-black text-base hover:bg-blue-800 shadow-md items-center justify-center space-x-2 active:scale-[0.98] transition cursor-pointer"
        >
          <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Print / Share Bill</span>
        </button>
      </div>

      {/* Screen Mode: Card Breakdown View */}
      {viewMode === 'cards' && (
        <div className="space-y-6 no-print screen-only">
          {/* Invoice Main Banner Card */}
          <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
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

          {/* Tax Breakdown & Totals */}
          <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
            <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">
              Rate-Group Tax Breakdown &amp; Totals
            </h3>

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
      )}

      {/* Screen Mode: A4 Invoice Preview */}
      {viewMode === 'preview' && (
        <div className="no-print screen-only p-2 sm:p-4 bg-slate-200/60 rounded-3xl border-2 border-slate-300">
          <div className="text-center pb-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
            A4 Portrait Bill Preview
          </div>
          <InvoiceSheet
            invoice={invoice}
            firmProfile={firmProfile}
            copyLabel={getCopyLabel(0, labelCopiesEnabled)}
            scaleToFit={true}
          />
        </div>
      )}

      {/* Sticky Mobile Print/Share Button (pinned to viewport bottom on phones) */}
      <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-300 shadow-xl sm:hidden z-30 no-print flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => {
            setPdfMessage('');
            setShowPrintModal(true);
          }}
          className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-blue-700 text-white font-black text-base hover:bg-blue-800 shadow-md flex items-center justify-center space-x-2 active:scale-[0.98] transition cursor-pointer"
        >
          <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Print / Share Bill</span>
        </button>
      </div>

      {/* DIALOG MODAL: "How many copies?" & 3 Actions (Print / Share PDF / Download PDF) */}
      {showPrintModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-md w-full p-6 shadow-2xl space-y-5">
            {/* Modal Header */}
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Print &amp; Share
                </span>
                <h3 className="text-2xl font-black text-slate-900">
                  How many copies?
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPrintModal(false)}
                className="w-10 h-10 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold flex items-center justify-center"
              >
                &times;
              </button>
            </div>

            {/* Stepper: default 3, min 1, max 5 */}
            <div className="flex items-center justify-center space-x-4 py-2">
              <button
                type="button"
                disabled={copyCount <= 1}
                onClick={() => handleCopyCountChange(-1)}
                className="w-14 h-14 rounded-2xl border-2 border-slate-400 bg-slate-100 hover:bg-slate-200 text-2xl font-black text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                &minus;
              </button>

              <div className="text-center min-w-[120px]">
                <span className="text-4xl font-mono font-black text-slate-900 block leading-tight">
                  {copyCount}
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {copyCount === 1 ? 'Copy' : 'Copies'}
                </span>
              </div>

              <button
                type="button"
                disabled={copyCount >= 5}
                onClick={() => handleCopyCountChange(1)}
                className="w-14 h-14 rounded-2xl border-2 border-slate-400 bg-slate-100 hover:bg-slate-200 text-2xl font-black text-slate-800 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center cursor-pointer transition active:scale-95"
              >
                &#43;
              </button>
            </div>

            {/* Copy Labeling Notification */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 flex items-center justify-between">
              <span>Copy Labels (Original / Duplicate / Triplicate):</span>
              <span className={`font-bold ${labelCopiesEnabled ? 'text-emerald-700' : 'text-slate-500'}`}>
                {labelCopiesEnabled ? 'ON' : 'OFF'}
              </span>
            </div>

            {/* Status & Measurement message */}
            {pdfMessage && (
              <div className="p-3 bg-blue-50 border border-blue-300 rounded-xl text-xs font-bold text-blue-900">
                {pdfMessage}
              </div>
            )}

            {/* 3 Actions: (a) Print, (b) Share PDF, (c) Download PDF */}
            <div className="space-y-2.5 pt-2">
              {/* Action (a): Print */}
              <button
                type="button"
                disabled={generatingPdf}
                onClick={handlePrint}
                className="w-full min-h-[50px] px-5 py-3 rounded-2xl bg-slate-900 text-white font-black text-base hover:bg-slate-800 flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                <span>Print ({copyCount} {copyCount === 1 ? 'copy' : 'copies'})</span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                {/* Action (b): Share PDF */}
                <button
                  type="button"
                  disabled={generatingPdf}
                  onClick={() => handlePdfAction('share')}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                  </svg>
                  <span>Share PDF</span>
                </button>

                {/* Action (c): Download PDF */}
                <button
                  type="button"
                  disabled={generatingPdf}
                  onClick={() => handlePdfAction('download')}
                  className="w-full min-h-[48px] px-4 py-2.5 rounded-2xl bg-blue-700 text-white font-bold text-sm hover:bg-blue-800 disabled:opacity-50 flex items-center justify-center space-x-1.5 transition cursor-pointer"
                >
                  <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Download PDF</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-red-400 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-red-100 text-red-700 flex items-center justify-center">
              <svg className="w-8 h-8 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-slate-900">Delete This Bill?</h3>
              <p className="text-sm font-semibold text-slate-600">
                Are you sure you want to permanently delete bill{' '}
                <span className="font-mono font-bold text-slate-900">{invoice.invoice_no}</span>?
                This action cannot be undone.
              </p>
            </div>

            {deleteError && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-900">
                {deleteError}
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setShowDeleteModal(false)}
                className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-300 font-bold text-slate-700 hover:bg-slate-100"
              >
                Keep Bill
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="flex-1 min-h-[48px] rounded-xl bg-red-600 text-white font-black hover:bg-red-700 disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL CONFIRMATION MODAL (Phase 7) */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 no-print">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border-2 border-amber-400 space-y-4">
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
              <svg className="w-8 h-8 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-xl font-black text-slate-900">Cancel Bill {invoice.invoice_no}?</h3>
              <p className="text-sm font-semibold text-slate-600">
                Are you sure you want to cancel this bill? The invoice will be stamped{' '}
                <strong className="text-red-700">CANCELLED &amp; VOID</strong>, and excluded from sales reports totals.
                The number will be retained in your sequence.
              </p>
            </div>

            {cancelError && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-900">
                {cancelError}
              </div>
            )}

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                disabled={isCancelling}
                onClick={() => setShowCancelModal(false)}
                className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-300 font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Keep Active
              </button>
              <button
                type="button"
                disabled={isCancelling}
                onClick={handleConfirmCancel}
                className="flex-1 min-h-[48px] rounded-xl bg-amber-600 text-white font-black hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
              >
                {isCancelling ? 'Cancelling...' : 'Yes, Cancel Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BROWSER PRINT CONTAINER:
          Renders N copies (e.g. 3 copies) for window.print() only.
          Hidden completely on screen so layout never breaks.
      */}
      <div
        id="print-container"
        className="hidden print:block"
        style={{
          width: '210mm',
        }}
      >
        {Array.from({ length: copyCount }).map((_, cIdx) => {
          const label = getCopyLabel(cIdx, labelCopiesEnabled);
          return (
            <React.Fragment key={cIdx}>
              {paginatedPages.map((page) => (
                <InvoicePage
                  key={`print-${cIdx}-${page.pageNumber}`}
                  invoice={invoice}
                  firmProfile={firmProfile}
                  page={page}
                  copyLabel={label}
                />
              ))}
            </React.Fragment>
          );
        })}
      </div>

      {/* OFF-SCREEN PDF CONTAINER:
          Renders strictly ONE single clean format without copy labels (Original/Duplicate/etc)
          for html2canvas PDF download and sharing.
          Positioned off-screen safely so viewport never shifts or breaks.
      */}
      <div
        id="pdf-download-container"
        className="no-print pointer-events-none select-none"
        aria-hidden="true"
        style={{
          position: 'fixed',
          top: 0,
          left: '-9999px',
          width: '794px',
          opacity: 0,
          zIndex: -9999,
        }}
      >
        {paginatedPages.map((page) => (
          <InvoicePage
            key={`pdf-${page.pageNumber}`}
            invoice={invoice}
            firmProfile={firmProfile}
            page={page}
            copyLabel=""
          />
        ))}
      </div>
    </div>
  );
}
