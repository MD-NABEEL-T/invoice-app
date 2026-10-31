import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function MonthlyReportImport() {
  const navigate = useNavigate();

  // Buyers list from DB
  const [buyers, setBuyers] = useState([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [loadingBuyers, setLoadingBuyers] = useState(true);

  // File & Parsing state
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [workbookRef, setWorkbookRef] = useState(null);

  const [parsedInvoices, setParsedInvoices] = useState([]);
  const [existingInvoiceNos, setExistingInvoiceNos] = useState(new Set());
  const [isParsing, setIsParsing] = useState(false);
  const [parsingError, setParsingError] = useState('');

  // Import Execution state
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResult, setImportResult] = useState(null);

  // 1. Fetch buyers and existing invoice numbers for deduplication
  useEffect(() => {
    async function loadInitialData() {
      try {
        const [buyersRes, invoicesRes] = await Promise.all([
          supabase.from('buyers').select('*').order('name', { ascending: true }),
          supabase.from('invoices').select('invoice_no'),
        ]);

        if (buyersRes.data && buyersRes.data.length > 0) {
          setBuyers(buyersRes.data);
          setSelectedBuyerId(buyersRes.data[0].id);
        }

        if (invoicesRes.data) {
          const set = new Set(invoicesRes.data.map((inv) => (inv.invoice_no || '').trim().toLowerCase()));
          setExistingInvoiceNos(set);
        }
      } catch (err) {
        console.error('Initial data load error:', err);
      } finally {
        setLoadingBuyers(false);
      }
    }
    loadInitialData();
  }, []);

  // Fetch branches when selectedBuyerId changes
  useEffect(() => {
    if (!selectedBuyerId) return;
    async function loadBranches() {
      const { data } = await supabase
        .from('buyer_addresses')
        .select('*')
        .eq('buyer_id', selectedBuyerId);
      setBranches(data || []);
      if (data && data.length > 0) {
        setSelectedBranchId(data[0].id);
      } else {
        setSelectedBranchId('');
      }
    }
    loadBranches();
  }, [selectedBuyerId]);

  // Helper: Parse Excel date codes or date strings to YYYY-MM-DD
  const formatExcelDate = (val, XLSX) => {
    if (!val) return new Date().toISOString().slice(0, 10);
    if (typeof val === 'number') {
      try {
        const parsed = XLSX.SSF.parse_date_code(val);
        if (parsed && parsed.y) {
          return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
        }
      } catch (e) {
        console.warn('SSF parse date code error:', e);
      }
      const d = new Date(Math.round((val - 25569) * 86400 * 1000));
      return isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : d.toISOString().slice(0, 10);
    }
    if (typeof val === 'string') {
      const clean = val.trim();
      const parts = clean.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length === 4) return clean; // Already YYYY-MM-DD
        const day = parts[0].padStart(2, '0');
        const month = parts[1].padStart(2, '0');
        const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
        return `${year}-${month}-${day}`;
      }
    }
    return String(val);
  };

  // Helper: Extract Financial Year from Date or Invoice No
  const extractFy = (invoiceNo, dateStr) => {
    if (invoiceNo && invoiceNo.includes('/')) {
      const parts = invoiceNo.split('/');
      const fyCandidate = parts[parts.length - 1].trim();
      if (/^\d{2}-\d{2}$/.test(fyCandidate)) return fyCandidate;
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getFullYear();
      const month = d.getMonth() + 1; // 1-12
      const startYear = month >= 4 ? year : year - 1;
      const endYear = startYear + 1;
      return `${String(startYear % 100).padStart(2, '0')}-${String(endYear % 100).padStart(2, '0')}`;
    }
    return '26-27';
  };

  // Helper: Extract Sequential Number from Invoice No
  const extractNumber = (invoiceNo) => {
    if (!invoiceNo) return 1;
    const match = invoiceNo.match(/^(\d+)/);
    return match ? parseInt(match[1], 10) : 1;
  };

  // 2. Parse selected sheet from workbook
  const parseSheetData = (wb, sheetName, XLSX) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) throw new Error(`Sheet "${sheetName}" not found in workbook.`);

    // Read rows using raw array mode to locate header row
    const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, range: 0, raw: true });
    if (!rawRows || rawRows.length === 0) {
      throw new Error(`Sheet "${sheetName}" is empty.`);
    }

    // Locate header row index containing 'INVOICE'
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
      const row = rawRows[i];
      if (Array.isArray(row)) {
        const text = row.map((cell) => String(cell || '').toUpperCase()).join(' ');
        if (text.includes('INVOICE NO') || text.includes('INVOICE') || text.includes('TAXABLE VALUE')) {
          headerIdx = i;
          break;
        }
      }
    }

    if (headerIdx === -1) {
      throw new Error('Could not find header row with "INVOICE NO" in the selected sheet.');
    }

    // Parse records using identified header
    const rows = XLSX.utils.sheet_to_json(ws, { range: headerIdx });

    const invoices = [];
    rows.forEach((r, idx) => {
      // Normalize row keys by trimming and uppercasing
      const clean = {};
      Object.keys(r).forEach((k) => {
        clean[k.trim().toUpperCase()] = r[k];
      });

      const invNoRaw = clean['INVOICE NO'] || clean['INVOICE'] || clean['BILL NO'] || clean['INV NO'];
      if (!invNoRaw) return; // Skip empty rows or summary/total rows

      const invoiceNo = String(invNoRaw).trim();
      // Skip totals row
      if (invoiceNo.toLowerCase().includes('total') || invoiceNo.toLowerCase().includes('grand')) return;

      const rawDate = clean['INVOICE DATE'] || clean['DATE'] || clean['INV DATE'];
      const invoiceDate = formatExcelDate(rawDate, XLSX);
      const fy = extractFy(invoiceNo, invoiceDate);
      const number = extractNumber(invoiceNo);

      const rawTaxable = parseFloat(clean['TAXABLE VALUE'] || clean['TAXABLE'] || clean['BASIC'] || 0);
      const rawCgst = parseFloat(clean['CGST'] || clean['CGST AMOUNT'] || 0);
      const rawSgst = parseFloat(clean['SGST'] || clean['SGST AMOUNT'] || 0);
      const rawAmount = parseFloat(clean['AMOUNT'] || clean['TOTAL'] || clean['NET AMOUNT'] || 0);

      // Handle GST % rate
      let rawRate = clean['%'] || clean['RATE'] || clean['GST %'] || 0.18;
      if (typeof rawRate === 'number' && rawRate < 1) {
        rawRate = Math.round(rawRate * 100); // 0.18 -> 18
      } else {
        rawRate = parseFloat(rawRate) || 18;
      }

      const taxablePaise = Math.round(rawTaxable * 100);
      const cgstPaise = Math.round(rawCgst * 100);
      const sgstPaise = Math.round(rawSgst * 100);
      const payablePaise = rawAmount > 0 ? Math.round(rawAmount * 100) : (taxablePaise + cgstPaise + sgstPaise);

      const dcNo = clean['DC NO'] || clean['DC'] || clean['CHALLAN NO'] || clean['DELIVERY NO'] || null;
      const rawDcDate = clean['DC DATE'] || clean['CHALLAN DATE'] || null;
      const dcDate = rawDcDate ? formatExcelDate(rawDcDate, XLSX) : null;

      const poNo = clean['PO NO'] || clean['PO'] || clean['ORDER NO'] || clean['BUYER ORDER NO'] || null;
      const rawPoDate = clean['PO DATE'] || clean['ORDER DATE'] || null;
      const poDate = rawPoDate ? formatExcelDate(rawPoDate, XLSX) : null;

      const alreadyExists = existingInvoiceNos.has(invoiceNo.toLowerCase());

      invoices.push({
        id: idx + 1,
        invoice_no: invoiceNo,
        number,
        fy,
        invoice_date: invoiceDate,
        dc_no: dcNo ? String(dcNo).trim() : null,
        dc_date: dcDate,
        po_no: poNo ? String(poNo).trim() : null,
        po_date: poDate,
        taxable_paise: taxablePaise,
        cgst_paise: cgstPaise,
        sgst_paise: sgstPaise,
        payable_paise: payablePaise,
        gst_percent: rawRate,
        taxable_rupees: (taxablePaise / 100).toFixed(2),
        payable_rupees: (payablePaise / 100).toFixed(2),
        alreadyExists,
      });
    });

    return invoices;
  };

  // 3. Handle File Selection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsingError('');
    setImportResult(null);
    setIsParsing(true);

    try {
      const [XLSX, buffer] = await Promise.all([
        import('xlsx'),
        file.arrayBuffer(),
      ]);

      // Use sheetRows clamp to avoid 1M row hangs on poorly bounded Excel files
      const wb = XLSX.read(buffer, { type: 'array', sheetRows: 500 });
      setWorkbookRef(wb);
      setSheetNames(wb.SheetNames);

      // Prefer HARDCOPY or GST sheet
      let targetSheet = wb.SheetNames[0];
      if (wb.SheetNames.includes('HARDCOPY')) {
        targetSheet = 'HARDCOPY';
      } else if (wb.SheetNames.includes('GST')) {
        targetSheet = 'GST';
      }
      setSelectedSheet(targetSheet);

      const parsed = parseSheetData(wb, targetSheet, XLSX);
      setParsedInvoices(parsed);
    } catch (err) {
      console.error('File parsing error:', err);
      setParsingError(err.message || 'Failed to read Excel workbook.');
      setParsedInvoices([]);
    } finally {
      setIsParsing(false);
    }
  };

  // 4. Handle switching sheet
  const handleSheetChange = async (e) => {
    const newSheet = e.target.value;
    setSelectedSheet(newSheet);
    if (!workbookRef) return;
    setIsParsing(true);
    setParsingError('');
    try {
      const XLSX = await import('xlsx');
      const parsed = parseSheetData(workbookRef, newSheet, XLSX);
      setParsedInvoices(parsed);
    } catch (err) {
      setParsingError(err.message || 'Failed to parse sheet data.');
      setParsedInvoices([]);
    } finally {
      setIsParsing(false);
    }
  };

  // 5. Execute Batch Import into Supabase
  const handleExecuteImport = async () => {
    const selectedBuyer = buyers.find((b) => b.id === selectedBuyerId);
    if (!selectedBuyer) {
      alert('Please select a Buyer to link these invoices to.');
      return;
    }

    const selectedBranch = branches.find((br) => br.id === selectedBranchId);
    const buyerAddressText = selectedBranch?.address || selectedBuyer.address || '';

    const toImport = parsedInvoices.filter((inv) => !inv.alreadyExists);
    if (toImport.length === 0) {
      alert('No new invoices to import (all invoices in this sheet already exist in the database).');
      return;
    }

    setIsImporting(true);
    setImportProgress(0);

    let successCount = 0;
    let failCount = 0;

    try {
      for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i];

        // 1. Insert invoice record
        const { data: invData, error: invErr } = await supabase
          .from('invoices')
          .insert({
            invoice_no: item.invoice_no,
            number: item.number,
            fy: item.fy,
            invoice_date: item.invoice_date,
            status: 'finalized',
            buyer_id: selectedBuyer.id,
            buyer_name: selectedBuyer.name,
            buyer_gstin: selectedBuyer.gstin || '33AAACK4841R1ZA',
            buyer_state_code: selectedBuyer.state_code || '33',
            buyer_address: buyerAddressText,
            delivery_no: item.dc_no,
            delivery_date: item.dc_date,
            buyer_order_no: item.po_no,
            buyer_order_date: item.po_date,
            taxable_paise: item.taxable_paise,
            cgst_paise: item.cgst_paise,
            sgst_paise: item.sgst_paise,
            payable_paise: item.payable_paise,
          })
          .select('id')
          .single();

        if (invErr) {
          console.warn(`Error inserting invoice ${item.invoice_no}:`, invErr);
          failCount++;
        } else if (invData?.id) {
          // 2. Insert summary item line
          const desc = item.po_no ? `JOB WORK / SALE (PO: ${item.po_no})` : 'JOB WORK / GOODS';
          await supabase.from('invoice_lines').insert({
            invoice_id: invData.id,
            line_no: 1,
            description: desc,
            hsn: 'MISC',
            quantity: 1,
            unit: 'LOT',
            gst_percent: item.gst_percent,
            rate_paise: item.taxable_paise,
            taxable_value_paise: item.taxable_paise,
          });
          successCount++;
        }

        setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
      }

      setImportResult({
        total: toImport.length,
        success: successCount,
        failed: failCount,
      });

      // Update existing set with newly inserted invoice numbers
      const updatedSet = new Set(existingInvoiceNos);
      toImport.forEach((inv) => updatedSet.add(inv.invoice_no.toLowerCase()));
      setExistingInvoiceNos(updatedSet);

      // Re-mark parsed invoices
      setParsedInvoices((prev) =>
        prev.map((inv) => ({
          ...inv,
          alreadyExists: updatedSet.has(inv.invoice_no.toLowerCase()),
        }))
      );
    } catch (err) {
      console.error('Batch import execution failed:', err);
      alert('Import encountered an error: ' + err.message);
    } finally {
      setIsImporting(false);
    }
  };

  const newInvoicesCount = parsedInvoices.filter((inv) => !inv.alreadyExists).length;
  const skippedCount = parsedInvoices.filter((inv) => inv.alreadyExists).length;
  const totalTaxable = parsedInvoices.reduce((acc, inv) => acc + (inv.taxable_paise / 100), 0);
  const totalPayable = parsedInvoices.reduce((acc, inv) => acc + (inv.payable_paise / 100), 0);

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28">
      {/* Top App Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              to="/more"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              aria-label="Back to More"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-black tracking-wide">Import Monthly Bills</h1>
              <p className="text-xs text-slate-400">Upload past monthly Excel workbooks into database</p>
            </div>
          </div>
          <Link
            to="/reports"
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
          >
            View Reports
          </Link>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Instructions Banner */}
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs leading-relaxed space-y-1.5">
          <div className="font-bold flex items-center gap-1.5 text-sm text-amber-950">
            <span>📋</span> Compatible with your standard monthly Excel workbooks
          </div>
          <p>
            Supports workbooks like <b>SALES FOR THE MONTH OF AUG 2026.xlsx</b> or <b>tax format.xlsx</b>.
            The app automatically reads the <b>HARDCOPY</b> statement with invoice numbers, dates, DC/PO details, and GST amounts.
          </p>
        </div>

        {/* Step 1: Buyer Assignment */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">1</span>
            Select Buyer to Link Invoices
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="buyerSelect" className="block text-xs font-bold text-slate-700 mb-1">
                Buyer Firm
              </label>
              <select
                id="buyerSelect"
                value={selectedBuyerId}
                onChange={(e) => setSelectedBuyerId(e.target.value)}
                disabled={loadingBuyers}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {buyers.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="branchSelect" className="block text-xs font-bold text-slate-700 mb-1">
                Delivery Branch / Unit
              </label>
              <select
                id="branchSelect"
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                disabled={branches.length === 0}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {branches.length > 0 ? (
                  branches.map((br) => (
                    <option key={br.id} value={br.id}>
                      {br.label || br.branch_name || 'Unit Address'}
                    </option>
                  ))
                ) : (
                  <option value="">Default Address</option>
                )}
              </select>
            </div>
          </div>
        </div>

        {/* Step 2: Choose File */}
        <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">2</span>
            Choose Monthly Excel File (.xlsx)
          </h2>

          <div className="relative border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-blue-500 hover:bg-blue-50/30 transition">
            <input
              type="file"
              accept=".xlsx, .xls, .xlsm"
              onChange={handleFileChange}
              disabled={isParsing || isImporting}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            />
            <div className="space-y-2 pointer-events-none">
              <div className="w-12 h-12 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
                📁
              </div>
              <div className="text-sm font-bold text-slate-800">
                {fileName ? fileName : 'Tap to select monthly Excel workbook'}
              </div>
              <p className="text-xs text-slate-400">
                Supports .xlsx or .xlsm files with HARDCOPY or GST sales sheets
              </p>
            </div>
          </div>

          {/* Sheet Selector (if multiple sheets exist) */}
          {sheetNames.length > 1 && (
            <div className="flex items-center gap-3 pt-2">
              <label htmlFor="sheetSelect" className="text-xs font-bold text-slate-600 whitespace-nowrap">
                Worksheet:
              </label>
              <select
                id="sheetSelect"
                value={selectedSheet}
                onChange={handleSheetChange}
                className="px-3 py-1.5 bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold text-slate-800"
              >
                {sheetNames.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          )}

          {parsingError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs font-bold text-red-700">
              ⚠️ {parsingError}
            </div>
          )}
        </div>

        {/* Step 3: Parsed Invoices Preview & Actions */}
        {parsedInvoices.length > 0 && (
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">3</span>
                  Preview Parsed Invoices ({parsedInvoices.length})
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Ready to import: <b className="text-emerald-700">{newInvoicesCount} new</b>
                  {skippedCount > 0 && (
                    <span className="text-slate-400 ml-2">({skippedCount} already in DB)</span>
                  )}
                </p>
              </div>

              <button
                type="button"
                onClick={handleExecuteImport}
                disabled={isImporting || newInvoicesCount === 0}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black text-sm shadow-md transition cursor-pointer flex items-center justify-center gap-2"
              >
                {isImporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Importing ({importProgress}%)...
                  </>
                ) : (
                  <>📥 Import {newInvoicesCount} Bills</>
                )}
              </button>
            </div>

            {/* Monthly KPI Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="text-[10px] font-bold text-slate-500 uppercase">Bills Found</div>
                <div className="text-lg font-black text-slate-900">{parsedInvoices.length}</div>
              </div>
              <div className="p-3 rounded-xl bg-blue-50 border border-blue-200">
                <div className="text-[10px] font-bold text-blue-600 uppercase">Taxable Value</div>
                <div className="text-lg font-black text-blue-900">₹{totalTaxable.toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200">
                <div className="text-[10px] font-bold text-indigo-600 uppercase">GST Amount</div>
                <div className="text-lg font-black text-indigo-900">₹{(totalPayable - totalTaxable).toFixed(2)}</div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                <div className="text-[10px] font-bold text-emerald-600 uppercase">Total Payable</div>
                <div className="text-lg font-black text-emerald-900">₹{totalPayable.toFixed(2)}</div>
              </div>
            </div>

            {/* Invoices Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-96">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-100 text-slate-700 font-black border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="p-2.5 text-center">#</th>
                    <th className="p-2.5">Invoice No</th>
                    <th className="p-2.5">Date</th>
                    <th className="p-2.5">DC No</th>
                    <th className="p-2.5">PO No</th>
                    <th className="p-2.5 text-right">Taxable</th>
                    <th className="p-2.5 text-center">GST %</th>
                    <th className="p-2.5 text-right">Payable</th>
                    <th className="p-2.5 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parsedInvoices.map((inv, idx) => (
                    <tr
                      key={inv.id}
                      className={inv.alreadyExists ? 'bg-slate-50 opacity-60' : 'hover:bg-slate-50'}
                    >
                      <td className="p-2.5 text-center font-bold text-slate-400">{idx + 1}</td>
                      <td className="p-2.5 font-bold text-slate-900 font-mono">{inv.invoice_no}</td>
                      <td className="p-2.5 text-slate-600">{inv.invoice_date}</td>
                      <td className="p-2.5 text-slate-600">{inv.dc_no || '-'}</td>
                      <td className="p-2.5 text-slate-600">{inv.po_no || '-'}</td>
                      <td className="p-2.5 text-right font-mono text-slate-700">₹{inv.taxable_rupees}</td>
                      <td className="p-2.5 text-center text-slate-700">{inv.gst_percent}%</td>
                      <td className="p-2.5 text-right font-mono font-bold text-slate-900">₹{inv.payable_rupees}</td>
                      <td className="p-2.5 text-center">
                        {inv.alreadyExists ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-200 text-slate-600">
                            In DB
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                            New
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Success Modal */}
        {importResult && (
          <div className="p-6 rounded-2xl bg-emerald-50 border-2 border-emerald-300 text-emerald-950 space-y-4 shadow-lg">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h3 className="text-base font-black">Monthly Invoices Successfully Imported!</h3>
                <p className="text-xs text-emerald-800">
                  Imported <b>{importResult.success}</b> bills into Supabase.
                  {importResult.failed > 0 && ` (${importResult.failed} failed)`}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <button
                type="button"
                onClick={() => navigate('/reports')}
                className="px-4 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold text-xs shadow cursor-pointer"
              >
                View in Monthly Reports &rarr;
              </button>
              <button
                type="button"
                onClick={() => navigate('/bills')}
                className="px-4 py-2 rounded-xl bg-white border border-emerald-300 text-emerald-900 hover:bg-emerald-100 font-bold text-xs shadow-sm cursor-pointer"
              >
                View All Bills &rarr;
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
