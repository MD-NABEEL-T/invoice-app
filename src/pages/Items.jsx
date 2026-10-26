import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { formatRupees } from '../lib/billUtils.js';
import { paiseToRupees, rupeesToPaise } from '../lib/tax.js';
import { validateHSN } from '../lib/itemValidation.js';
import { COMMON_HSN_CODES } from '../lib/hsnCodes.js';

export default function Items() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'needs_checking' | 'verified'

  // HSN Guide modal
  const [hsnGuideOpen, setHsnGuideOpen] = useState(false);

  // Add / Edit Modal
  const [itemModal, setItemModal] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    id: null,
    description: '',
    unit: '',
    hsn: '',
    gst_percent: '',
    usual_rate_rupees: '',
    verified: false,
  });
  const [hsnWarning, setHsnWarning] = useState(null);
  const [savingItem, setSavingItem] = useState(false);

  // 1. Fetch Items
  const loadItems = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('items')
        .select('id, description, hsn, gst_percent, unit, default_rate_paise, verified, active, created_at')
        .order('description', { ascending: true });

      if (error) throw error;
      setItems(data || []);
    } catch (err) {
      console.error('Error fetching items:', err);
      setErrorMsg(err.message || 'Failed to load items catalog.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Collect unique units used across items for suggestions
  const suggestedUnits = useMemo(() => {
    const defaultSuggestions = ['PCS', 'KG', 'MTR', 'BOX', 'SET', 'ROLL', 'BAG', 'NOS', 'PKT'];
    const pastUnits = items
      .map((it) => it.unit?.trim().toUpperCase())
      .filter(Boolean);
    return Array.from(new Set([...defaultSuggestions, ...pastUnits]));
  }, [items]);

  // Filtering
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || it.description.toLowerCase().includes(q) || (it.hsn && it.hsn.includes(q));

      const needsChecking = !it.verified || !it.hsn || it.gst_percent === null || it.gst_percent === undefined;

      if (!matchesSearch) return false;
      if (filterMode === 'needs_checking') return needsChecking;
      if (filterMode === 'verified') return it.verified;
      return true;
    });
  }, [items, searchQuery, filterMode]);

  // Handle Save Item
  const handleSaveItem = async (e) => {
    e.preventDefault();
    setSavingItem(true);
    try {
      const desc = itemModal.description.trim();
      if (!desc) {
        alert('Item description is required.');
        setSavingItem(false);
        return;
      }

      const hsnVal = itemModal.hsn.trim() || null;
      const gstVal = itemModal.gst_percent !== '' ? Number(itemModal.gst_percent) : null;
      const rateVal = itemModal.usual_rate_rupees !== '' ? rupeesToPaise(itemModal.usual_rate_rupees) : null;

      const payload = {
        description: desc,
        unit: itemModal.unit.trim().toUpperCase() || null,
        hsn: hsnVal,
        gst_percent: gstVal,
        default_rate_paise: rateVal,
        verified: itemModal.verified,
        updated_at: new Date().toISOString(),
      };

      if (itemModal.mode === 'add') {
        const { error } = await supabase.from('items').insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('items').update(payload).eq('id', itemModal.id);
        if (error) throw error;
      }

      setItemModal({
        isOpen: false,
        mode: 'add',
        id: null,
        description: '',
        unit: '',
        hsn: '',
        gst_percent: '',
        usual_rate_rupees: '',
        verified: false,
      });
      await loadItems();
    } catch (err) {
      alert(err.message || 'Error saving item.');
    } finally {
      setSavingItem(false);
    }
  };

  // Quick 1-click Verify
  const handleQuickVerify = async (item) => {
    if (!item.hsn || item.gst_percent === null || item.gst_percent === undefined) {
      alert(`Item "${item.description}" must have both HSN code and GST % entered before marking verified. Please click Edit.`);
      return;
    }
    try {
      const { error } = await supabase
        .from('items')
        .update({ verified: true, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, verified: true } : it))
      );
    } catch (err) {
      alert(err.message || 'Error verifying item.');
    }
  };

  // Toggle Item Active (Deactivate, never delete)
  const toggleItemActive = async (item) => {
    try {
      const nextActive = !item.active;
      const { error } = await supabase
        .from('items')
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (error) throw error;
      await loadItems();
    } catch (err) {
      alert(err.message || 'Could not update item status.');
    }
  };

  return (
    <div className="space-y-5">
      {/* Top Header & Action Buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Items Catalog
          </h2>
          <p className="text-sm font-medium text-slate-500">
            {items.length} items &bull; HSN codes & GST rates
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* HSN Guide Modal Button */}
          <button
            type="button"
            onClick={() => setHsnGuideOpen(true)}
            className="min-h-[44px] px-3 py-2 rounded-xl bg-purple-50 border-2 border-purple-300 text-purple-900 font-bold text-xs hover:bg-purple-100 flex items-center space-x-1"
          >
            <span>📖</span>
            <span>HSN Helper</span>
          </button>

          <Link
            to="/items/import"
            className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white border-2 border-slate-300 text-slate-900 font-bold text-xs hover:bg-slate-50 shadow-sm flex items-center space-x-1"
          >
            <svg className="w-4 h-4 text-emerald-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span>Import Excel</span>
          </Link>

          <button
            onClick={() => {
              setItemModal({
                isOpen: true,
                mode: 'add',
                id: null,
                description: '',
                unit: '',
                hsn: '',
                gst_percent: '',
                usual_rate_rupees: '',
                verified: false,
              });
              setHsnWarning(null);
            }}
            className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-xs hover:bg-blue-800 shadow-sm flex items-center space-x-1 cursor-pointer"
          >
            <svg className="w-4 h-4 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add Item</span>
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search items by description or HSN..."
          className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:outline-none focus:border-slate-900"
        />
      </div>

      {/* Filter Tabs */}
      <div className="flex space-x-2 overflow-x-auto pb-1">
        <button
          onClick={() => setFilterMode('all')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-black transition border-2 cursor-pointer ${
            filterMode === 'all'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
          }`}
        >
          All Items ({items.length})
        </button>
        <button
          onClick={() => setFilterMode('needs_checking')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-black transition border-2 cursor-pointer ${
            filterMode === 'needs_checking'
              ? 'bg-amber-600 text-white border-amber-600'
              : 'bg-white text-amber-800 border-amber-300 hover:bg-amber-50'
          }`}
        >
          Needs Checking (
          {items.filter((it) => !it.verified || !it.hsn || it.gst_percent === null || it.gst_percent === undefined).length}
          )
        </button>
        <button
          onClick={() => setFilterMode('verified')}
          className={`min-h-[44px] px-3.5 py-1.5 rounded-xl text-xs font-black transition border-2 cursor-pointer ${
            filterMode === 'verified'
              ? 'bg-emerald-700 text-white border-emerald-700'
              : 'bg-white text-emerald-800 border-emerald-300 hover:bg-emerald-50'
          }`}
        >
          Verified ({items.filter((it) => it.verified).length})
        </button>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900 font-bold">
          {errorMsg}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8 text-slate-500 font-semibold">
          Loading items catalog...
        </div>
      )}

      {/* Empty Search state */}
      {!loading && filteredItems.length === 0 && (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center space-y-2">
          <p className="text-lg font-bold text-slate-800">No items match your filter</p>
          <p className="text-sm text-slate-500">
            {searchQuery ? `No results for "${searchQuery}"` : 'Your item catalog is empty.'}
          </p>
        </div>
      )}

      {/* Items List */}
      {!loading && filteredItems.length > 0 && (
        <div className="space-y-3">
          {filteredItems.map((item) => {
            const needsChecking =
              !item.verified || !item.hsn || item.gst_percent === null || item.gst_percent === undefined;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border-2 p-4 shadow-sm transition space-y-2 ${
                  item.active ? 'border-slate-300' : 'border-slate-200 bg-slate-50/60 opacity-75'
                }`}
              >
                {/* Title & Badge */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-lg font-black text-slate-900 leading-snug">
                    {item.description}
                  </h3>
                  <div className="flex items-center space-x-1.5 shrink-0">
                    {needsChecking ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-amber-100 text-amber-900 border border-amber-400">
                        Needs checking
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-emerald-100 text-emerald-900 border border-emerald-400">
                        Verified
                      </span>
                    )}
                    {!item.active && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-bold">
                        Deactivated
                      </span>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-semibold text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                  <div>
                    <span className="text-slate-400 block uppercase font-bold">HSN Code</span>
                    <span className="font-mono text-sm text-slate-900 font-bold">
                      {item.hsn || <span className="text-amber-700 font-normal">Blank</span>}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-bold">GST %</span>
                    <span className="text-sm text-slate-900 font-bold">
                      {item.gst_percent !== null && item.gst_percent !== undefined ? (
                        `${item.gst_percent}%`
                      ) : (
                        <span className="text-amber-700 font-normal">Blank</span>
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-bold">Unit</span>
                    <span className="text-sm text-slate-900 font-bold">{item.unit || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block uppercase font-bold">Usual Rate</span>
                    <span className="text-sm text-slate-900 font-bold">
                      {item.default_rate_paise ? formatRupees(item.default_rate_paise) : '-'}
                    </span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-1.5 flex items-center justify-end space-x-2">
                  {/* Quick 1-click Verify button if not verified */}
                  {!item.verified && (
                    <button
                      type="button"
                      onClick={() => handleQuickVerify(item)}
                      className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-black bg-emerald-50 text-emerald-900 border border-emerald-300 hover:bg-emerald-100 cursor-pointer"
                      title="Quick mark as verified"
                    >
                      ✓ Verify
                    </button>
                  )}

                  <button
                    onClick={() => {
                      setItemModal({
                        isOpen: true,
                        mode: 'edit',
                        id: item.id,
                        description: item.description,
                        unit: item.unit || '',
                        hsn: item.hsn || '',
                        gst_percent: item.gst_percent !== null && item.gst_percent !== undefined ? String(item.gst_percent) : '',
                        usual_rate_rupees: item.default_rate_paise ? paiseToRupees(item.default_rate_paise) : '',
                        verified: Boolean(item.verified),
                      });
                      if (item.hsn) {
                        const check = validateHSN(item.hsn);
                        setHsnWarning(check.warning);
                      } else {
                        setHsnWarning('HSN code is empty (needs checking)');
                      }
                    }}
                    className="min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-bold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50 cursor-pointer"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => toggleItemActive(item)}
                    className={`min-h-[40px] px-3 py-1.5 rounded-xl text-xs font-bold border cursor-pointer ${
                      item.active
                        ? 'border-amber-300 bg-amber-50 text-amber-900'
                        : 'border-emerald-300 bg-emerald-50 text-emerald-900'
                    }`}
                  >
                    {item.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: HSN GUIDE & LOOKUP HELPER (Phase 7b) */}
      {hsnGuideOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-slate-200 pb-3">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-purple-700">
                  GST Reference
                </span>
                <h3 className="text-2xl font-black text-slate-900">
                  Common HSN Codes Helper
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setHsnGuideOpen(false)}
                className="w-9 h-9 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold flex items-center justify-center cursor-pointer"
              >
                &times;
              </button>
            </div>

            <p className="text-xs font-semibold text-slate-600">
              Reference cheat-sheet for Uncle's products (effective GST slabs: 5% &amp; 18%). Confirm with return filer:
            </p>

            <div className="space-y-2">
              {COMMON_HSN_CODES.map((h) => (
                <div
                  key={h.hsn}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 space-y-1 hover:bg-slate-100 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-black text-base text-slate-900">
                      HSN {h.hsn}
                    </span>
                    <span className="px-2 py-0.5 rounded text-xs font-black bg-blue-100 text-blue-900 border border-blue-300">
                      {h.defaultGst}% GST
                    </span>
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    {h.category}
                  </p>
                  <p className="text-xs text-slate-500">
                    {h.description}
                  </p>
                </div>
              ))}
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setHsnGuideOpen(false)}
                className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800 cursor-pointer"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD / EDIT ITEM */}
      {itemModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900">
              {itemModal.mode === 'add' ? 'Add New Item' : 'Edit Item'}
            </h3>

            <form onSubmit={handleSaveItem} className="space-y-4">
              {/* Description */}
              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  value={itemModal.description}
                  onChange={(e) => setItemModal({ ...itemModal, description: e.target.value })}
                  placeholder="e.g. Cleaning Detergent"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                />
              </div>

              {/* Unit with suggestions */}
              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Unit (Free text)
                </label>
                <input
                  type="text"
                  value={itemModal.unit}
                  onChange={(e) => setItemModal({ ...itemModal, unit: e.target.value.toUpperCase() })}
                  placeholder="e.g. PCS, KG, MTR"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-bold uppercase"
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {suggestedUnits.slice(0, 7).map((u) => (
                    <button
                      type="button"
                      key={u}
                      onClick={() => setItemModal({ ...itemModal, unit: u })}
                      className="text-xs font-bold px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 cursor-pointer"
                    >
                      {u}
                    </button>
                  ))}
                </div>
              </div>

              {/* HSN Code with Preset Chips (Phase 7b) */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-base font-bold text-slate-900">
                    HSN Code &amp; Tax Rate
                  </label>
                  <span className="text-xs font-bold text-slate-500">Quick presets:</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {COMMON_HSN_CODES.slice(0, 6).map((preset) => (
                    <button
                      key={preset.hsn}
                      type="button"
                      onClick={() => {
                        setItemModal({
                          ...itemModal,
                          hsn: preset.hsn,
                          gst_percent: String(preset.defaultGst),
                        });
                        setHsnWarning(null);
                      }}
                      className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
                    >
                      {preset.hsn} ({preset.defaultGst}%) &bull; {preset.category.split('/')[0].trim()}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={itemModal.hsn}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setItemModal({ ...itemModal, hsn: val });
                    const check = validateHSN(val);
                    setHsnWarning(check.warning);
                  }}
                  placeholder="e.g. 3402 (4, 6 or 8 digits)"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-mono font-bold"
                />
                {hsnWarning && (
                  <p className="mt-1 text-sm font-bold text-amber-700 flex items-center gap-1">
                    <span>⚠️</span> {hsnWarning}
                  </p>
                )}
              </div>

              {/* GST % & Usual Rate */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-bold text-slate-900 mb-1">
                    GST %
                  </label>
                  <select
                    value={itemModal.gst_percent}
                    onChange={(e) => setItemModal({ ...itemModal, gst_percent: e.target.value })}
                    className="w-full min-h-[50px] px-3 py-3 rounded-xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
                  >
                    <option value="">Leave blank</option>
                    <option value="0">0%</option>
                    <option value="5">5%</option>
                    <option value="18">18%</option>
                    <option value="40">40%</option>
                  </select>
                </div>

                <div>
                  <label className="block text-base font-bold text-slate-900 mb-1">
                    Usual Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={itemModal.usual_rate_rupees}
                    onChange={(e) => setItemModal({ ...itemModal, usual_rate_rupees: e.target.value })}
                    placeholder="0.00"
                    className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                  />
                </div>
              </div>

              {/* Verified Toggle Checkbox */}
              <div className="p-3.5 rounded-xl border-2 border-slate-300 bg-slate-50 flex items-center space-x-3">
                <input
                  id="verifiedToggle"
                  type="checkbox"
                  checked={itemModal.verified}
                  onChange={(e) => setItemModal({ ...itemModal, verified: e.target.checked })}
                  className="w-6 h-6 rounded text-blue-600 focus:ring-0 cursor-pointer"
                />
                <label htmlFor="verifiedToggle" className="text-base font-bold text-slate-900 cursor-pointer">
                  Mark as Verified (HSN & Rate confirmed)
                </label>
              </div>

              {/* Action Buttons */}
              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setItemModal({ ...itemModal, isOpen: false })}
                  className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-400 font-bold text-slate-700 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingItem}
                  className="flex-1 min-h-[48px] rounded-xl bg-blue-700 text-white font-bold hover:bg-blue-800 cursor-pointer"
                >
                  {savingItem ? 'Saving...' : 'Save Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
