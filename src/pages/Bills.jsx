import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatRupees, formatDisplayDate } from '../lib/billUtils.js';

export default function Bills() {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let isCancelled = false;

    async function loadInvoices() {
      setLoading(true);
      setErrorMsg('');
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('id, fy, number, invoice_no, invoice_date, buyer_name, payable_paise, status, created_at')
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!isCancelled) {
          setInvoices(data || []);
        }
      } catch (err) {
        console.error('Error fetching invoices:', err);
        if (!isCancelled) {
          setErrorMsg(err.message || 'Failed to load invoices.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadInvoices();

    return () => {
      isCancelled = true;
    };
  }, []);

  const filteredInvoices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter(
      (inv) =>
        inv.invoice_no?.toLowerCase().includes(q) ||
        inv.buyer_name?.toLowerCase().includes(q)
    );
  }, [invoices, searchQuery]);

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Bills Register
          </h2>
          <p className="text-sm font-semibold text-slate-500">
            {invoices.length} {invoices.length === 1 ? 'bill' : 'bills'} issued
          </p>
        </div>

        <Link
          to="/new"
          className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-blue-700 text-white font-black text-sm hover:bg-blue-800 shadow-sm flex items-center space-x-1"
        >
          <svg className="w-5 h-5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>New Bill</span>
        </Link>
      </div>

      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search bills by invoice number or buyer..."
          className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:border-slate-900"
        />
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-500 text-red-900 font-bold">
          {errorMsg}
        </div>
      )}

      {loading && (
        <div className="text-center py-8 text-slate-500 font-semibold">
          Loading bills...
        </div>
      )}

      {!loading && filteredInvoices.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-300 p-8 text-center space-y-3">
          <p className="text-lg font-bold text-slate-800">
            {searchQuery ? `No bills matching "${searchQuery}"` : 'No bills created yet'}
          </p>
          <p className="text-sm text-slate-500">
            Tap &ldquo;New Bill&rdquo; above to generate your first invoice.
          </p>
        </div>
      )}

      {!loading && filteredInvoices.length > 0 && (
        <div className="space-y-3">
          {filteredInvoices.map((inv) => {
            const isCancelled = inv.status === 'cancelled';

            return (
              <Link
                key={inv.id}
                to={`/bills/${inv.id}`}
                className={`block bg-white rounded-2xl border-2 p-4 shadow-sm hover:shadow transition space-y-2.5 active:bg-slate-50 ${
                  isCancelled ? 'border-red-200 bg-red-50/20' : 'border-slate-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      {formatDisplayDate(inv.invoice_date)}
                    </span>
                    <h3 className="text-xl font-black font-mono text-slate-900 leading-tight">
                      {inv.invoice_no}
                    </h3>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    {isCancelled ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-red-100 text-red-900 border border-red-400">
                        Cancelled
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-400">
                        Final
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-end justify-between border-t border-slate-100 pt-2">
                  <p className="text-sm font-bold text-slate-700 truncate max-w-[200px] sm:max-w-xs">
                    {inv.buyer_name}
                  </p>
                  <span className="text-lg font-black font-mono text-slate-900">
                    {formatRupees(inv.payable_paise)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
