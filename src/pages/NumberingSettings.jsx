import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';

export default function NumberingSettings() {
  const navigate = useNavigate();

  const [fy, setFy] = useState('26-27');
  const [nextNumberInput, setNextNumberInput] = useState('1');
  const [constantSuffix, setConstantSuffix] = useState('/26-27');
  const [paddingDigits, setPaddingDigits] = useState('3'); // '3' -> 001, '0' -> 1

  const [currentCounter, setCurrentCounter] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState(null);

  // 1. Fetch current counter state for chosen FY
  useEffect(() => {
    async function loadCounter() {
      setLoading(true);
      setStatusMsg(null);
      try {
        const { data, error } = await supabase
          .from('counters')
          .select('*')
          .eq('fy', fy)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching counter:', error);
        }

        if (data) {
          setCurrentCounter(data);
          const nextVal = (data.last_number ?? 0) + 1;
          setNextNumberInput(String(nextVal));
        } else {
          setCurrentCounter({ fy, last_number: 0 });
          setNextNumberInput('1');
        }
      } catch (err) {
        console.error('Load counter error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadCounter();
    setConstantSuffix(`/${fy}`);
  }, [fy]);

  // Compute live preview
  const parsedNextNum = parseInt(nextNumberInput, 10);
  const isValidNum = !isNaN(parsedNextNum) && parsedNextNum >= 1;

  const formatNumberWithPad = (num) => {
    if (paddingDigits === '3') {
      return String(num).padStart(3, '0');
    }
    return String(num);
  };

  const previewInvoiceNo = isValidNum
    ? `${formatNumberWithPad(parsedNextNum)}${constantSuffix}`
    : '---';

  const previewUpcoming = isValidNum
    ? [parsedNextNum + 1, parsedNextNum + 2, parsedNextNum + 3]
        .map((n) => `${formatNumberWithPad(n)}${constantSuffix}`)
        .join(', ')
    : '---';

  // 2. Save new starting counter
  const handleSave = async (e) => {
    e.preventDefault();
    if (!isValidNum) {
      setStatusMsg({ type: 'error', text: 'Please enter a valid starting number (1 or higher).' });
      return;
    }

    setSaving(true);
    setStatusMsg(null);

    const targetLastNumber = parsedNextNum - 1;

    try {
      // 1. Try custom RPC set_invoice_counter
      const { error: rpcErr } = await supabase.rpc('set_invoice_counter', {
        p_fy: fy,
        p_next_number: parsedNextNum,
      });

      if (rpcErr) {
        console.warn('RPC set_invoice_counter not found or failed, using direct upsert fallback:', rpcErr);
        // Direct upsert on counters table
        const { error: upsertErr } = await supabase
          .from('counters')
          .upsert({ fy, last_number: targetLastNumber });

        if (upsertErr) throw upsertErr;
      }

      setCurrentCounter({ fy, last_number: targetLastNumber });
      setStatusMsg({
        type: 'success',
        text: `Starting number successfully updated! Next bill will be: ${previewInvoiceNo}`,
      });
    } catch (err) {
      console.error('Save starting number error:', err);
      setStatusMsg({
        type: 'error',
        text: err.message || 'Could not update starting number.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-28">
      {/* Top Header */}
      <div className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-30 shadow-md">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link
              to="/settings"
              className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 transition"
              aria-label="Back to Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div>
              <h1 className="text-lg font-black tracking-wide">Invoice Numbering Setup</h1>
              <p className="text-xs text-slate-400">Configure starting number and format</p>
            </div>
          </div>
          <Link
            to="/new"
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition"
          >
            New Bill
          </Link>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-6 space-y-6">
        {statusMsg && (
          <div
            className={`p-4 rounded-2xl border-2 font-bold text-xs flex items-center justify-between ${
              statusMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <span>{statusMsg.text}</span>
            <button
              type="button"
              onClick={() => setStatusMsg(null)}
              className="text-slate-500 hover:text-slate-800 font-bold ml-2"
            >
              &times;
            </button>
          </div>
        )}

        <form onSubmit={handleSave} className="space-y-5">
          {/* Question 1: Financial Year */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
            <label htmlFor="fySelect" className="block text-sm font-black text-slate-900">
              1. Which Financial Year are you setting?
            </label>
            <p className="text-xs text-slate-500 font-medium">
              Select the fiscal year for your invoice numbering series:
            </p>
            <select
              id="fySelect"
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              className="w-full min-h-[48px] px-3.5 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 font-bold text-sm bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
            >
              <option value="26-27">FY 2026-27 (26-27)</option>
              <option value="25-26">FY 2025-26 (25-26)</option>
              <option value="27-28">FY 2027-28 (27-28)</option>
            </select>
          </div>

          {/* Question 2: The number that updates */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
            <label htmlFor="nextNumInput" className="block text-sm font-black text-slate-900">
              2. Which number should update for the next bill?
            </label>
            <p className="text-xs text-slate-500 font-medium">
              Enter the exact sequence number for your next invoice. Every bill after this will automatically increment by 1.
            </p>
            <div className="flex items-center gap-3">
              <input
                id="nextNumInput"
                type="number"
                min="1"
                step="1"
                required
                value={nextNumberInput}
                onChange={(e) => setNextNumberInput(e.target.value)}
                placeholder="e.g. 1 or 141"
                className="w-full min-h-[50px] px-4 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 font-mono font-black text-xl bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
              />
              <div className="shrink-0 text-xs font-bold text-slate-500">
                (Last used was: <b>{currentCounter?.last_number ?? 0}</b>)
              </div>
            </div>
          </div>

          {/* Question 3: The text that stays constant */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
            <label htmlFor="constantSuffixInput" className="block text-sm font-black text-slate-900">
              3. Which part stays constant on every bill?
            </label>
            <p className="text-xs text-slate-500 font-medium">
              The suffix added after the invoice number (e.g. <code>/{fy}</code>):
            </p>
            <input
              id="constantSuffixInput"
              type="text"
              required
              value={constantSuffix}
              onChange={(e) => setConstantSuffix(e.target.value)}
              placeholder="e.g. /26-27"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border-2 border-slate-300 text-slate-900 font-mono font-bold text-base bg-slate-50 focus:bg-white focus:border-blue-600 outline-none"
            />
          </div>

          {/* Digits format option */}
          <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 space-y-2">
            <label className="block text-sm font-black text-slate-900">
              4. Number Display Style
            </label>
            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                type="button"
                onClick={() => setPaddingDigits('3')}
                className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                  paddingDigits === '3'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-bold text-sm">3 Digits (001, 002)</div>
                <div className="text-[11px] opacity-75">Standard official GST style</div>
              </button>

              <button
                type="button"
                onClick={() => setPaddingDigits('0')}
                className={`p-3 rounded-xl border-2 text-left transition cursor-pointer ${
                  paddingDigits === '0'
                    ? 'border-blue-600 bg-blue-50 text-blue-900'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <div className="font-bold text-sm">Plain (1, 2, 141)</div>
                <div className="text-[11px] opacity-75">Without leading zeros</div>
              </button>
            </div>
          </div>

          {/* LIVE VISUAL PREVIEW CARD */}
          <div className="p-5 rounded-2xl bg-gradient-to-br from-slate-900 to-blue-950 text-white shadow-xl space-y-3">
            <div className="text-[11px] font-bold tracking-widest uppercase text-blue-300">
              Live Invoice Preview
            </div>

            <div>
              <div className="text-xs text-slate-400">Your very next invoice will be issued as:</div>
              <div className="text-3xl font-black font-mono text-emerald-400 tracking-wider mt-1">
                {previewInvoiceNo}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800 text-xs text-slate-300">
              Subsequent bills will continue automatically:
              <div className="font-mono font-bold text-blue-200 mt-0.5">{previewUpcoming}</div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2 pt-2">
            <button
              type="submit"
              disabled={saving || !isValidNum}
              className="w-full min-h-[50px] px-6 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black text-base shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
            >
              {saving ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>✓ Save &amp; Apply Starting Number</>
              )}
            </button>

            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="w-full min-h-[44px] px-4 py-2 rounded-xl bg-transparent text-slate-600 hover:text-slate-900 font-bold text-xs transition"
            >
              Cancel &amp; Back to Settings
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
