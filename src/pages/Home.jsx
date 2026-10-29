import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatRupees, formatDisplayDate, computeBillStats } from '../lib/billUtils.js';
import { financialYear, formatInvoiceNo } from '../lib/tax.js';

export default function Home() {
  const currentFy = financialYear(new Date());
  const [firmName, setFirmName] = useState('KHANSA ENTERPRISES');
  const [invoices, setInvoices] = useState([]);
  const [nextBillNo, setNextBillNo] = useState(null);
  const [isNumberingSet, setIsNumberingSet] = useState(false);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      // 1. Fetch Firm Profile
      const { data: firmData, error: firmErr } = await supabase
        .from('firm_profile')
        .select('name')
        .eq('id', 1)
        .maybeSingle();

      if (!firmErr && firmData?.name) {
        setFirmName(firmData.name);
      }

      // 2. Fetch Numbering Status for current FY
      const { data: numData } = await supabase.rpc('get_numbering_status', { p_fy: currentFy });
      if (numData?.is_set) {
        setIsNumberingSet(true);
        setNextBillNo(formatInvoiceNo(numData.last_number + 1, currentFy));
      } else {
        // Fallback: check counters table directly
        const { data: counterRow } = await supabase
          .from('counters')
          .select('last_number')
          .eq('fy', currentFy)
          .maybeSingle();

        if (counterRow) {
          setIsNumberingSet(true);
          setNextBillNo(formatInvoiceNo(counterRow.last_number + 1, currentFy));
        } else {
          setIsNumberingSet(false);
          setNextBillNo(null);
        }
      }

      // 3. Fetch Recent 20 Invoices (newest first)
      const { data: invData, error: invErr } = await supabase
        .from('invoices')
        .select('id, invoice_no, invoice_date, buyer_name, payable_paise, status, created_at')
        .order('created_at', { ascending: false })
        .limit(20);

      if (invErr) {
        throw invErr;
      }

      setInvoices(invData || []);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
      setErrorMsg(err.message || 'Failed to load bills. Please check your network connection.');
    } finally {
      setLoading(false);
    }
  }, [currentFy]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const stats = computeBillStats(invoices);

  return (
    <div className="space-y-6">
      {/* Firm Header */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center space-x-3.5">
            <img
              src="/KhansaEnterprises.jpg"
              alt="Khansa Enterprises Logo"
              className="w-12 h-12 rounded-xl object-contain bg-white border border-slate-200 shadow-sm p-0.5 shrink-0"
            />
            <div>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Supplier Business
              </p>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
                {firmName}
              </h2>
            </div>
          </div>
          {isNumberingSet && nextBillNo && (
            <div className="text-right">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block">
                Next Bill
              </span>
              <span className="text-lg font-black text-blue-700 bg-blue-50 px-2.5 py-1 rounded-xl border border-blue-200 inline-block mt-0.5">
                {nextBillNo}
              </span>
            </div>
          )}
        </div>

        {!loading && !isNumberingSet && (
          <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between text-xs sm:text-sm font-bold text-amber-900 bg-amber-50 p-2.5 rounded-xl border border-amber-300">
            <span>Starting bill number not set for FY {currentFy}</span>
            <Link to="/settings" className="underline font-black text-blue-800 ml-2">
              Set in Settings &rarr;
            </Link>
          </div>
        )}
      </div>

      {/* Prominent "New Bill" Button */}
      <Link
        to="/new"
        className="w-full min-h-[58px] px-6 py-4 rounded-2xl bg-blue-700 hover:bg-blue-800 active:bg-blue-900 text-white flex items-center justify-center space-x-3 shadow-md transition transform active:scale-[0.99]"
      >
        <svg className="w-7 h-7 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span className="text-xl font-extrabold tracking-wide uppercase">
          New Bill
        </span>
      </Link>

      {/* Summary Statistics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Today Card */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Today's Bills
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-blue-100 text-blue-900">
              {stats.todayCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2 truncate">
            {formatRupees(stats.todayTotalPaise)}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Active bills today
          </p>
        </div>

        {/* This Month Card */}
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
              This Month
            </span>
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-emerald-100 text-emerald-900">
              {stats.monthCount}
            </span>
          </div>
          <p className="text-xl sm:text-2xl font-black text-slate-900 mt-2 truncate">
            {formatRupees(stats.monthTotalPaise)}
          </p>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Active this month
          </p>
        </div>
      </div>

      {/* Recent Bills Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h3 className="text-xl font-black text-slate-900">
            Recent Bills
          </h3>
          <button
            onClick={loadData}
            disabled={loading}
            className="text-sm font-bold text-blue-700 hover:text-blue-900 flex items-center space-x-1 py-1 px-2.5 rounded-lg border border-slate-300 bg-white"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Refresh</span>
          </button>
        </div>

        {/* Error Display */}
        {errorMsg && (
          <div className="bg-red-50 border-2 border-red-500 rounded-2xl p-4 text-red-900">
            <p className="text-base font-bold">{errorMsg}</p>
            <button
              onClick={loadData}
              className="mt-2 text-sm font-bold bg-red-600 text-white px-4 py-2 rounded-xl"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border-2 border-slate-200 p-4 animate-pulse space-y-3"
              >
                <div className="flex justify-between">
                  <div className="h-5 bg-slate-200 rounded w-1/3"></div>
                  <div className="h-5 bg-slate-200 rounded w-1/4"></div>
                </div>
                <div className="h-4 bg-slate-200 rounded w-1/2"></div>
                <div className="h-6 bg-slate-200 rounded w-1/3"></div>
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && !errorMsg && invoices.length === 0 && (
          <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center space-y-3">
            <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-slate-800">
              No bills found yet
            </p>
            <p className="text-sm text-slate-500 max-w-xs mx-auto">
              Tap the "New Bill" button above to start creating your first GST invoice.
            </p>
          </div>
        )}

        {/* Invoices List */}
        {!loading && invoices.length > 0 && (
          <div className="space-y-3">
            {invoices.map((inv) => {
              const isCancelled = inv.status === 'cancelled';
              return (
                <div
                  key={inv.id}
                  className={`bg-white rounded-2xl border-2 p-4 shadow-sm transition ${
                    isCancelled ? 'border-red-300 bg-red-50/30' : 'border-slate-300'
                  }`}
                >
                  {/* Top row: Invoice No & Tag / Date */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg font-black text-slate-950">
                        {inv.invoice_no}
                      </span>
                      {isCancelled && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-black bg-red-600 text-white tracking-wide uppercase">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-slate-600 shrink-0">
                      {formatDisplayDate(inv.invoice_date)}
                    </span>
                  </div>

                  {/* Middle row: Buyer Name */}
                  <p className="text-base font-bold text-slate-800 mt-1.5 leading-snug">
                    {inv.buyer_name}
                  </p>

                  {/* Bottom row: Amount in Rupees */}
                  <div className="mt-2.5 pt-2 border-t border-slate-200 flex items-baseline justify-between">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Total Payable
                    </span>
                    <span
                      className={`text-lg font-black tracking-tight ${
                        isCancelled ? 'line-through text-slate-400' : 'text-slate-950'
                      }`}
                    >
                      {formatRupees(inv.payable_paise)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
