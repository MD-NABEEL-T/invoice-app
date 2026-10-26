import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { financialYear, formatInvoiceNo } from '../lib/tax.js';
import { validateGSTIN } from '../lib/itemValidation.js';

export default function Settings() {
  const currentFy = financialYear(new Date());

  // Firm Profile State
  const [firm, setFirm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    gstin: '',
    declaration: '',
  });
  const [firmLoading, setFirmLoading] = useState(true);
  const [firmSaving, setFirmSaving] = useState(false);
  const [firmSuccessMsg, setFirmSuccessMsg] = useState('');
  const [firmErrorMsg, setFirmErrorMsg] = useState('');
  const [gstinWarning, setGstinWarning] = useState(null);

  // Numbering Status State
  const [numbering, setNumbering] = useState({ isSet: false, lastNumber: null });
  const [hasBillsInFy, setHasBillsInFy] = useState(false);
  const [numberingLoading, setNumberingLoading] = useState(true);
  const [startNumberInput, setStartNumberInput] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showChangeModal, setShowChangeModal] = useState(false);
  const [changeNumberInput, setChangeNumberInput] = useState('');
  const [changingNumber, setChangingNumber] = useState(false);
  const [numberingSaving, setNumberingSaving] = useState(false);
  const [numberingMsg, setNumberingMsg] = useState({ type: '', text: '' });

  // Print & PDF copy label preference
  const [labelCopies, setLabelCopies] = useState(() => {
    try {
      return localStorage.getItem('khansa_label_copies') === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleLabelCopies = () => {
    const nextVal = !labelCopies;
    setLabelCopies(nextVal);
    try {
      localStorage.setItem('khansa_label_copies', String(nextVal));
    } catch (e) {
      console.error('Failed to save copy label preference:', e);
    }
  };

  // Google Apps Script / Email Webhook state
  const [webhookUrl, setWebhookUrl] = useState(() => {
    try {
      return localStorage.getItem('khansa_gsheet_webhook_url') || '';
    } catch {
      return '';
    }
  });
  const [webhookStatus, setWebhookStatus] = useState('');

  const handleSaveWebhook = (e) => {
    e.preventDefault();
    try {
      localStorage.setItem('khansa_gsheet_webhook_url', webhookUrl.trim());
      setWebhookStatus('Webhook URL saved successfully!');
      setTimeout(() => setWebhookStatus(''), 4000);
    } catch (err) {
      setWebhookStatus(`Failed to save: ${err.message}`);
    }
  };

  // 1. Load Firm Profile
  const loadFirmProfile = useCallback(async () => {
    setFirmLoading(true);
    setFirmErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('firm_profile')
        .select('name, address, phone, email, gstin, declaration')
        .eq('id', 1)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        setFirm({
          name: data.name || '',
          address: data.address || '',
          phone: data.phone || '',
          email: data.email || '',
          gstin: data.gstin || '',
          declaration: data.declaration || '',
        });
        if (data.gstin) {
          const val = validateGSTIN(data.gstin);
          setGstinWarning(val.warning);
        }
      }
    } catch (err) {
      console.error('Error loading firm profile:', err);
      setFirmErrorMsg(err.message || 'Could not load firm profile.');
    } finally {
      setFirmLoading(false);
    }
  }, []);

  // 2. Load FY Numbering Status & Check if Bills Exist
  const loadNumberingStatus = useCallback(async () => {
    setNumberingLoading(true);
    try {
      // Check if bills already exist in this FY
      const { count: billCount } = await supabase
        .from('invoices')
        .select('id', { count: 'exact', head: true })
        .eq('fy', currentFy);

      setHasBillsInFy(Boolean(billCount && billCount > 0));

      const { data, error } = await supabase.rpc('get_numbering_status', { p_fy: currentFy });
      if (!error && data) {
        setNumbering({
          isSet: Boolean(data.is_set),
          lastNumber: data.last_number !== undefined ? data.last_number : null,
        });
      } else {
        // Fallback: Check if counters row exists
        const { data: counterData } = await supabase
          .from('counters')
          .select('last_number')
          .eq('fy', currentFy)
          .maybeSingle();

        if (counterData) {
          setNumbering({ isSet: true, lastNumber: counterData.last_number });
        } else {
          setNumbering({ isSet: false, lastNumber: null });
        }
      }
    } catch (err) {
      console.error('Error loading numbering status:', err);
    } finally {
      setNumberingLoading(false);
    }
  }, [currentFy]);

  useEffect(() => {
    loadFirmProfile();
    loadNumberingStatus();
  }, [loadFirmProfile, loadNumberingStatus]);

  // Handle Firm Profile Save
  const handleSaveFirm = async (e) => {
    e.preventDefault();
    setFirmSaving(true);
    setFirmSuccessMsg('');
    setFirmErrorMsg('');

    try {
      const { error } = await supabase
        .from('firm_profile')
        .update({
          name: firm.name.trim(),
          address: firm.address.trim(),
          phone: firm.phone.trim() || null,
          email: firm.email.trim() || null,
          gstin: firm.gstin.trim().toUpperCase(),
          declaration: firm.declaration.trim(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 1);

      if (error) throw error;
      setFirmSuccessMsg('Firm profile updated successfully!');
      setTimeout(() => setFirmSuccessMsg(''), 4000);
    } catch (err) {
      setFirmErrorMsg(err.message || 'Failed to update firm profile.');
    } finally {
      setFirmSaving(false);
    }
  };

  // Handle Set Starting Number
  const handleConfirmStartingNumber = async () => {
    const num = parseInt(startNumberInput, 10);
    if (isNaN(num) || num < 0) {
      setNumberingMsg({ type: 'error', text: 'Please enter a valid starting number (0 or higher).' });
      setShowConfirmModal(false);
      return;
    }

    setNumberingSaving(true);
    setNumberingMsg({ type: '', text: '' });

    try {
      const { error } = await supabase.rpc('set_starting_number', {
        p_fy: currentFy,
        p_last_used: num,
      });

      if (error) throw error;

      setNumberingMsg({
        type: 'success',
        text: `Starting number set to ${num} for FY ${currentFy}! Next bill will be ${formatInvoiceNo(num + 1, currentFy)}.`,
      });
      setShowConfirmModal(false);
      setStartNumberInput('');
      await loadNumberingStatus();
    } catch (err) {
      setNumberingMsg({
        type: 'error',
        text: err.message || 'Could not set starting number. It may already be set.',
      });
      setShowConfirmModal(false);
    } finally {
      setNumberingSaving(false);
    }
  };

  // Handle Change Starting Number (Phase 4b)
  const handleConfirmChangeNumber = async () => {
    const num = parseInt(changeNumberInput, 10);
    if (isNaN(num) || num < 0) {
      setNumberingMsg({ type: 'error', text: 'Please enter a valid starting number (0 or higher).' });
      setShowChangeModal(false);
      return;
    }

    setChangingNumber(true);
    setNumberingMsg({ type: '', text: '' });

    try {
      const { error } = await supabase.rpc('change_starting_number', {
        p_fy: currentFy,
        p_last_used: num,
      });

      if (error) throw error;

      setNumberingMsg({
        type: 'success',
        text: `Starting number updated to ${num} for FY ${currentFy}! Next bill will be ${formatInvoiceNo(num + 1, currentFy)}.`,
      });
      setShowChangeModal(false);
      setChangeNumberInput('');
      await loadNumberingStatus();
    } catch (err) {
      setNumberingMsg({
        type: 'error',
        text: err.message || 'Could not change starting number.',
      });
      setShowChangeModal(false);
    } finally {
      setChangingNumber(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Settings
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Business details and invoice series
          </p>
        </div>
        <Link
          to="/more"
          className="text-sm font-bold text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded-xl hover:bg-slate-50"
        >
          &larr; More Menu
        </Link>
      </div>

      {/* CARD 1: INVOICE NUMBERING SERIES */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
          <div>
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Financial Year {currentFy}
            </span>
            <h3 className="text-xl font-black text-slate-900 mt-0.5">
              Invoice Numbering Series
            </h3>
          </div>
          {numbering.isSet ? (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-400">
              Series Active
            </span>
          ) : (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-400">
              Not Set
            </span>
          )}
        </div>

        {numberingMsg.text && (
          <div
            className={`p-4 rounded-xl border-2 text-base font-bold ${
              numberingMsg.type === 'error'
                ? 'bg-red-50 border-red-500 text-red-900'
                : 'bg-emerald-50 border-emerald-500 text-emerald-900'
            }`}
          >
            {numberingMsg.text}
          </div>
        )}

        {numberingLoading ? (
          <div className="py-4 text-center text-slate-500 font-semibold">
            Checking numbering status...
          </div>
        ) : numbering.isSet ? (
          /* Series is Already Set */
          <div className="bg-slate-50 rounded-xl border-2 border-slate-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-slate-600">Last Bill Number Used:</span>
              <span className="text-xl font-black text-slate-900">{numbering.lastNumber}</span>
            </div>
            <div className="flex items-center justify-between pt-1 border-t border-slate-200">
              <span className="text-sm font-bold text-slate-600">Next Bill to be Generated:</span>
              <span className="text-xl font-black text-blue-700">
                {formatInvoiceNo((numbering.lastNumber ?? 0) + 1, currentFy)}
              </span>
            </div>

            {hasBillsInFy ? (
              <div className="pt-2 border-t border-slate-200 flex items-center space-x-2 text-slate-700">
                <svg className="w-5 h-5 text-slate-600 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span className="text-sm font-bold text-slate-800">
                  Locked because bills have been made
                </span>
              </div>
            ) : (
              <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <p className="text-xs text-slate-500 font-medium">
                  No bills created yet in FY {currentFy}. You can change the starting number if needed.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setChangeNumberInput(String(numbering.lastNumber ?? 0));
                    setShowChangeModal(true);
                  }}
                  className="min-h-[48px] px-4 py-2 rounded-xl bg-white border-2 border-blue-600 text-blue-700 font-black text-sm hover:bg-blue-50 active:bg-blue-100 transition shrink-0"
                >
                  Change number
                </button>
              </div>
            )}
          </div>
        ) : (
          /* Series NOT set yet */
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-amber-50 border-2 border-amber-400 text-amber-950 text-sm font-medium leading-relaxed">
              <p className="font-bold text-base mb-1 text-amber-900">
                Starting number required before creating bills:
              </p>
              Enter the last invoice number already used this financial year in your Excel bills. If you are starting fresh from invoice 001, enter <strong>0</strong>. If you already issued bills up to 047 in Excel, enter <strong>47</strong>.
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setShowConfirmModal(true);
              }}
              className="space-y-3"
            >
              <div>
                <label htmlFor="startNum" className="block text-base font-bold text-slate-900 mb-1">
                  Last Invoice Number Used in FY {currentFy}
                </label>
                <input
                  id="startNum"
                  type="number"
                  min="0"
                  step="1"
                  required
                  value={startNumberInput}
                  onChange={(e) => setStartNumberInput(e.target.value)}
                  placeholder="e.g. 0 or 47"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-lg font-bold focus:outline-none focus:border-slate-900"
                />
              </div>

              <button
                type="submit"
                disabled={numberingSaving || startNumberInput === ''}
                className="w-full min-h-[50px] px-6 py-3 rounded-xl bg-slate-900 text-white font-bold text-lg hover:bg-slate-800 disabled:opacity-50"
              >
                Set Starting Number
              </button>
            </form>
          </div>
        )}
      </div>

      {/* CONFIRMATION DIALOG MODAL */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h4 className="text-xl font-black text-slate-900 text-center">
              Confirm Starting Number
            </h4>
            <div className="text-base font-semibold text-slate-700 text-center leading-relaxed">
              Are you sure you want to set the last used number to <span className="font-black text-slate-950 text-lg">"{startNumberInput}"</span> for FY <span className="font-black text-slate-950">{currentFy}</span>?
              <p className="mt-2 text-sm text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-300 font-bold">
                Note: You can adjust this number until your first bill is made. Once any bill exists, it is permanently locked.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border-2 border-slate-400 font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStartingNumber}
                disabled={numberingSaving}
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-700 text-white font-black hover:bg-blue-800"
              >
                {numberingSaving ? 'Saving...' : 'Yes, Set It'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMATION DIALOG MODAL FOR CHANGING STARTING NUMBER */}
      {showChangeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center mx-auto">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </div>
            <h4 className="text-xl font-black text-slate-900 text-center">
              Change Starting Number
            </h4>
            <div className="space-y-3">
              <p className="text-sm font-semibold text-slate-700">
                Enter the updated last invoice number used before generating bills in FY <strong>{currentFy}</strong>:
              </p>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={changeNumberInput}
                onChange={(e) => setChangeNumberInput(e.target.value)}
                placeholder="e.g. 0 or 47"
                className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-xl font-black focus:outline-none focus:border-slate-900"
              />
              <p className="text-xs text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-300 font-bold">
                Confirmation: This change is only allowed while zero bills exist in FY {currentFy}. Once bills are created, this series will be locked.
              </p>
            </div>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowChangeModal(false)}
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl border-2 border-slate-400 font-bold text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmChangeNumber}
                disabled={changingNumber || changeNumberInput === ''}
                className="flex-1 min-h-[48px] px-4 py-2.5 rounded-xl bg-blue-700 text-white font-black hover:bg-blue-800 disabled:opacity-50"
              >
                {changingNumber ? 'Updating...' : 'Confirm Change'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CARD 2: FIRM PROFILE EDITING */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Supplier Firm
          </span>
          <h3 className="text-xl font-black text-slate-900 mt-0.5">
            Business Details
          </h3>
        </div>

        {firmSuccessMsg && (
          <div className="p-4 rounded-xl bg-emerald-50 border-2 border-emerald-500 text-emerald-900 text-base font-bold">
            {firmSuccessMsg}
          </div>
        )}
        {firmErrorMsg && (
          <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900 text-base font-bold">
            {firmErrorMsg}
          </div>
        )}

        {firmLoading ? (
          <div className="py-6 text-center text-slate-500 font-semibold">
            Loading business profile...
          </div>
        ) : (
          <form onSubmit={handleSaveFirm} className="space-y-4">
            {/* Firm Name */}
            <div>
              <label htmlFor="firmName" className="block text-base font-bold text-slate-900 mb-1">
                Firm Name *
              </label>
              <input
                id="firmName"
                type="text"
                required
                value={firm.name}
                onChange={(e) => setFirm({ ...firm, name: e.target.value })}
                className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-lg font-semibold focus:border-slate-900"
              />
            </div>

            {/* Address */}
            <div>
              <label htmlFor="firmAddress" className="block text-base font-bold text-slate-900 mb-1">
                Address *
              </label>
              <textarea
                id="firmAddress"
                rows="3"
                required
                value={firm.address}
                onChange={(e) => setFirm({ ...firm, address: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:border-slate-900"
              ></textarea>
            </div>

            {/* GSTIN */}
            <div>
              <label htmlFor="firmGstin" className="block text-base font-bold text-slate-900 mb-1">
                Firm GSTIN *
              </label>
              <input
                id="firmGstin"
                type="text"
                required
                value={firm.gstin}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase();
                  setFirm({ ...firm, gstin: val });
                  const check = validateGSTIN(val);
                  setGstinWarning(check.warning);
                }}
                className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-lg font-mono font-bold focus:border-slate-900 uppercase"
              />
              {gstinWarning && (
                <p className="mt-1.5 text-sm font-bold text-amber-700 flex items-center gap-1">
                  <span>⚠️</span> {gstinWarning}
                </p>
              )}
            </div>

            {/* Phone & Email */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="firmPhone" className="block text-base font-bold text-slate-900 mb-1">
                  Phone
                </label>
                <input
                  id="firmPhone"
                  type="text"
                  value={firm.phone}
                  onChange={(e) => setFirm({ ...firm, phone: e.target.value })}
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:border-slate-900"
                />
              </div>
              <div>
                <label htmlFor="firmEmail" className="block text-base font-bold text-slate-900 mb-1">
                  Email
                </label>
                <input
                  id="firmEmail"
                  type="email"
                  value={firm.email}
                  onChange={(e) => setFirm({ ...firm, email: e.target.value })}
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:border-slate-900"
                />
              </div>
            </div>

            {/* Declaration */}
            <div>
              <label htmlFor="firmDeclaration" className="block text-base font-bold text-slate-900 mb-1">
                Bill Declaration Text *
              </label>
              <textarea
                id="firmDeclaration"
                rows="2"
                required
                value={firm.declaration}
                onChange={(e) => setFirm({ ...firm, declaration: e.target.value })}
                className="w-full px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-sm font-semibold focus:border-slate-900"
              ></textarea>
            </div>

            {/* Save Button */}
            <button
              type="submit"
              disabled={firmSaving}
              className="w-full min-h-[52px] px-6 py-3.5 rounded-xl bg-slate-900 text-white font-bold text-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {firmSaving ? 'Saving Profile...' : 'Save Business Profile'}
            </button>
          </form>
        )}
      </div>

      {/* CARD 3: PRINT & PDF OPTIONS */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Print &amp; PDF Options
          </span>
          <h3 className="text-xl font-black text-slate-900 mt-0.5">
            Invoice Copy Labels
          </h3>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border-2 border-slate-200 bg-slate-50">
          <div className="space-y-1">
            <span className="text-base font-bold text-slate-900 block">
              Label copies Original / Duplicate / Triplicate
            </span>
            <p className="text-xs font-medium text-slate-600 max-w-xl">
              When enabled, printed copies and PDF pages are labeled in the top right corner (&quot;ORIGINAL FOR RECIPIENT&quot;, &quot;DUPLICATE FOR TRANSPORTER&quot;, &quot;TRIPLICATE FOR SUPPLIER&quot;). Stored locally in this browser.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={labelCopies}
            onClick={handleToggleLabelCopies}
            className={`relative inline-flex h-8 w-14 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              labelCopies ? 'bg-blue-700' : 'bg-slate-300'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                labelCopies ? 'translate-x-6' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* CARD 4: EMAIL & GOOGLE SHEETS AUTOMATION */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="border-b border-slate-200 pb-3">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Email &amp; Sheets Automation
          </span>
          <h3 className="text-xl font-black text-slate-900 mt-0.5">
            Google Apps Script Webhook
          </h3>
        </div>

        <p className="text-xs font-medium text-slate-600 leading-relaxed">
          Automatically dispatch each finalized bill to Google Sheets and send email notification to{' '}
          <strong className="text-slate-900 font-bold">khansaenterprises19@gmail.com</strong>.
        </p>

        {webhookStatus && (
          <div className="p-3 bg-emerald-50 border border-emerald-400 rounded-xl text-xs font-bold text-emerald-950">
            {webhookStatus}
          </div>
        )}

        <form onSubmit={handleSaveWebhook} className="space-y-3">
          <div>
            <label htmlFor="webhookUrlInput" className="block text-sm font-bold text-slate-900 mb-1">
              Apps Script Webhook URL (POST)
            </label>
            <input
              id="webhookUrlInput"
              type="url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://script.google.com/macros/s/.../exec"
              className="w-full min-h-[48px] px-4 py-2.5 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-sm font-mono focus:border-slate-900"
            />
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="submit"
              className="min-h-[44px] px-5 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 cursor-pointer"
            >
              Save Webhook URL
            </button>
            {webhookUrl && (
              <button
                type="button"
                onClick={() => {
                  setWebhookUrl('');
                  localStorage.removeItem('khansa_gsheet_webhook_url');
                  setWebhookStatus('Webhook URL removed.');
                  setTimeout(() => setWebhookStatus(''), 3000);
                }}
                className="min-h-[44px] px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold text-xs hover:bg-slate-50 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        </form>
      </div>

      {/* App Version Info Footer */}
      <div className="pt-4 pb-2 text-center text-xs font-semibold text-slate-500">
        <p>Khansa Enterprises &bull; GST Invoicing App</p>
        <p className="font-mono text-xs text-slate-600 mt-1">
          App version: <span className="font-bold text-slate-900 bg-slate-200 px-2 py-0.5 rounded">{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}</span>
        </p>
      </div>
    </div>
  );
}
