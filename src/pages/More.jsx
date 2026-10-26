import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { paiseToRupees } from '../lib/tax.js';

export default function More() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Backup modal state
  const [backupModalOpen, setBackupModalOpen] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupStatus, setBackupStatus] = useState('');

  const menuSections = [
    {
      id: 'buyers',
      title: 'Buyers & Units',
      desc: 'KH Export India, branch units, and company delivery addresses',
      icon: (
        <svg className="w-6 h-6 text-blue-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      ),
    },
    {
      id: 'items',
      title: 'Items & HSN Catalog',
      desc: 'Products, units, HSN codes and GST rates',
      icon: (
        <svg className="w-6 h-6 text-indigo-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      id: 'reports',
      title: 'Monthly GST Reports',
      desc: 'Hardcopy buyer statement, GST register and HSN summary',
      icon: (
        <svg className="w-6 h-6 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      title: 'App Settings',
      desc: 'FY starting bill number, copy labels, and firm profile',
      icon: (
        <svg className="w-6 h-6 text-slate-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
    {
      id: 'backup',
      title: 'Backup & Export All Data',
      desc: 'Download complete backup of all bills, lines & catalogs',
      icon: (
        <svg className="w-6 h-6 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      ),
    },
  ];

  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch (err) {
      console.error('Sign out error:', err);
    } finally {
      setIsSigningOut(false);
    }
  };

  // Perform Complete Data Export (Excel / JSON)
  const handleExportData = async (format = 'excel') => {
    setIsBackingUp(true);
    setBackupStatus('Fetching database records...');
    try {
      const [invRes, linesRes, buyersRes, branchesRes, itemsRes, firmRes] = await Promise.all([
        supabase.from('invoices').select('*').order('created_at', { ascending: false }),
        supabase.from('invoice_lines').select('*'),
        supabase.from('buyers').select('*'),
        supabase.from('buyer_addresses').select('*'),
        supabase.from('items').select('*'),
        supabase.from('firm_profile').select('*'),
      ]);

      const timestamp = new Date().toISOString().slice(0, 10);

      if (format === 'json') {
        const fullBackup = {
          export_date: new Date().toISOString(),
          firm_profile: firmRes.data || [],
          buyers: buyersRes.data || [],
          buyer_addresses: branchesRes.data || [],
          items: itemsRes.data || [],
          invoices: invRes.data || [],
          invoice_lines: linesRes.data || [],
        };

        const jsonStr = JSON.stringify(fullBackup, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Khansa_Full_Backup_${timestamp}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        setBackupStatus(`Backup downloaded: Khansa_Full_Backup_${timestamp}.json`);
      } else {
        // Excel format with multiple sheets
        const XLSX = await import('xlsx');
        const wb = XLSX.utils.book_new();

        const formattedInvoices = (invRes.data || []).map((inv) => ({
          'Invoice No': inv.invoice_no,
          'Date': inv.invoice_date,
          'FY': inv.fy,
          'Buyer Name': inv.buyer_name,
          'GSTIN': inv.buyer_gstin,
          'PO No': inv.buyer_order_no,
          'PO Date': inv.buyer_order_date,
          'DC No': inv.delivery_no,
          'DC Date': inv.delivery_date,
          'Despatched Through': inv.despatched_through,
          'Taxable (₹)': paiseToRupees(inv.taxable_paise),
          'CGST (₹)': paiseToRupees(inv.cgst_paise),
          'SGST (₹)': paiseToRupees(inv.sgst_paise),
          'Total (₹)': paiseToRupees(inv.payable_paise),
          'Status': inv.status,
        }));

        const formattedLines = (linesRes.data || []).map((l) => ({
          'Invoice ID': l.invoice_id,
          'Line No': l.line_no,
          'Description': l.description,
          'HSN': l.hsn,
          'Unit': l.unit,
          'Quantity': l.qty_milli ? Number(l.qty_milli) / 1000 : 0,
          'Rate (₹)': paiseToRupees(l.rate_paise),
          'GST %': l.gst_percent,
          'Amount (₹)': paiseToRupees(l.amount_paise),
        }));

        const wsInvoices = XLSX.utils.json_to_sheet(formattedInvoices);
        const wsLines = XLSX.utils.json_to_sheet(formattedLines);
        const wsBuyers = XLSX.utils.json_to_sheet(buyersRes.data || []);
        const wsBranches = XLSX.utils.json_to_sheet(branchesRes.data || []);
        const wsItems = XLSX.utils.json_to_sheet(
          (itemsRes.data || []).map((it) => ({
            'Description': it.description,
            'HSN': it.hsn,
            'GST %': it.gst_percent,
            'Unit': it.unit,
            'Usual Rate (₹)': paiseToRupees(it.default_rate_paise),
            'Verified': it.verified ? 'YES' : 'NO',
            'Active': it.active ? 'YES' : 'NO',
          }))
        );

        XLSX.utils.book_append_sheet(wb, wsInvoices, 'Invoices');
        XLSX.utils.book_append_sheet(wb, wsLines, 'Invoice Lines');
        XLSX.utils.book_append_sheet(wb, wsBuyers, 'Buyers');
        XLSX.utils.book_append_sheet(wb, wsBranches, 'Delivery Units');
        XLSX.utils.book_append_sheet(wb, wsItems, 'Items Catalog');

        const filename = `Khansa_All_Data_Backup_${timestamp}.xlsx`;
        XLSX.writeFile(wb, filename);

        setBackupStatus(`Excel backup downloaded: ${filename}`);
      }
    } catch (err) {
      console.error('Backup error:', err);
      setBackupStatus(`Backup failed: ${err.message}`);
    } finally {
      setIsBackingUp(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Account Info Box */}
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-5 shadow-sm">
        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
          Signed In Account
        </p>
        <p className="text-lg font-black text-slate-900 mt-1 break-all">
          {user?.email || 'Authenticated User'}
        </p>
        <p className="text-xs font-semibold text-emerald-700 mt-1 flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-600 inline-block"></span>
          Session remains active on this device
        </p>
      </div>

      {/* Menu List */}
      <div className="space-y-3">
        <h3 className="text-lg font-black text-slate-900 px-1">
          Management &amp; Settings
        </h3>

        <div className="bg-white rounded-2xl border-2 border-slate-300 divide-y-2 divide-slate-200 overflow-hidden shadow-sm">
          {menuSections.map((item) => {
            return (
              <button
                key={item.id}
                onClick={() => {
                  if (item.id === 'buyers') navigate('/buyers');
                  else if (item.id === 'items') navigate('/items');
                  else if (item.id === 'reports') navigate('/reports');
                  else if (item.id === 'settings') navigate('/settings');
                  else if (item.id === 'backup') {
                    setBackupStatus('');
                    setBackupModalOpen(true);
                  }
                }}
                className="w-full min-h-[58px] p-4 text-left flex items-center justify-between hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer"
              >
                <div className="flex items-center space-x-3.5">
                  <div className="p-2 rounded-xl bg-slate-100 shrink-0">
                    {item.icon}
                  </div>
                  <div>
                    <p className="text-base font-bold text-slate-900">
                      {item.title}
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      {item.desc}
                    </p>
                  </div>
                </div>
                <span className="text-slate-400 font-black text-xl px-1">
                  &rsaquo;
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* BACKUP & EXPORT MODAL */}
      {backupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
                  Data Portability
                </span>
                <h3 className="text-xl font-black text-slate-900">
                  Backup &amp; Export All Data
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setBackupModalOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs font-semibold text-slate-600">
              Download your full database backup to ensure you always retain an independent copy of your bills, buyers, and items:
            </p>

            {backupStatus && (
              <div className="p-3 bg-blue-50 border border-blue-300 rounded-xl text-xs font-bold text-blue-900">
                {backupStatus}
              </div>
            )}

            <div className="space-y-2.5 pt-1">
              <button
                type="button"
                disabled={isBackingUp}
                onClick={() => handleExportData('excel')}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 disabled:opacity-50 flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                <span>Download Multi-Sheet Excel (.xlsx)</span>
              </button>

              <button
                type="button"
                disabled={isBackingUp}
                onClick={() => handleExportData('json')}
                className="w-full min-h-[48px] px-4 py-2.5 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 disabled:opacity-50 flex items-center justify-center space-x-2 transition cursor-pointer"
              >
                <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
                <span>Download Full Database JSON (.json)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign Out Section */}
      <div className="pt-2">
        <button
          onClick={handleSignOut}
          disabled={isSigningOut}
          className="w-full min-h-[52px] px-6 py-3.5 rounded-2xl border-2 border-red-500 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-900 font-bold text-lg flex items-center justify-center space-x-2.5 transition cursor-pointer"
        >
          {isSigningOut ? (
            <span className="flex items-center space-x-2">
              <span className="w-5 h-5 border-2 border-red-800/40 border-t-red-800 rounded-full animate-spin"></span>
              <span>Signing Out...</span>
            </span>
          ) : (
            <>
              <svg className="w-6 h-6 text-red-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              <span>Sign Out</span>
            </>
          )}
        </button>
        <p className="text-xs text-center text-slate-500 mt-2 font-medium">
          Only sign out if you want to switch accounts.
        </p>
      </div>
    </div>
  );
}
