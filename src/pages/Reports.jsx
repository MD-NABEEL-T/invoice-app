import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { financialYear } from '../lib/tax.js';
import { formatRupees, formatDisplayDate } from '../lib/billUtils.js';
import {
  buildHardcopyStatementRows,
  buildGstRegisterRows,
  buildHsnSummaryRows,
  exportMonthEndExcel,
} from '../lib/reports.js';

const MONTH_NAMES = [
  { val: 'all', label: 'All Months' },
  { val: '04', label: 'April' },
  { val: '05', label: 'May' },
  { val: '06', label: 'June' },
  { val: '07', label: 'July' },
  { val: '08', label: 'August' },
  { val: '09', label: 'September' },
  { val: '10', label: 'October' },
  { val: '11', label: 'November' },
  { val: '12', label: 'December' },
  { val: '01', label: 'January' },
  { val: '02', label: 'February' },
  { val: '03', label: 'March' },
];

export default function Reports() {
  const currentFy = financialYear(new Date());
  const [selectedFy, setSelectedFy] = useState(currentFy);
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedBuyer, setSelectedBuyer] = useState('all');

  const [invoices, setInvoices] = useState([]);
  const [buyersList, setBuyersList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [activeTab, setActiveTab] = useState('hardcopy'); // 'hardcopy' | 'gst' | 'hsn'
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState('');

  // 1. Fetch Invoices and Buyers for the selected FY
  useEffect(() => {
    let isCancelled = false;

    async function loadReportData() {
      setLoading(true);
      setErrorMsg('');
      try {
        let query = supabase
          .from('invoices')
          .select('*, lines:invoice_lines(*)')
          .order('invoice_date', { ascending: true });

        if (selectedFy !== 'all') {
          query = query.eq('fy', selectedFy);
        }

        const { data, error } = await query;
        if (error) throw error;

        // Fetch distinct buyers
        const { data: bData } = await supabase
          .from('buyers')
          .select('id, name')
          .order('name', { ascending: true });

        if (!isCancelled) {
          setInvoices(data || []);
          setBuyersList(bData || []);
        }
      } catch (err) {
        console.error('Error fetching report data:', err);
        if (!isCancelled) {
          setErrorMsg(err.message || 'Failed to load report data.');
        }
      } finally {
        if (!isCancelled) {
          setLoading(false);
        }
      }
    }

    loadReportData();

    return () => {
      isCancelled = true;
    };
  }, [selectedFy]);

  // 2. Filter invoices by month and buyer
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      if (selectedMonth !== 'all') {
        const invMonth = inv.invoice_date?.slice(5, 7);
        if (invMonth !== selectedMonth) return false;
      }
      if (selectedBuyer !== 'all') {
        if (inv.buyer_name !== selectedBuyer && inv.buyer_id !== selectedBuyer) {
          return false;
        }
      }
      return true;
    });
  }, [invoices, selectedMonth, selectedBuyer]);

  // 3. Aggregate totals for KPI cards
  const kpiTotals = useMemo(() => {
    const active = filteredInvoices.filter((inv) => inv.status !== 'cancelled');
    const cancelledCount = filteredInvoices.length - active.length;

    const taxablePaise = active.reduce((sum, inv) => sum + (Number(inv.taxable_paise) || 0), 0);
    const cgstPaise = active.reduce((sum, inv) => sum + (Number(inv.cgst_paise) || 0), 0);
    const sgstPaise = active.reduce((sum, inv) => sum + (Number(inv.sgst_paise) || 0), 0);
    const payablePaise = active.reduce((sum, inv) => sum + (Number(inv.payable_paise) || 0), 0);

    return {
      totalCount: filteredInvoices.length,
      activeCount: active.length,
      cancelledCount,
      taxablePaise,
      cgstPaise,
      sgstPaise,
      totalTaxPaise: cgstPaise + sgstPaise,
      payablePaise,
    };
  }, [filteredInvoices]);

  // 4. Build tabular data
  const hardcopyRows = useMemo(
    () => buildHardcopyStatementRows(filteredInvoices),
    [filteredInvoices]
  );
  const gstRows = useMemo(
    () => buildGstRegisterRows(filteredInvoices),
    [filteredInvoices]
  );
  const hsnRows = useMemo(
    () => buildHsnSummaryRows(filteredInvoices),
    [filteredInvoices]
  );

  // 5. Excel Export Trigger
  const handleExportExcel = async () => {
    setExporting(true);
    setExportMessage('');
    try {
      const monthObj = MONTH_NAMES.find((m) => m.val === selectedMonth);
      const monthTitle = monthObj ? monthObj.label : 'All';
      const periodTitle = `FY_${selectedFy}_${monthTitle}`;

      const res = await exportMonthEndExcel({
        invoices: filteredInvoices,
        periodTitle,
      });

      setExportMessage(`Successfully exported ${res.filename}!`);
      setTimeout(() => setExportMessage(''), 5000);
    } catch (err) {
      console.error('Excel export error:', err);
      setExportMessage(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Monthly GST Reports
          </h2>
          <p className="text-sm font-semibold text-slate-500">
            Excel exports for Buyer Statement, GST Register &amp; HSN Summary
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/reports/import"
            className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white border-2 border-slate-300 text-slate-800 font-black text-sm hover:bg-slate-100 shadow-sm flex items-center justify-center space-x-2 transition cursor-pointer active:scale-95"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            <span>Import Monthly Excel</span>
          </Link>

          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || filteredInvoices.length === 0}
            className="min-h-[48px] px-5 py-2.5 rounded-2xl bg-emerald-700 text-white font-black text-sm hover:bg-emerald-800 disabled:opacity-40 shadow-sm flex items-center justify-center space-x-2 transition cursor-pointer active:scale-95"
          >
            <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>{exporting ? 'Exporting...' : 'Export to Excel (.xlsx)'}</span>
          </button>
        </div>
      </div>

      {exportMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 font-bold text-sm flex items-center justify-between no-print">
          <span>{exportMessage}</span>
          <button
            type="button"
            onClick={() => setExportMessage('')}
            className="text-emerald-700 hover:text-emerald-900 font-black text-base"
          >
            &times;
          </button>
        </div>
      )}

      {/* Filter Controls Card */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-4 sm:p-5 shadow-sm space-y-3 no-print">
        <span className="text-xs font-black uppercase text-slate-400 tracking-wider block">
          Report Filter Parameters
        </span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* FY Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Financial Year
            </label>
            <select
              value={selectedFy}
              onChange={(e) => setSelectedFy(e.target.value)}
              className="w-full min-h-[46px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 font-bold text-sm bg-slate-50 focus:bg-white"
            >
              <option value="26-27">FY 2026-27</option>
              <option value="25-26">FY 2025-26</option>
              <option value="all">All Financial Years</option>
            </select>
          </div>

          {/* Month Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Month
            </label>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="w-full min-h-[46px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 font-bold text-sm bg-slate-50 focus:bg-white"
            >
              {MONTH_NAMES.map((m) => (
                <option key={m.val} value={m.val}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Buyer Filter */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Buyer Company
            </label>
            <select
              value={selectedBuyer}
              onChange={(e) => setSelectedBuyer(e.target.value)}
              className="w-full min-h-[46px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 font-bold text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">All Buyers</option>
              {buyersList.map((b) => (
                <option key={b.id} value={b.name}>
                  {b.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-500 text-red-900 font-bold">
          {errorMsg}
        </div>
      )}

      {/* KPI Cards Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">
            Bills Issued
          </span>
          <span className="text-2xl font-black font-mono text-slate-900 block mt-1">
            {kpiTotals.activeCount}
          </span>
          {kpiTotals.cancelledCount > 0 && (
            <span className="text-[11px] font-bold text-red-600 block mt-0.5">
              +{kpiTotals.cancelledCount} cancelled
            </span>
          )}
        </div>

        <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">
            Total Taxable
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 block mt-1">
            {formatRupees(kpiTotals.taxablePaise)}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            Excl. GST
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border-2 border-slate-300 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wide block">
            Total GST (50/50)
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-slate-900 block mt-1">
            {formatRupees(kpiTotals.totalTaxPaise)}
          </span>
          <span className="text-[11px] font-semibold text-slate-500 block mt-0.5">
            CGST + SGST
          </span>
        </div>

        <div className="bg-blue-50/70 p-4 rounded-2xl border-2 border-blue-300 shadow-sm">
          <span className="text-xs font-bold text-blue-700 uppercase tracking-wide block">
            Total Revenue
          </span>
          <span className="text-xl sm:text-2xl font-black font-mono text-blue-950 block mt-1">
            {formatRupees(kpiTotals.payablePaise)}
          </span>
          <span className="text-[11px] font-bold text-blue-700 block mt-0.5">
            Grand Total
          </span>
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex border-b-2 border-slate-300 space-x-2 no-print overflow-x-auto pb-0.5">
        <button
          type="button"
          onClick={() => setActiveTab('hardcopy')}
          className={`py-2 px-4 rounded-t-xl text-sm font-black border-t-2 border-l-2 border-r-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'hardcopy'
              ? 'bg-white text-slate-900 border-slate-400 -mb-[2px] z-10'
              : 'bg-slate-100 text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          1. Buyer Statement (HARDCOPY)
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('gst')}
          className={`py-2 px-4 rounded-t-xl text-sm font-black border-t-2 border-l-2 border-r-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'gst'
              ? 'bg-white text-slate-900 border-slate-400 -mb-[2px] z-10'
              : 'bg-slate-100 text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          2. GST Sales Register
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('hsn')}
          className={`py-2 px-4 rounded-t-xl text-sm font-black border-t-2 border-l-2 border-r-2 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'hsn'
              ? 'bg-white text-slate-900 border-slate-400 -mb-[2px] z-10'
              : 'bg-slate-100 text-slate-600 border-transparent hover:text-slate-900'
          }`}
        >
          3. HSN-wise Summary
        </button>
      </div>

      {loading && (
        <div className="text-center py-12 text-slate-500 font-bold">
          Generating report data...
        </div>
      )}

      {!loading && filteredInvoices.length === 0 && (
        <div className="bg-white rounded-3xl border-2 border-dashed border-slate-300 p-8 text-center space-y-2">
          <p className="text-lg font-bold text-slate-800">No invoices in this period</p>
          <p className="text-sm text-slate-500">
            Try switching the financial year or month filter above.
          </p>
        </div>
      )}

      {/* TAB 1: Buyer Statement (HARDCOPY) */}
      {!loading && filteredInvoices.length > 0 && activeTab === 'hardcopy' && (
        <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-base font-black text-slate-900">
                Buyer Hardcopy Statement
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                Statement of bills with PO and DC reference numbers
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {hardcopyRows.length} entries
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-semibold">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Invoice No</th>
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2">PO No / Date</th>
                  <th className="py-2.5 px-2">DC No / Date</th>
                  <th className="py-2.5 px-2 text-right">Taxable</th>
                  <th className="py-2.5 px-2 text-right">CGST</th>
                  <th className="py-2.5 px-2 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">Total Amount</th>
                  <th className="py-2.5 px-2 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {hardcopyRows.map((r, idx) => {
                  const isCanc = r.Status === 'CANCELLED';
                  return (
                    <tr key={idx} className={isCanc ? 'bg-red-50/50 text-red-900' : 'hover:bg-slate-50'}>
                      <td className="py-2.5 px-3 font-bold">
                        <Link
                          to={`/bills/${filteredInvoices[idx]?.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {r['Invoice No']}
                        </Link>
                      </td>
                      <td className="py-2.5 px-2 font-sans">{r['Invoice Date']}</td>
                      <td className="py-2.5 px-2 font-sans">
                        {r['PO / Order No']} <span className="text-slate-400 font-normal">({r['PO Date']})</span>
                      </td>
                      <td className="py-2.5 px-2 font-sans">
                        {r['DC / Delivery No']} <span className="text-slate-400 font-normal">({r['Delivery Date']})</span>
                      </td>
                      <td className="py-2.5 px-2 text-right">{r['Taxable Value (₹)'].toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right">{r['CGST (₹)'].toFixed(2)}</td>
                      <td className="py-2.5 px-2 text-right">{r['SGST (₹)'].toFixed(2)}</td>
                      <td className="py-2.5 px-3 text-right font-black text-slate-900">
                        {r['Total Amount (₹)'].toFixed(2)}
                      </td>
                      <td className="py-2.5 px-2 text-center font-sans font-black text-[10px]">
                        {isCanc ? (
                          <span className="px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-300">
                            CANCELLED
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                            FINAL
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: GST Sales Register */}
      {!loading && filteredInvoices.length > 0 && activeTab === 'gst' && (
        <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-base font-black text-slate-900">
                GST Sales Register
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                Monthly rate-wise taxable values and tax breakdown
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {gstRows.length} active bills
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-semibold">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">Invoice No</th>
                  <th className="py-2.5 px-2">Date</th>
                  <th className="py-2.5 px-2">Buyer Name</th>
                  <th className="py-2.5 px-2 text-right">5% Taxable</th>
                  <th className="py-2.5 px-2 text-right">18% Taxable</th>
                  <th className="py-2.5 px-2 text-right">Total Taxable</th>
                  <th className="py-2.5 px-2 text-right">Total CGST</th>
                  <th className="py-2.5 px-2 text-right">Total SGST</th>
                  <th className="py-2.5 px-3 text-right">Invoice Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {gstRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-blue-700">
                      {r['Invoice No']}
                    </td>
                    <td className="py-2.5 px-2 font-sans">{r['Invoice Date']}</td>
                    <td className="py-2.5 px-2 font-sans truncate max-w-[150px]">
                      {r['Buyer Name']}
                    </td>
                    <td className="py-2.5 px-2 text-right">{r['5% Taxable (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right">{r['18% Taxable (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-slate-900">
                      {r['Total Taxable (₹)'].toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right">{r['Total CGST (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right">{r['Total SGST (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      {r['Invoice Total (₹)'].toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: HSN Summary */}
      {!loading && filteredInvoices.length > 0 && activeTab === 'hsn' && (
        <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
            <div>
              <h3 className="text-base font-black text-slate-900">
                HSN-wise Summary
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                Aggregated quantities and taxable values per HSN code
              </p>
            </div>
            <span className="text-xs font-bold text-slate-600 font-mono">
              {hsnRows.length} HSN groups
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-semibold">
              <thead className="bg-slate-100 text-slate-700 font-black uppercase border-b border-slate-300">
                <tr>
                  <th className="py-2.5 px-3">HSN / SAC</th>
                  <th className="py-2.5 px-2">Sample Description</th>
                  <th className="py-2.5 px-2 text-right">Quantity</th>
                  <th className="py-2.5 px-2 text-center">Unit</th>
                  <th className="py-2.5 px-2 text-center">GST Rate</th>
                  <th className="py-2.5 px-2 text-right">Taxable Value</th>
                  <th className="py-2.5 px-2 text-right">CGST</th>
                  <th className="py-2.5 px-2 text-right">SGST</th>
                  <th className="py-2.5 px-3 text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-mono">
                {hsnRows.map((r, idx) => (
                  <tr key={idx} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{r['HSN / SAC']}</td>
                    <td className="py-2.5 px-2 font-sans truncate max-w-[180px]">
                      {r['Description / Sample Item']}
                    </td>
                    <td className="py-2.5 px-2 text-right font-bold">{r['Total Quantity']}</td>
                    <td className="py-2.5 px-2 text-center font-sans uppercase text-[11px]">{r['Unit']}</td>
                    <td className="py-2.5 px-2 text-center">{r['GST Rate']}</td>
                    <td className="py-2.5 px-2 text-right font-bold text-slate-900">
                      {r['Taxable Value (₹)'].toFixed(2)}
                    </td>
                    <td className="py-2.5 px-2 text-right">{r['Central Tax CGST (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-2 text-right">{r['State Tax SGST (₹)'].toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-black text-slate-900">
                      {r['Total Tax (₹)'].toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
