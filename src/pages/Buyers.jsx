import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { validateGSTIN } from '../lib/itemValidation.js';

export default function Buyers() {
  const [buyers, setBuyers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Selected buyer for branch view
  const [selectedBuyer, setSelectedBuyer] = useState(null);
  const [branches, setBranches] = useState([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  // Buyer Form Modal State
  const [buyerModal, setBuyerModal] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    id: null,
    name: '',
    gstin: '',
    state_code: '33',
  });
  const [buyerWarning, setBuyerWarning] = useState(null);
  const [savingBuyer, setSavingBuyer] = useState(false);

  // Branch Form Modal State
  const [branchModal, setBranchModal] = useState({
    isOpen: false,
    mode: 'add', // 'add' | 'edit'
    id: null,
    label: '',
    address: '',
  });
  const [savingBranch, setSavingBranch] = useState(false);

  // 1. Fetch Buyers
  const loadBuyers = useCallback(async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      const { data, error } = await supabase
        .from('buyers')
        .select('id, name, gstin, state_code, active, created_at')
        .order('name', { ascending: true });

      if (error) throw error;
      setBuyers(data || []);
    } catch (err) {
      console.error('Error fetching buyers:', err);
      setErrorMsg(err.message || 'Failed to load buyers list.');
    } finally {
      setLoading(false);
    }
  }, []);

  // 2. Fetch Branches for selected buyer
  const loadBranches = useCallback(async (buyerId) => {
    if (!buyerId) return;
    setBranchesLoading(true);
    try {
      const { data, error } = await supabase
        .from('buyer_addresses')
        .select('id, buyer_id, label, address, active')
        .eq('buyer_id', buyerId)
        .order('label', { ascending: true });

      if (error) throw error;
      setBranches(data || []);
    } catch (err) {
      console.error('Error fetching branches:', err);
    } finally {
      setBranchesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBuyers();
  }, [loadBuyers]);

  useEffect(() => {
    if (selectedBuyer?.id) {
      loadBranches(selectedBuyer.id);
    }
  }, [selectedBuyer, loadBranches]);

  // Handle Save Buyer (Add or Edit)
  const handleSaveBuyer = async (e) => {
    e.preventDefault();
    setSavingBuyer(true);
    try {
      const payload = {
        name: buyerModal.name.trim(),
        gstin: buyerModal.gstin.trim().toUpperCase(),
        state_code: buyerModal.state_code.trim() || '33',
        updated_at: new Date().toISOString(),
      };

      if (buyerModal.mode === 'add') {
        const { error } = await supabase.from('buyers').insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('buyers')
          .update(payload)
          .eq('id', buyerModal.id);
        if (error) throw error;
      }

      setBuyerModal({ isOpen: false, mode: 'add', id: null, name: '', gstin: '', state_code: '33' });
      await loadBuyers();
    } catch (err) {
      alert(err.message || 'Error saving buyer.');
    } finally {
      setSavingBuyer(false);
    }
  };

  // Toggle Buyer Active (Deactivate, never delete)
  const toggleBuyerActive = async (buyer) => {
    try {
      const nextActive = !buyer.active;
      const { error } = await supabase
        .from('buyers')
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', buyer.id);

      if (error) throw error;
      await loadBuyers();
      if (selectedBuyer?.id === buyer.id) {
        setSelectedBuyer({ ...selectedBuyer, active: nextActive });
      }
    } catch (err) {
      alert(err.message || 'Could not update buyer status.');
    }
  };

  // Handle Save Branch (Add or Edit)
  const handleSaveBranch = async (e) => {
    e.preventDefault();
    if (!selectedBuyer) return;

    const trimmedAddress = branchModal.address.trim();
    if (!trimmedAddress) {
      alert('Branch delivery address cannot be blank. Please enter the full delivery address.');
      return;
    }

    const trimmedLabel = branchModal.label.trim();
    if (!trimmedLabel) {
      alert('Branch label cannot be blank.');
      return;
    }

    setSavingBranch(true);
    try {
      const payload = {
        buyer_id: selectedBuyer.id,
        label: trimmedLabel,
        address: trimmedAddress,
        updated_at: new Date().toISOString(),
      };

      if (branchModal.mode === 'add') {
        const { error } = await supabase.from('buyer_addresses').insert([payload]);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('buyer_addresses')
          .update(payload)
          .eq('id', branchModal.id);
        if (error) throw error;
      }

      setBranchModal({ isOpen: false, mode: 'add', id: null, label: '', address: '' });
      await loadBranches(selectedBuyer.id);
    } catch (err) {
      alert(err.message || 'Error saving branch address.');
    } finally {
      setSavingBranch(false);
    }
  };

  // Toggle Branch Active (Deactivate, never delete)
  const toggleBranchActive = async (branch) => {
    try {
      const nextActive = !branch.active;
      const { error } = await supabase
        .from('buyer_addresses')
        .update({ active: nextActive, updated_at: new Date().toISOString() })
        .eq('id', branch.id);

      if (error) throw error;
      await loadBranches(selectedBuyer.id);
    } catch (err) {
      alert(err.message || 'Could not update branch status.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Buyers & Branches
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Customer companies and delivery addresses
          </p>
        </div>
        <Link
          to="/more"
          className="text-sm font-bold text-slate-700 bg-white border border-slate-300 px-3 py-1.5 rounded-xl hover:bg-slate-50"
        >
          &larr; More Menu
        </Link>
      </div>

      {/* Prominent Add New Buyer Button */}
      <button
        onClick={() => {
          setBuyerModal({ isOpen: true, mode: 'add', id: null, name: '', gstin: '', state_code: '33' });
          setBuyerWarning(null);
        }}
        className="w-full min-h-[54px] px-6 py-3.5 rounded-2xl bg-blue-700 text-white font-black text-lg hover:bg-blue-800 active:bg-blue-900 shadow-md flex items-center justify-center space-x-2 transition"
      >
        <svg className="w-6 h-6 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>Add New Buyer</span>
      </button>

      {errorMsg && (
        <div className="p-4 rounded-xl bg-red-50 border-2 border-red-500 text-red-900 font-bold">
          {errorMsg}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-8 text-slate-500 font-semibold">
          Loading buyers...
        </div>
      )}

      {/* Buyers List */}
      {!loading && (
        <div className="space-y-4">
          {buyers.map((b) => {
            const isSelected = selectedBuyer?.id === b.id;
            return (
              <div
                key={b.id}
                className={`bg-white rounded-2xl border-2 p-5 shadow-sm transition space-y-3 ${
                  b.active ? 'border-slate-300' : 'border-slate-200 bg-slate-50/60 opacity-80'
                }`}
              >
                {/* Title & Status */}
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-xl font-black text-slate-900 leading-tight">
                      {b.name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className="text-sm font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-300">
                        GSTIN: {b.gstin}
                      </span>
                      <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-lg">
                        State: {b.state_code}
                      </span>
                    </div>
                  </div>
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-black tracking-wide shrink-0 ${
                      b.active
                        ? 'bg-emerald-100 text-emerald-900 border border-emerald-400'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {b.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>

                {/* Actions Row */}
                <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => setSelectedBuyer(isSelected ? null : b)}
                    className={`min-h-[44px] px-4 py-2 rounded-xl text-sm font-bold border-2 transition flex items-center space-x-1.5 ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span>{isSelected ? 'Hide Branches' : 'View Branches'}</span>
                  </button>

                  <button
                    onClick={() => {
                      setBuyerModal({
                        isOpen: true,
                        mode: 'edit',
                        id: b.id,
                        name: b.name,
                        gstin: b.gstin,
                        state_code: b.state_code,
                      });
                      const check = validateGSTIN(b.gstin);
                      setBuyerWarning(check.warning);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold bg-white text-slate-800 border border-slate-300 hover:bg-slate-50"
                  >
                    Edit
                  </button>

                  <button
                    onClick={() => toggleBuyerActive(b)}
                    className={`min-h-[44px] px-3.5 py-2 rounded-xl text-sm font-bold border transition ${
                      b.active
                        ? 'border-amber-400 bg-amber-50 text-amber-900 hover:bg-amber-100'
                        : 'border-emerald-400 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    {b.active ? 'Deactivate' : 'Reactivate'}
                  </button>
                </div>

                {/* EXPANDED BRANCHES SECTION */}
                {isSelected && (
                  <div className="mt-4 pt-4 border-t-2 border-dashed border-slate-300 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-base font-black text-slate-900">
                        Branches for {b.name}
                      </h4>
                      <span className="text-xs font-bold text-slate-500">
                        {branches.length} {branches.length === 1 ? 'address' : 'addresses'}
                      </span>
                    </div>

                    {/* Prominent Add Branch Address Button */}
                    <button
                      onClick={() => {
                        setBranchModal({ isOpen: true, mode: 'add', id: null, label: '', address: '' });
                      }}
                      className="w-full min-h-[50px] px-4 py-3 rounded-xl bg-blue-50 border-2 border-blue-600 text-blue-800 font-black text-base hover:bg-blue-100 active:bg-blue-200 flex items-center justify-center space-x-2 transition shadow-xs"
                    >
                      <svg className="w-5 h-5 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Add Branch Address</span>
                    </button>

                    {branchesLoading ? (
                      <p className="text-sm text-slate-500 font-semibold py-2">Loading branches...</p>
                    ) : branches.length === 0 ? (
                      <p className="text-sm text-slate-500 font-semibold py-2">
                        No delivery branch addresses saved. Tap "+ Add Branch" above.
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {branches.map((br) => (
                          <div
                            key={br.id}
                            className={`p-3.5 rounded-xl border-2 bg-white flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${
                              br.active ? 'border-slate-300' : 'border-slate-200 bg-slate-50 opacity-75'
                            }`}
                          >
                            <div>
                              <div className="flex items-center space-x-2">
                                <span className="text-sm font-black text-slate-900">
                                  {br.label}
                                </span>
                                {!br.active && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                                    Deactivated
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-slate-700 whitespace-pre-line mt-1 font-medium leading-relaxed">
                                {br.address}
                              </p>
                            </div>
                            <div className="flex items-center space-x-2 shrink-0">
                              <button
                                onClick={() => {
                                  setBranchModal({
                                    isOpen: true,
                                    mode: 'edit',
                                    id: br.id,
                                    label: br.label,
                                    address: br.address,
                                  });
                                }}
                                className="text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 px-2.5 py-1.5 rounded-lg border border-slate-300"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => toggleBranchActive(br)}
                                className={`text-xs font-bold px-2.5 py-1.5 rounded-lg border ${
                                  br.active
                                    ? 'bg-amber-50 text-amber-900 border-amber-300'
                                    : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                }`}
                              >
                                {br.active ? 'Deactivate' : 'Reactivate'}
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADD / EDIT BUYER */}
      {buyerModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-black text-slate-900">
              {buyerModal.mode === 'add' ? 'Add New Buyer' : 'Edit Buyer'}
            </h3>

            <form onSubmit={handleSaveBuyer} className="space-y-4">
              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Buyer Company Name *
                </label>
                <input
                  type="text"
                  required
                  value={buyerModal.name}
                  onChange={(e) => setBuyerModal({ ...buyerModal, name: e.target.value })}
                  placeholder="e.g. KH EXPORT INDIA PRIVATE LTD"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-lg font-bold"
                />
              </div>

              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  GSTIN *
                </label>
                <input
                  type="text"
                  required
                  value={buyerModal.gstin}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setBuyerModal({ ...buyerModal, gstin: val });
                    const check = validateGSTIN(val);
                    setBuyerWarning(check.warning);
                  }}
                  placeholder="15-digit GSTIN (e.g. 33AAACR1714R1ZA)"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-lg font-mono font-bold uppercase"
                />
                {buyerWarning && (
                  <p className="mt-1.5 text-sm font-bold text-amber-700 flex items-center gap-1">
                    <span>⚠️</span> {buyerWarning}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  State Code (Tamil Nadu = 33) *
                </label>
                <input
                  type="text"
                  required
                  value={buyerModal.state_code}
                  onChange={(e) => setBuyerModal({ ...buyerModal, state_code: e.target.value })}
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                />
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBuyerModal({ ...buyerModal, isOpen: false })}
                  className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-400 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBuyer}
                  className="flex-1 min-h-[48px] rounded-xl bg-blue-700 text-white font-bold hover:bg-blue-800"
                >
                  {savingBuyer ? 'Saving...' : 'Save Buyer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT BRANCH */}
      {branchModal.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border-2 border-slate-900 max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-xl font-black text-slate-900">
              {branchModal.mode === 'add' ? 'Add Branch Address' : 'Edit Branch Address'}
            </h3>

            <form onSubmit={handleSaveBranch} className="space-y-4">
              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Branch Label *
                </label>
                <input
                  type="text"
                  required
                  value={branchModal.label}
                  onChange={(e) => setBranchModal({ ...branchModal, label: e.target.value })}
                  placeholder="e.g. Branch 1 or Unit III Melvisharam"
                  className="w-full min-h-[50px] px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                />
              </div>

              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Full Delivery Address *
                </label>
                <textarea
                  rows="3"
                  required
                  value={branchModal.address}
                  onChange={(e) => setBranchModal({ ...branchModal, address: e.target.value })}
                  placeholder="Street, locality, city, pincode"
                  className="w-full px-4 py-3 rounded-xl border-2 border-slate-400 text-slate-900 text-base font-medium"
                ></textarea>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setBranchModal({ ...branchModal, isOpen: false })}
                  className="flex-1 min-h-[48px] rounded-xl border-2 border-slate-400 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingBranch}
                  className="flex-1 min-h-[48px] rounded-xl bg-blue-700 text-white font-bold hover:bg-blue-800"
                >
                  {savingBranch ? 'Saving...' : 'Save Branch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
