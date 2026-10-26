import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { validateImportRow } from '../lib/itemValidation.js';
import { formatRupees } from '../lib/billUtils.js';

export default function ItemImport() {
  const navigate = useNavigate();
  const [existingNames, setExistingNames] = useState(new Set());
  const [loadingExisting, setLoadingExisting] = useState(true);

  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [parsingError, setParsingError] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  // 1. Fetch existing item names for case-insensitive deduplication
  useEffect(() => {
    async function loadExistingItems() {
      try {
        const { data, error } = await supabase.from('items').select('description');
        if (error) throw error;
        const set = new Set((data || []).map((i) => i.description.trim().toLowerCase()));
        setExistingNames(set);
      } catch (err) {
        console.error('Error fetching existing items:', err);
      } finally {
        setLoadingExisting(false);
      }
    }
    loadExistingItems();
  }, []);

  // 2. Handle File Selection
  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setParsingError('');
    setImportResult(null);

    try {
      const [XLSX, buffer] = await Promise.all([
        import('xlsx'),
        file.arrayBuffer(),
      ]);
      const wb = XLSX.read(buffer, { type: 'array' });

      // Look for sheet named "Items" or fall back to first sheet
      const sheetName = wb.SheetNames.includes('Items') ? 'Items' : wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      if (!sheet) {
        throw new Error('No readable sheet found in the workbook.');
      }

      const rawJson = XLSX.utils.sheet_to_json(sheet);
      if (rawJson.length === 0) {
        throw new Error('The chosen Excel sheet contains no item rows.');
      }

      // Process and validate each row
      const processed = rawJson.map((row, idx) => {
        const validation = validateImportRow(row);
        const nameKey = validation.parsedItem.description.toLowerCase();
        const alreadyExists = existingNames.has(nameKey);

        return {
          id: idx + 1,
          raw: row,
          parsed: validation.parsedItem,
          isValid: validation.isValid,
          errors: validation.errors,
          warnings: validation.warnings,
          alreadyExists,
        };
      });

      setParsedRows(processed);
    } catch (err) {
      console.error('Error parsing file:', err);
      setParsingError(err.message || 'Failed to parse Excel file. Please ensure it is a valid .xlsx file.');
      setParsedRows([]);
    }
  };

  // 3. Counts summary
  const rowsToInsert = parsedRows.filter((r) => r.isValid && !r.alreadyExists);
  const rowsSkippedExisting = parsedRows.filter((r) => r.alreadyExists);
  const rowsWithErrors = parsedRows.filter((r) => !r.isValid);

  // 4. Confirm & Import into Supabase
  const handleConfirmImport = async () => {
    if (rowsToInsert.length === 0) return;

    setIsImporting(true);
    setParsingError('');

    try {
      const payloads = rowsToInsert.map((r) => r.parsed);

      // Insert in chunks of 50 to avoid request size limits
      const chunkSize = 50;
      let insertedCount = 0;

      for (let i = 0; i < payloads.length; i += chunkSize) {
        const chunk = payloads.slice(i, i + chunkSize);
        const { error } = await supabase.from('items').insert(chunk);
        if (error) throw error;
        insertedCount += chunk.length;
      }

      setImportResult({
        inserted: insertedCount,
        skipped: rowsSkippedExisting.length,
        errors: rowsWithErrors.length,
      });
      setParsedRows([]);
    } catch (err) {
      console.error('Import error:', err);
      setParsingError(err.message || 'Database error while saving items.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Import Items from Excel
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Upload the confirmed item sheet filled by the son
          </p>
        </div>
        <Link
          to="/items"
          className="text-sm font-bold text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded-xl hover:bg-slate-50"
        >
          &larr; Items Catalog
        </Link>
      </div>

      {/* SUCCESS RESULT BANNER */}
      {importResult && (
        <div className="bg-emerald-50 border-2 border-emerald-500 rounded-2xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mx-auto">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h3 className="text-2xl font-black text-emerald-950">
            Import Completed Successfully!
          </h3>
          <div className="text-base font-semibold text-emerald-900 space-y-1">
            <p><strong>{importResult.inserted}</strong> new items added to your catalog.</p>
            {importResult.skipped > 0 && (
              <p className="text-sm text-emerald-800">{importResult.skipped} existing items were skipped.</p>
            )}
          </div>
          <div className="pt-2">
            <button
              onClick={() => navigate('/items')}
              className="min-h-[48px] px-6 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-base hover:bg-slate-800"
            >
              View Items in Catalog &rarr;
            </button>
          </div>
        </div>
      )}

      {/* UPLOAD FILE CARD */}
      {!importResult && (
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-6 shadow-sm space-y-4">
          <div className="border-2 border-dashed border-slate-300 rounded-2xl p-6 text-center hover:border-slate-500 transition bg-slate-50/50">
            <svg className="w-12 h-12 text-slate-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-base font-bold text-slate-900 mb-1">
              Select filled item sheet (.xlsx)
            </p>
            <p className="text-xs text-slate-500 max-w-xs mx-auto mb-4">
              Upload <code>item-sheet-for-son.xlsx</code> with confirmed HSN codes and GST rates.
            </p>

            <label className="inline-flex items-center justify-center min-h-[48px] px-6 py-3 rounded-xl bg-blue-700 text-white font-bold text-base hover:bg-blue-800 shadow cursor-pointer">
              <span>{fileName ? 'Choose Another File' : 'Browse File...'}</span>
              <input
                type="file"
                accept=".xlsx, .xls"
                onChange={handleFileChange}
                className="hidden"
              />
            </label>

            {fileName && (
              <p className="mt-3 text-sm font-black text-slate-800">
                Selected: <span className="font-mono text-blue-800">{fileName}</span>
              </p>
            )}
          </div>

          {parsingError && (
            <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900 font-bold text-sm">
              {parsingError}
            </div>
          )}
        </div>
      )}

      {/* PREVIEW & CONFIRM SECTION */}
      {!importResult && parsedRows.length > 0 && (
        <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h3 className="text-xl font-black text-slate-900">
                Import Preview
              </h3>
              <p className="text-xs font-semibold text-slate-500">
                {parsedRows.length} total rows parsed from sheet
              </p>
            </div>

            {/* Counts Badge */}
            <div className="flex items-center space-x-2 text-xs font-bold">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-400">
                {rowsToInsert.length} New to Insert
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 border border-slate-300">
                {rowsSkippedExisting.length} Already Exist
              </span>
              {rowsWithErrors.length > 0 && (
                <span className="px-2.5 py-1 rounded-lg bg-red-100 text-red-900 border border-red-400">
                  {rowsWithErrors.length} Errors
                </span>
              )}
            </div>
          </div>

          {/* Confirm Button */}
          <button
            onClick={handleConfirmImport}
            disabled={isImporting || rowsToInsert.length === 0}
            className="w-full min-h-[54px] px-6 py-3.5 rounded-xl bg-slate-900 text-white text-lg font-black hover:bg-slate-800 disabled:opacity-50 shadow-md"
          >
            {isImporting
              ? 'Importing into Database...'
              : rowsToInsert.length === 0
              ? 'No new items to insert'
              : `Confirm & Import ${rowsToInsert.length} Items`}
          </button>

          {/* Rows List / Table */}
          <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
            {parsedRows.map((r) => {
              const statusBadge = !r.isValid ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-black bg-red-100 text-red-900 border border-red-400">
                  Error
                </span>
              ) : r.alreadyExists ? (
                <span className="text-xs px-2 py-0.5 rounded-full font-black bg-slate-200 text-slate-700">
                  Already exists (skip)
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full font-black bg-emerald-100 text-emerald-900 border border-emerald-400">
                  Will Insert
                </span>
              );

              return (
                <div
                  key={r.id}
                  className={`p-3.5 rounded-xl border-2 text-sm space-y-1.5 ${
                    !r.isValid
                      ? 'border-red-300 bg-red-50/40'
                      : r.alreadyExists
                      ? 'border-slate-200 bg-slate-50 opacity-70'
                      : 'border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-black text-slate-900 text-base">
                      {r.parsed.description || <span className="text-red-600">[Blank Name]</span>}
                    </span>
                    {statusBadge}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs font-semibold text-slate-600">
                    <span>
                      HSN: <strong className="font-mono text-slate-900">{r.parsed.hsn || '-'}</strong>
                    </span>
                    <span>
                      GST: <strong className="text-slate-900">{r.parsed.gst_percent !== null ? `${r.parsed.gst_percent}%` : '-'}</strong>
                    </span>
                    <span>
                      Unit: <strong className="text-slate-900">{r.parsed.unit || '-'}</strong>
                    </span>
                    <span>
                      Rate: <strong className="text-slate-900">{r.parsed.default_rate_paise ? formatRupees(r.parsed.default_rate_paise) : '-'}</strong>
                    </span>
                    <span>
                      Verified:{' '}
                      <strong className={r.parsed.verified ? 'text-emerald-700' : 'text-slate-500'}>
                        {r.parsed.verified ? 'Yes (Confirmed)' : 'No (Needs check)'}
                      </strong>
                    </span>
                  </div>

                  {/* Errors and Warnings */}
                  {r.errors.length > 0 && (
                    <div className="text-xs font-bold text-red-700 pt-1">
                      {r.errors.map((err, i) => (
                        <p key={i}>&bull; {err}</p>
                      ))}
                    </div>
                  )}
                  {r.warnings.length > 0 && (
                    <div className="text-xs font-bold text-amber-700 pt-1">
                      {r.warnings.map((w, i) => (
                        <p key={i}>⚠️ {w}</p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
