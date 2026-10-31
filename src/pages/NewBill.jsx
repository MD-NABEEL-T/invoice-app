import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { financialYear, paiseToRupees, calcInvoice } from '../lib/tax.js';
import {
  parseQuantityToMilli,
  parseRupeesToPaise,
  validateBillLine,
  validateBillForm,
  buildInvoicePayload,
  numberToWordsIndian,
} from '../lib/billPayload.js';
import { formatRupees, formatDisplayDate } from '../lib/billUtils.js';
import { validateHSN } from '../lib/itemValidation.js';
import { COMMON_HSN_CODES } from '../lib/hsnCodes.js';

const DRAFT_STORAGE_KEY = 'draft_new_bill';

function getTodayLocalDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function NewBill() {
  const navigate = useNavigate();
  const { id: editBillId } = useParams();
  const isEditMode = Boolean(editBillId);
  const [searchParams] = useSearchParams();
  const copyFromId = searchParams.get('copyFrom');
  const [copiedFromNotice, setCopiedFromNotice] = useState('');

  const [existingInvoice, setExistingInvoice] = useState(null);
  const [loadingExisting, setLoadingExisting] = useState(isEditMode || Boolean(copyFromId));

  // ---------------------------------------------------------------------------
  // 1. Gate & Financial Year State
  // ---------------------------------------------------------------------------
  const [billDate, setBillDate] = useState(getTodayLocalDate);
  const derivedFy = useMemo(() => financialYear(billDate), [billDate]);

  const [gateLoading, setGateLoading] = useState(!isEditMode);
  const [gateSet, setGateSet] = useState(isEditMode ? true : null); // true | false
  const [gateError, setGateError] = useState('');

  // ---------------------------------------------------------------------------
  // 2. Form State: Header Fields
  // ---------------------------------------------------------------------------
  const [buyers, setBuyers] = useState([]);
  const [selectedBuyerId, setSelectedBuyerId] = useState('');
  const [branches, setBranches] = useState([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [chosenAddress, setChosenAddress] = useState('');

  const [buyerOrderNo, setBuyerOrderNo] = useState('');
  const [buyerOrderDate, setBuyerOrderDate] = useState('');
  const [deliveryNo, setDeliveryNo] = useState('');
  const [deliveryDate, setDeliveryDate] = useState(getTodayLocalDate);
  const [despatchedThrough, setDespatchedThrough] = useState('');
  const [destination, setDestination] = useState('');
  const [termsOfDelivery, setTermsOfDelivery] = useState('');

  // Date sequence check warning
  const [latestBillWarning, setLatestBillWarning] = useState(null);

  // ---------------------------------------------------------------------------
  // 3. Form State: Line Cards & Catalog Search
  // ---------------------------------------------------------------------------
  const [itemsCatalog, setItemsCatalog] = useState([]);
  const [itemSearchText, setItemSearchText] = useState('');
  const [selectedSearchIdx, setSelectedSearchIdx] = useState(0);
  const [lines, setLines] = useState([]);

  // Line removal confirmation
  const [linePendingRemoval, setLinePendingRemoval] = useState(null);

  // Shortcut: Add New Item Modal
  const [newItemModalOpen, setNewItemModalOpen] = useState(false);
  const [newItemForm, setNewItemForm] = useState({
    description: '',
    unit: 'PCS',
    hsn: '',
    gst_percent: '18',
    usual_rate: '',
  });
  const [newItemSaving, setNewItemSaving] = useState(false);
  const [newItemHsnWarning, setNewItemHsnWarning] = useState(null);

  // ---------------------------------------------------------------------------
  // 4. Save & Error States
  // ---------------------------------------------------------------------------
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formValidationErrors, setFormValidationErrors] = useState([]);
  const [networkAlert, setNetworkAlert] = useState('');
  const [serverError, setServerError] = useState('');

  // ---------------------------------------------------------------------------
  // 5. Draft Safety State
  // ---------------------------------------------------------------------------
  const [draftRestored, setDraftRestored] = useState(false);

  // ===========================================================================
  // Effect: Gate Check get_numbering_status
  // ===========================================================================
  const checkGate = useCallback(async (fy) => {
    setGateLoading(true);
    setGateError('');
    try {
      const { data, error } = await supabase.rpc('get_numbering_status', { p_fy: fy });
      if (error) {
        throw error;
      }
      setGateSet(Boolean(data?.is_set));
    } catch (err) {
      console.error('Error checking numbering status:', err);
      setGateError(err.message || 'Failed to verify invoice numbering series');
      setGateSet(false);
    } finally {
      setGateLoading(false);
    }
  }, []);

  useEffect(() => {
    checkGate(derivedFy);
  }, [derivedFy, checkGate]);

  // ===========================================================================
  // Effect: Date Sequence Warning (older than latest finalized bill in FY)
  // ===========================================================================
  useEffect(() => {
    let isCancelled = false;
    async function checkLatestBill() {
      try {
        const { data, error } = await supabase
          .from('invoices')
          .select('invoice_date, invoice_no')
          .eq('fy', derivedFy)
          .eq('status', 'final')
          .order('invoice_date', { ascending: false })
          .limit(1);

        if (error || isCancelled || !data || data.length === 0) {
          setLatestBillWarning(null);
          return;
        }

        const latest = data[0];
        if (latest.invoice_date && billDate < latest.invoice_date) {
          setLatestBillWarning({
            latestDate: latest.invoice_date,
            latestNo: latest.invoice_no,
          });
        } else {
          setLatestBillWarning(null);
        }
      } catch (err) {
        console.warn('Error checking latest bill date:', err);
      }
    }

    if (billDate && derivedFy) {
      checkLatestBill();
    }
    return () => {
      isCancelled = true;
    };
  }, [billDate, derivedFy]);

  // ===========================================================================
  // Effect: Initial Data Load (Buyers, Items, Last Despatched) & Draft Restore
  // ===========================================================================
  useEffect(() => {
    let isMounted = true;

    async function initData() {
      try {
        // 1. Fetch active buyers
        const { data: buyersData } = await supabase
          .from('buyers')
          .select('*')
          .eq('active', true)
          .order('name');
        if (isMounted && buyersData) {
          setBuyers(buyersData);
        }

        // 2. Fetch active items catalog
        const { data: itemsData } = await supabase
          .from('items')
          .select('*')
          .eq('active', true)
          .order('description');
        if (isMounted && itemsData) {
          setItemsCatalog(itemsData);
        }

        // 3. Prefill despatched_through from latest invoice
        const { data: latestInv } = await supabase
          .from('invoices')
          .select('despatched_through')
          .order('created_at', { ascending: false })
          .limit(1);
        if (isMounted && latestInv && latestInv.length > 0 && latestInv[0].despatched_through) {
          setDespatchedThrough((prev) => prev || latestInv[0].despatched_through);
        }

        // 4. Restore draft from localStorage (if exists)
        try {
          const savedDraftJson = localStorage.getItem(DRAFT_STORAGE_KEY);
          if (savedDraftJson) {
            const draft = JSON.parse(savedDraftJson);
            if (
              draft &&
              (draft.selectedBuyerId ||
                draft.buyerOrderNo ||
                (Array.isArray(draft.lines) && draft.lines.length > 0))
            ) {
              if (draft.billDate) setBillDate(draft.billDate);
              if (draft.selectedBuyerId) setSelectedBuyerId(draft.selectedBuyerId);
              if (draft.selectedBranchId) setSelectedBranchId(draft.selectedBranchId);
              if (draft.chosenAddress) setChosenAddress(draft.chosenAddress);
              if (draft.buyerOrderNo) setBuyerOrderNo(draft.buyerOrderNo);
              if (draft.buyerOrderDate) setBuyerOrderDate(draft.buyerOrderDate);
              if (draft.deliveryNo) setDeliveryNo(draft.deliveryNo);
              if (draft.deliveryDate) setDeliveryDate(draft.deliveryDate);
              if (draft.despatchedThrough) setDespatchedThrough(draft.despatchedThrough);
              if (draft.destination) setDestination(draft.destination);
              if (draft.termsOfDelivery) setTermsOfDelivery(draft.termsOfDelivery);
              if (Array.isArray(draft.lines) && draft.lines.length > 0) {
                setLines(draft.lines);
              }
              setDraftRestored(true);
            }
          }
        } catch (draftErr) {
          console.warn('Could not restore draft:', draftErr);
        }
      } catch (err) {
        console.error('Initialization error:', err);
      }
    }

    initData();
    return () => {
      isMounted = false;
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Load Existing Invoice for Edit Mode
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!editBillId) return;
    let isSubscribed = true;

    async function fetchBillForEdit() {
      setLoadingExisting(true);
      try {
        const { data: inv, error } = await supabase
          .from('invoices')
          .select(`
            *,
            lines:invoice_lines(*)
          `)
          .eq('id', editBillId)
          .single();

        if (error) throw error;
        if (!inv || !isSubscribed) return;

        setExistingInvoice(inv);
        if (inv.invoice_date) setBillDate(inv.invoice_date);
        if (inv.buyer_id) setSelectedBuyerId(inv.buyer_id);
        if (inv.buyer_address) setChosenAddress(inv.buyer_address);
        if (inv.buyer_order_no) setBuyerOrderNo(inv.buyer_order_no.toUpperCase());
        if (inv.buyer_order_date) setBuyerOrderDate(inv.buyer_order_date);
        if (inv.delivery_no) setDeliveryNo(inv.delivery_no);
        if (inv.delivery_date) setDeliveryDate(inv.delivery_date);
        if (inv.despatched_through) setDespatchedThrough(inv.despatched_through);
        if (inv.destination) setDestination(inv.destination);
        if (inv.terms_of_delivery) setTermsOfDelivery(inv.terms_of_delivery);

        if (Array.isArray(inv.lines) && inv.lines.length > 0) {
          const sorted = [...inv.lines].sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
          const mapped = sorted.map((l) => ({
            id: l.id || Math.random().toString(),
            item_id: null,
            description: l.description,
            hsn: l.hsn || '',
            gst_percent: String(l.gst_percent ?? 18),
            unit: l.unit || 'PCS',
            quantity: formatMilliToQuantity(l.qty_milli),
            rate: paiseToRupees(l.rate_paise),
            rate_paise: Number(l.rate_paise || 0),
            qty_milli: Number(l.qty_milli || 0),
          }));
          setLines(mapped);
        }
      } catch (err) {
        console.error('Error loading bill for edit:', err);
        setServerError('Failed to load bill for editing.');
      } finally {
        if (isSubscribed) {
          setLoadingExisting(false);
          setGateLoading(false);
          setGateSet(true);
        }
      }
    }

    fetchBillForEdit();

    return () => {
      isSubscribed = false;
    };
  }, [editBillId]);

  // ---------------------------------------------------------------------------
  // Load Existing Invoice for "Copy as New Bill" (Phase 7)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (isEditMode || !copyFromId) return;
    let isSubscribed = true;

    async function fetchBillForCopy() {
      setLoadingExisting(true);
      try {
        const { data: inv, error } = await supabase
          .from('invoices')
          .select(`
            *,
            lines:invoice_lines(*)
          `)
          .eq('id', copyFromId)
          .single();

        if (error) throw error;
        if (!inv || !isSubscribed) return;

        setCopiedFromNotice(`Copied details from bill ${inv.invoice_no}. A new invoice number will be assigned at finalization.`);
        if (inv.buyer_id) setSelectedBuyerId(inv.buyer_id);
        if (inv.buyer_address) setChosenAddress(inv.buyer_address);
        if (inv.buyer_order_no) setBuyerOrderNo(inv.buyer_order_no.toUpperCase());
        if (inv.buyer_order_date) setBuyerOrderDate(inv.buyer_order_date);
        if (inv.delivery_no) setDeliveryNo(inv.delivery_no);
        if (inv.despatched_through) setDespatchedThrough(inv.despatched_through);
        if (inv.destination) setDestination(inv.destination);
        if (inv.terms_of_delivery) setTermsOfDelivery(inv.terms_of_delivery);

        if (Array.isArray(inv.lines) && inv.lines.length > 0) {
          const sorted = [...inv.lines].sort((a, b) => (a.line_no || 0) - (b.line_no || 0));
          const mapped = sorted.map((l) => ({
            id: Math.random().toString(),
            item_id: null,
            description: l.description,
            hsn: l.hsn || '',
            gst_percent: String(l.gst_percent ?? 18),
            unit: l.unit || 'PCS',
            quantity: formatMilliToQuantity(l.qty_milli),
            rate: paiseToRupees(l.rate_paise),
            rate_paise: Number(l.rate_paise || 0),
            qty_milli: Number(l.qty_milli || 0),
          }));
          setLines(mapped);
        }
      } catch (err) {
        console.error('Error copying bill:', err);
      } finally {
        if (isSubscribed) {
          setLoadingExisting(false);
        }
      }
    }

    fetchBillForCopy();

    return () => {
      isSubscribed = false;
    };
  }, [isEditMode, copyFromId]);

  // ===========================================================================
  // Effect: When Buyer changes, load non-blank active branch addresses
  // ===========================================================================
  useEffect(() => {
    let isCancelled = false;

    async function loadBranches(buyerId) {
      if (!buyerId) {
        setBranches([]);
        setSelectedBranchId('');
        setChosenAddress('');
        return;
      }

      try {
        const { data, error } = await supabase
          .from('buyer_addresses')
          .select('*')
          .eq('buyer_id', buyerId)
          .eq('active', true)
          .order('label');

        if (error || isCancelled) return;

        // Filter out blank addresses
        const validBranches = (data || []).filter(
          (b) => b.address && b.address.trim() !== ''
        );
        setBranches(validBranches);

        // If previously selected branch belongs to this buyer, retain it; else default to first
        setSelectedBranchId((prev) => {
          const exists = validBranches.find((b) => b.id === prev);
          if (exists) {
            setChosenAddress(exists.address);
            return prev;
          }
          if (validBranches.length > 0) {
            setChosenAddress(validBranches[0].address);
            return validBranches[0].id;
          }
          setChosenAddress('');
          return '';
        });
      } catch (err) {
        console.error('Error fetching branches:', err);
      }
    }

    loadBranches(selectedBuyerId);
    return () => {
      isCancelled = true;
    };
  }, [selectedBuyerId]);

  // When branch selection dropdown changes
  const handleBranchChange = (branchId) => {
    setSelectedBranchId(branchId);
    const branch = branches.find((b) => b.id === branchId);
    setChosenAddress(branch ? branch.address : '');
  };

  // Sync delivery date when bill date changes if delivery date was equal to previous bill date
  const handleBillDateChange = (newDate) => {
    setBillDate(newDate);
    // If delivery date was not customized, keep in sync with bill date
    setDeliveryDate(newDate);
  };

  // ===========================================================================
  // Autosave Draft to localStorage
  // ===========================================================================
  useEffect(() => {
    try {
      const draftState = {
        billDate,
        selectedBuyerId,
        selectedBranchId,
        chosenAddress,
        buyerOrderNo,
        buyerOrderDate,
        deliveryNo,
        deliveryDate,
        despatchedThrough,
        destination,
        termsOfDelivery,
        lines,
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draftState));
    } catch (err) {
      console.warn('Autosave draft failed:', err);
    }
  }, [
    billDate,
    selectedBuyerId,
    selectedBranchId,
    chosenAddress,
    buyerOrderNo,
    buyerOrderDate,
    deliveryNo,
    deliveryDate,
    despatchedThrough,
    destination,
    termsOfDelivery,
    lines,
  ]);

  const handleDiscardDraft = () => {
    if (window.confirm('Discard this in-progress bill draft and start fresh?')) {
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (err) {
        console.warn('Error discarding draft:', err);
      }
      setDraftRestored(false);
      setBillDate(getTodayLocalDate());
      setSelectedBuyerId('');
      setSelectedBranchId('');
      setChosenAddress('');
      setBuyerOrderNo('');
      setBuyerOrderDate('');
      setDeliveryNo('');
      setDeliveryDate(getTodayLocalDate());
      setDestination('');
      setTermsOfDelivery('');
      setLines([]);
    }
  };

  // ===========================================================================
  // Add Line Item (with Last Used Rate lookup)
  // ===========================================================================
  const handleAddItemFromCatalog = async (item) => {
    // 1. Check if item has been used previously in invoice_lines
    let initialRateStr = '';
    try {
      const { data } = await supabase
        .from('invoice_lines')
        .select('rate_paise, invoices!inner(created_at, status)')
        .eq('description', item.description)
        .eq('invoices.status', 'final')
        .order('invoices(created_at)', { ascending: false })
        .limit(1);

      if (data && data.length > 0 && data[0].rate_paise !== undefined && data[0].rate_paise !== null) {
        initialRateStr = paiseToRupees(data[0].rate_paise);
      } else if (item.default_rate_paise !== null && item.default_rate_paise !== undefined) {
        initialRateStr = paiseToRupees(item.default_rate_paise);
      }
    } catch (err) {
      console.warn('Could not query last used rate, falling back to usual rate:', err);
      if (item.default_rate_paise) {
        initialRateStr = paiseToRupees(item.default_rate_paise);
      }
    }

    const newLine = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
      item_id: item.id,
      description: item.description,
      hsn: item.hsn || '',
      unit: item.unit || 'PCS',
      quantity: '1',
      rate: initialRateStr,
      gst_percent:
        item.gst_percent !== null && item.gst_percent !== undefined
          ? String(item.gst_percent)
          : '',
    };

    setLines((prev) => [...prev, newLine]);
    setItemSearchText('');
  };

  // Filter items in catalog by search text
  const searchResults = useMemo(() => {
    const q = itemSearchText.trim().toLowerCase();
    if (!q) return [];
    return itemsCatalog
      .filter(
        (it) =>
          it.description.toLowerCase().includes(q) ||
          (it.hsn && it.hsn.toLowerCase().includes(q))
      )
      .slice(0, 10);
  }, [itemsCatalog, itemSearchText]);

  // Keyboard navigation for search suggestions
  const handleSearchKeyDown = (e) => {
    if (searchResults.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedSearchIdx((prev) => (prev + 1) % searchResults.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedSearchIdx((prev) => (prev - 1 + searchResults.length) % searchResults.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const itemToAdd = searchResults[selectedSearchIdx] || searchResults[0];
      if (itemToAdd) {
        handleAddItemFromCatalog(itemToAdd);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setItemSearchText('');
    }
  };

  // Update line field
  const handleUpdateLine = (index, field, value) => {
    setLines((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
  };

  // Remove line with confirmation
  const handleConfirmRemoveLine = () => {
    if (linePendingRemoval !== null) {
      setLines((prev) => prev.filter((_, idx) => idx !== linePendingRemoval));
      setLinePendingRemoval(null);
    }
  };

  // ===========================================================================
  // Shortcut: Save New Item Modal
  // ===========================================================================
  const handleSaveNewItem = async (e) => {
    e.preventDefault();
    setNewItemSaving(true);
    try {
      const desc = newItemForm.description.trim();
      if (!desc) {
        alert('Item description is required');
        setNewItemSaving(false);
        return;
      }

      const hsnVal = newItemForm.hsn.trim() || null;
      const gstVal = newItemForm.gst_percent !== '' ? Number(newItemForm.gst_percent) : null;
      const rateVal = newItemForm.usual_rate !== '' ? parseRupeesToPaise(newItemForm.usual_rate) : null;

      const payload = {
        description: desc,
        unit: newItemForm.unit.trim().toUpperCase() || 'PCS',
        hsn: hsnVal,
        gst_percent: gstVal,
        default_rate_paise: rateVal,
        verified: Boolean(hsnVal && gstVal !== null),
        active: true,
      };

      const { data: created, error } = await supabase
        .from('items')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      // Add to catalog state
      setItemsCatalog((prev) => [...prev, created]);

      // Add directly as a line on the bill
      const newLine = {
        id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
        item_id: created.id,
        description: created.description,
        hsn: created.hsn || '',
        unit: created.unit || 'PCS',
        quantity: '1',
        rate: newItemForm.usual_rate || '',
        gst_percent:
          created.gst_percent !== null && created.gst_percent !== undefined
            ? String(created.gst_percent)
            : '',
      };
      setLines((prev) => [...prev, newLine]);

      // Reset & close modal
      setNewItemModalOpen(false);
      setNewItemForm({
        description: '',
        unit: 'PCS',
        hsn: '',
        gst_percent: '18',
        usual_rate: '',
      });
      setNewItemHsnWarning(null);
    } catch (err) {
      alert(err.message || 'Error saving new item');
    } finally {
      setNewItemSaving(false);
    }
  };

  // ===========================================================================
  // Live Totals Calculation via tax.js
  // ===========================================================================
  const calculatedInvoice = useMemo(() => {
    const parsedLines = lines.map((l) => ({
      description: l.description,
      hsn: l.hsn,
      unit: l.unit,
      qtyMilli: parseQuantityToMilli(l.quantity),
      ratePaise: parseRupeesToPaise(l.rate),
      gstPercent: Number(l.gst_percent || 0),
    }));
    return calcInvoice(parsedLines);
  }, [lines]);

  // Selected buyer object
  const selectedBuyer = useMemo(() => {
    return buyers.find((b) => b.id === selectedBuyerId) || null;
  }, [buyers, selectedBuyerId]);

  // ===========================================================================
  // Save Flow
  // ===========================================================================
  const handleInitiateSave = () => {
    setFormValidationErrors([]);
    setNetworkAlert('');
    setServerError('');

    const header = {
      invoice_date: billDate,
      buyer_id: selectedBuyerId,
      buyer_name: selectedBuyer?.name || '',
      buyer_gstin: selectedBuyer?.gstin || '',
      buyer_state_code: selectedBuyer?.state_code || '33',
      buyer_address: chosenAddress,
      buyer_order_no: buyerOrderNo,
      despatched_through: despatchedThrough,
    };

    const val = validateBillForm({ header, lines });
    if (!val.isValid) {
      setFormValidationErrors(val.errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setSaveModalOpen(true);
  };

  const handleConfirmSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setServerError('');
    setNetworkAlert('');

    try {
      const header = {
        invoice_date: billDate,
        buyer_id: selectedBuyerId,
        buyer_name: selectedBuyer.name,
        buyer_gstin: selectedBuyer.gstin,
        buyer_state_code: selectedBuyer.state_code || '33',
        buyer_address: chosenAddress,
        buyer_order_no: buyerOrderNo,
        buyer_order_date: buyerOrderDate || null,
        delivery_no: deliveryNo || null,
        delivery_date: deliveryDate || null,
        despatched_through: despatchedThrough,
        destination: destination || null,
        terms_of_delivery: termsOfDelivery || null,
      };

      const payload = buildInvoicePayload({ header, lines });

      // Webhook dispatch helper for email and Google Sheets automation
      const sendBillEmailWebhook = (invoiceNo, isEdit = false) => {
        const webhookUrl = localStorage.getItem('khansa_gsheet_webhook_url');
        if (!webhookUrl) return;

        const emailTo = localStorage.getItem('khansa_notification_email') || 'khansaenterprises19@gmail.com';
        const emailPayload = {
          action: isEdit ? 'Bill Edited' : 'New Bill Created',
          invoice_no: invoiceNo,
          date: header.invoice_date,
          buyer_name: header.buyer_name,
          buyer_address: header.buyer_address,
          buyer_gstin: header.buyer_gstin || '',
          buyer_state: header.buyer_state_code === '33' ? 'Tamil Nadu' : 'Other State',
          buyer_state_code: header.buyer_state_code || '33',
          amount_in_words: numberToWordsIndian(payload.payable_paise),
          buyer_order_no: header.buyer_order_no,
          buyer_order_date: header.buyer_order_date,
          delivery_no: header.delivery_no,
          delivery_date: header.delivery_date,
          despatched_through: header.despatched_through,
          destination: header.destination,
          terms_of_delivery: header.terms_of_delivery,
          taxable_paise: payload.taxable_paise,
          cgst_paise: payload.cgst_paise,
          sgst_paise: payload.sgst_paise,
          payable_paise: payload.payable_paise,
          taxable_rupees: (payload.taxable_paise / 100).toFixed(2),
          cgst_rupees: (payload.cgst_paise / 100).toFixed(2),
          sgst_rupees: (payload.sgst_paise / 100).toFixed(2),
          payable_rupees: (payload.payable_paise / 100).toFixed(2),
          lines: lines.map((l) => {
            const qtyMilli = parseQuantityToMilli(l.quantity);
            const ratePaise = parseRupeesToPaise(l.rate);
            const lineTotalPaise = Math.round((qtyMilli * ratePaise) / 1000);
            return {
              description: l.description,
              hsn: l.hsn,
              quantity: l.quantity,
              unit: l.unit,
              rate: l.rate,
              gst_percent: l.gst_percent,
              amount_rupees: (lineTotalPaise / 100).toFixed(2),
            };
          }),
          email_to: emailTo,
        };

        try {
          fetch(webhookUrl, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(emailPayload),
          }).catch((e) => console.warn('Webhook dispatch error:', e));
        } catch (e) {
          console.warn('Webhook trigger error:', e);
        }
      };

      if (isEditMode) {
        // Edit mode: update existing invoice
        const { error: rpcErr } = await supabase.rpc('update_invoice', {
          p_invoice_id: editBillId,
          payload,
        });

        if (rpcErr) {
          console.warn('RPC update_invoice error, using direct table update fallback:', rpcErr);
          const { error: invErr } = await supabase.from('invoices').update({
            invoice_date: header.invoice_date,
            buyer_id: header.buyer_id,
            buyer_name: header.buyer_name,
            buyer_gstin: header.buyer_gstin,
            buyer_state_code: header.buyer_state_code,
            buyer_address: header.buyer_address,
            buyer_order_no: header.buyer_order_no,
            buyer_order_date: header.buyer_order_date,
            delivery_no: header.delivery_no,
            delivery_date: header.delivery_date,
            despatched_through: header.despatched_through,
            destination: header.destination,
            taxable_paise: payload.taxable_paise,
            cgst_paise: payload.cgst_paise,
            sgst_paise: payload.sgst_paise,
            payable_paise: payload.payable_paise,
          }).eq('id', editBillId);
          if (invErr) throw invErr;

          await supabase.from('invoice_lines').delete().eq('invoice_id', editBillId);
          const lineInserts = lines.map((l, idx) => {
            const qtyMilli = l.qty_milli || parseQuantityToMilli(l.quantity);
            const ratePaise = l.rate_paise !== undefined ? l.rate_paise : parseRupeesToPaise(l.rate);
            return {
              invoice_id: editBillId,
              line_no: idx + 1,
              description: l.description,
              hsn: l.hsn,
              unit: l.unit || 'PCS',
              qty_milli: qtyMilli,
              rate_paise: ratePaise,
              gst_percent: Number(l.gst_percent),
              amount_paise: Math.round((qtyMilli * ratePaise) / 1000),
            };
          });
          const { error: linesErr } = await supabase.from('invoice_lines').insert(lineInserts);
          if (linesErr) throw linesErr;
        }

        // Webhook dispatch on bill edit
        sendBillEmailWebhook(existingInvoice?.invoice_no, true);

        setSaveModalOpen(false);
        navigate(`/bills/${editBillId}`);
        return;
      }

      const { data, error } = await supabase.rpc('create_invoice', { payload });

      if (error) {
        throw error;
      }

      if (!data || !data.id) {
        throw new Error('No invoice record returned by server');
      }

      // Webhook dispatch on bill create
      sendBillEmailWebhook(data.invoice_no, false);

      // Successful save: clear draft and redirect to bill view
      try {
        localStorage.removeItem(DRAFT_STORAGE_KEY);
      } catch (err) {
        console.warn('Error clearing draft:', err);
      }

      setSaveModalOpen(false);
      navigate(`/bills/${data.id}`);
    } catch (err) {
      console.error('Error saving invoice:', err);
      setSaveModalOpen(false);

      // Check if network error or timeout
      const isNetwork =
        err.message?.toLowerCase().includes('network') ||
        err.message?.toLowerCase().includes('timeout') ||
        err.message?.toLowerCase().includes('failed to fetch');

      if (isNetwork) {
        // Do NOT retry automatically. Keep form data.
        setNetworkAlert(
          'Please check the Bills list before saving again, the bill may have been saved.'
        );
      } else {
        // Plain server error message
        setServerError(err.message || 'Server error saving invoice.');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setIsSaving(false);
    }
  };

  // ===========================================================================
  // GATE VIEW: If numbering is not set, BLOCK and SHOW CLEAR MESSAGE (New bills only)
  // ===========================================================================
  if (loadingExisting || gateLoading) {
    return (
      <div className="bg-white rounded-2xl border-2 border-slate-300 p-8 text-center space-y-3">
        <p className="text-lg font-bold text-slate-700">
          {isEditMode ? 'Loading bill details for editing...' : 'Verifying bill numbering series...'}
        </p>
      </div>
    );
  }

  if (!gateSet && !isEditMode) {
    return (
      <div className="bg-white rounded-3xl border-2 border-amber-300 p-6 sm:p-8 text-center space-y-5 shadow-sm max-w-lg mx-auto">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-100 text-amber-800 flex items-center justify-center">
          <svg className="w-9 h-9 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-black text-slate-900">
            Invoice Numbering Not Set
          </h2>
          <p className="text-base font-semibold text-slate-700">
            Starting invoice number is not set for Financial Year <span className="font-mono font-bold text-amber-900">FY {derivedFy}</span>.
          </p>
          <p className="text-sm text-slate-500">
            Before creating bills for this financial year, the starting sequence number must be set once in Settings.
          </p>
        </div>

        {gateError && (
          <div className="p-3 bg-red-50 border border-red-300 rounded-xl text-xs font-bold text-red-800 text-left">
            {gateError}
          </div>
        )}

        <div className="pt-2">
          <Link
            to="/settings"
            className="w-full inline-flex items-center justify-center min-h-[52px] px-6 py-3 rounded-2xl bg-slate-900 text-white font-black text-base hover:bg-slate-800 shadow-md transition"
          >
            Go to Settings &rarr;
          </Link>
        </div>
      </div>
    );
  }

  // ===========================================================================
  // MAIN NEW BILL FORM
  // ===========================================================================
  return (
    <div className="space-y-6 pb-28">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            {isEditMode ? `Edit Bill: ${existingInvoice?.invoice_no || ''}` : 'New Bill'}
          </h2>
          <p className="text-sm font-semibold text-slate-500">
            {isEditMode ? (
              <span>Editing finalized invoice &bull; Financial Year: <span className="font-mono font-bold text-slate-900">{derivedFy}</span></span>
            ) : (
              <span>Financial Year: <span className="font-mono font-bold text-slate-900">{derivedFy}</span></span>
            )}
          </p>
        </div>

        {draftRestored && (
          <button
            type="button"
            onClick={handleDiscardDraft}
            className="min-h-[44px] px-3 py-1.5 rounded-xl border-2 border-red-300 bg-red-50 text-red-900 font-bold text-xs hover:bg-red-100"
          >
            Discard Draft
          </button>
        )}
      </div>

      {/* Copied from existing bill notice (Phase 7) */}
      {copiedFromNotice && (
        <div className="p-4 rounded-2xl bg-emerald-50 border-2 border-emerald-400 text-emerald-950 font-bold text-sm flex items-center justify-between gap-2 shadow-xs">
          <div className="flex items-center space-x-2">
            <span className="text-xl">📋</span>
            <span>{copiedFromNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setCopiedFromNotice('')}
            className="text-emerald-700 hover:text-emerald-900 font-black text-lg cursor-pointer"
          >
            &times;
          </button>
        </div>
      )}

      {/* Draft Restored Banner */}
      {draftRestored && (
        <div className="p-3.5 rounded-2xl bg-blue-50 border-2 border-blue-300 flex items-center justify-between gap-2">
          <div className="flex items-center space-x-2 text-sm font-bold text-blue-900">
            <span>💾</span>
            <span>Restored in-progress draft from previous session.</span>
          </div>
        </div>
      )}

      {/* Network Alert */}
      {networkAlert && (
        <div className="p-4 rounded-2xl bg-amber-50 border-2 border-amber-500 text-amber-950 font-bold text-base space-y-2">
          <div className="flex items-start space-x-2">
            <span className="text-xl">⚠️</span>
            <div>
              <p>{networkAlert}</p>
              <Link
                to="/bills"
                className="inline-block mt-2 text-sm underline font-black text-blue-700"
              >
                Go to Bills List &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Server Error Alert */}
      {serverError && (
        <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-500 text-red-950 font-bold text-base">
          {serverError}
        </div>
      )}

      {/* Form Validation Errors Alert */}
      {formValidationErrors.length > 0 && (
        <div className="p-4 rounded-2xl bg-red-50 border-2 border-red-400 text-red-900 space-y-1">
          <h4 className="font-black text-base">Please fix the following before saving:</h4>
          <ul className="list-disc list-inside text-sm font-bold space-y-0.5">
            {formValidationErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      {/* SECTION 1: HEADER FIELDS */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">
          1. Bill Header & Buyer Details
        </h3>

        {/* Bill Date with Sequence Warning */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-1">
            Bill Date *
          </label>
          <input
            type="date"
            required
            value={billDate}
            onChange={(e) => handleBillDateChange(e.target.value)}
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
          />
          {latestBillWarning && (
            <p className="mt-1.5 p-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900">
              ⚠️ Warning: Bill date is older than the latest finalized bill in FY {derivedFy} (Invoice {latestBillWarning.latestNo} dated {formatDisplayDate(latestBillWarning.latestDate)}).
            </p>
          )}
        </div>

        {/* Buyer Dropdown */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-1">
            Buyer Company *
          </label>
          <select
            value={selectedBuyerId}
            onChange={(e) => setSelectedBuyerId(e.target.value)}
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
          >
            <option value="">-- Select Buyer Company --</option>
            {buyers.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.gstin})
              </option>
            ))}
          </select>
        </div>

        {/* Branch / Unit Dropdown */}
        {selectedBuyerId && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-base font-bold text-slate-900">
                Delivery Unit / Company *
              </label>
              <Link
                to="/buyers"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-blue-700 hover:text-blue-900 hover:underline flex items-center space-x-1"
              >
                <span>+ Add / Manage Units</span>
              </Link>
            </div>
            {branches.length === 0 ? (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-900">
                No active delivery unit address found for this buyer. Please add an address in Buyers &amp; Units.
              </div>
            ) : (
              <select
                value={selectedBranchId}
                onChange={(e) => handleBranchChange(e.target.value)}
                className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
              >
                {branches.map((br) => (
                  <option key={br.id} value={br.id}>
                    {br.label}
                  </option>
                ))}
              </select>
            )}

            {/* Display chosen address */}
            {chosenAddress && (
              <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                <span className="text-xs uppercase font-bold text-slate-400 block mb-0.5">
                  Chosen Delivery Address:
                </span>
                <p className="text-sm font-semibold text-slate-800 whitespace-pre-line leading-relaxed">
                  {chosenAddress}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Buyer Order No & Order Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-base font-bold text-slate-900 mb-1">
              Buyer Order No *
            </label>
            <input
              type="text"
              required
              value={buyerOrderNo}
              onChange={(e) => setBuyerOrderNo(e.target.value.toUpperCase())}
              placeholder="e.g. PO-1046"
              className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold uppercase"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-slate-900 mb-1">
              Buyer Order Date (Free text)
            </label>
            <input
              type="text"
              value={buyerOrderDate}
              onChange={(e) => setBuyerOrderDate(e.target.value)}
              placeholder="e.g. 10/04/2026 or multiple dates"
              className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
            />
          </div>
        </div>

        {/* Delivery No & Delivery Date */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-base font-bold text-slate-900 mb-1">
              Delivery No (Optional)
            </label>
            <input
              type="text"
              value={deliveryNo}
              onChange={(e) => setDeliveryNo(e.target.value)}
              placeholder="e.g. 0000 or leave blank"
              className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
            />
          </div>

          <div>
            <label className="block text-base font-bold text-slate-900 mb-1">
              Delivery Date
            </label>
            <input
              type="date"
              value={deliveryDate}
              onChange={(e) => setDeliveryDate(e.target.value)}
              className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
            />
          </div>
        </div>

        {/* Despatched Through */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-1">
            Despatched Through *
          </label>
          <input
            type="text"
            required
            value={despatchedThrough}
            onChange={(e) => setDespatchedThrough(e.target.value)}
            placeholder="e.g. Direct Delivery / Tempo"
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
          />
        </div>

        {/* Destination (Optional) */}
        <div>
          <label className="block text-base font-bold text-slate-900 mb-1">
            Destination (Optional)
          </label>
          <input
            type="text"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Melvisharam / Chennai"
            className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
          />
        </div>
      </div>

      {/* SECTION 2: LINE ITEMS (AS CARDS) */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
          <h3 className="text-lg font-black text-slate-900">
            2. Line Items ({lines.length})
          </h3>
          <button
            type="button"
            onClick={() => setNewItemModalOpen(true)}
            className="min-h-[44px] px-3.5 py-1.5 rounded-xl bg-blue-50 border border-blue-600 text-blue-800 font-black text-xs hover:bg-blue-100 flex items-center space-x-1"
          >
            <svg className="w-4 h-4 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            <span>Add New Item</span>
          </button>
        </div>

        {/* Item Search Box with Autocomplete Suggestions */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <label className="block text-base font-bold text-slate-900">
              Search Item to Add
            </label>
            <span className="text-xs font-semibold text-slate-500">
              {itemsCatalog.length} catalog items loaded
            </span>
          </div>

          <div className="relative">
            <input
              type="text"
              value={itemSearchText}
              onChange={(e) => {
                setItemSearchText(e.target.value);
                setSelectedSearchIdx(0);
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Search by item name (e.g. Surf, Soap, Box) or HSN..."
              className="w-full min-h-[50px] pl-4 pr-10 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-semibold focus:border-blue-600 focus:outline-none"
            />
            {itemSearchText && (
              <button
                type="button"
                onClick={() => setItemSearchText('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold flex items-center justify-center text-sm"
              >
                &times;
              </button>
            )}
          </div>

          {/* Search Results Dropdown with Autocomplete Suggestions */}
          {itemSearchText.trim().length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-white border-2 border-slate-900 rounded-2xl shadow-2xl max-h-72 overflow-y-auto divide-y divide-slate-100">
              {searchResults.length > 0 ? (
                searchResults.map((it, idx) => {
                  const isSelected = idx === selectedSearchIdx;
                  return (
                    <button
                      type="button"
                      key={it.id}
                      onClick={() => handleAddItemFromCatalog(it)}
                      onMouseEnter={() => setSelectedSearchIdx(idx)}
                      className={`w-full text-left p-3.5 flex items-center justify-between transition cursor-pointer ${
                        isSelected ? 'bg-blue-100/90 text-blue-950 font-bold' : 'hover:bg-blue-50'
                      }`}
                    >
                      <div>
                        <p className="font-black text-slate-900 text-base leading-snug">
                          {it.description}
                        </p>
                        <p className="text-xs font-semibold text-slate-600 mt-0.5">
                          HSN: <span className="font-bold text-slate-900">{it.hsn || 'Needs checking'}</span> &bull;{' '}
                          GST: <span className="font-bold text-slate-900">{it.gst_percent !== null ? `${it.gst_percent}%` : 'Needs checking'}</span> &bull;{' '}
                          Unit: <span className="font-bold text-slate-900">{it.unit || 'PCS'}</span>
                          {it.default_rate_paise ? (
                            <> &bull; Usual: <span className="font-bold text-emerald-700">₹{paiseToRupees(it.default_rate_paise)}</span></>
                          ) : null}
                        </p>
                      </div>
                      <span className="text-xs font-black text-blue-700 bg-blue-100 px-3 py-1.5 rounded-xl shrink-0 ml-2 border border-blue-300">
                        + Add
                      </span>
                    </button>
                  );
                })
              ) : (
                <div className="p-4 text-center space-y-2">
                  <p className="text-sm font-bold text-slate-700">
                    No catalog items matching &ldquo;{itemSearchText}&rdquo;
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setNewItemForm((prev) => ({ ...prev, description: itemSearchText.trim() }));
                      setItemSearchText('');
                      setNewItemModalOpen(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 cursor-pointer"
                  >
                    <span>+ Add &ldquo;{itemSearchText.trim()}&rdquo; as New Item</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Lines List as Cards */}
        {lines.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-slate-300 p-8 text-center space-y-2">
            <p className="text-base font-bold text-slate-700">No items added yet</p>
            <p className="text-sm text-slate-500">
              Search active items above or use the &ldquo;+ Add New Item&rdquo; shortcut.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {lines.map((line, idx) => {
              const lineValidation = validateBillLine(line);
              const qtyMilli = parseQuantityToMilli(line.quantity);
              const ratePaise = parseRupeesToPaise(line.rate);
              const lineAmountPaise = Math.round((qtyMilli * ratePaise) / 1000);

              const needsChecking = !line.hsn || line.gst_percent === '' || line.gst_percent === null;
              const hsnCheck = line.hsn ? validateHSN(line.hsn) : { warning: null };

              return (
                <div
                  key={line.id || idx}
                  className={`rounded-2xl border-2 p-4 shadow-sm space-y-3 transition ${
                    !lineValidation.isValid ? 'border-amber-400 bg-amber-50/20' : 'border-slate-300 bg-white'
                  }`}
                >
                  {/* Card Title & Remove */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 mr-2">
                      <span className="text-xs font-black text-slate-400 block uppercase">
                        Line #{idx + 1}
                      </span>
                      <input
                        type="text"
                        list="catalog-item-datalist"
                        value={line.description}
                        onChange={(e) => {
                          const val = e.target.value;
                          handleUpdateLine(idx, 'description', val);
                          const matched = itemsCatalog.find(
                            (c) => c.description.toLowerCase() === val.trim().toLowerCase()
                          );
                          if (matched) {
                            if (matched.hsn) handleUpdateLine(idx, 'hsn', matched.hsn);
                            if (matched.gst_percent !== null && matched.gst_percent !== undefined) {
                              handleUpdateLine(idx, 'gst_percent', String(matched.gst_percent));
                            }
                            if (matched.unit) handleUpdateLine(idx, 'unit', matched.unit);
                            if (matched.default_rate_paise) {
                              handleUpdateLine(idx, 'rate', paiseToRupees(matched.default_rate_paise));
                            }
                          }
                        }}
                        placeholder="Item Description"
                        className="w-full text-base sm:text-lg font-black text-slate-900 bg-transparent border-b-2 border-slate-300 focus:border-blue-600 focus:outline-none py-0.5"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setLinePendingRemoval(idx)}
                      className="min-h-[40px] px-3 py-1 rounded-xl text-xs font-bold text-red-700 bg-red-50 border border-red-300 hover:bg-red-100 shrink-0"
                    >
                      Remove
                    </button>
                  </div>

                  {/* Warning / Error inline */}
                  {needsChecking && (
                    <div className="p-2.5 rounded-xl bg-amber-100 border border-amber-400 text-amber-900 text-xs font-black flex items-center space-x-1.5">
                      <span>⚠️</span>
                      <span>Fill HSN and GST % (item needs checking)</span>
                    </div>
                  )}

                  {/* HSN not 4, 6 or 8 digits warning only */}
                  {!needsChecking && hsnCheck.warning && (
                    <p className="text-xs font-bold text-amber-800 flex items-center space-x-1">
                      <span>⚠️</span>
                      <span>{hsnCheck.warning}</span>
                    </p>
                  )}

                  {/* Fields: Unit, Quantity, Rate, GST % */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {/* Unit (free text editable) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Unit
                      </label>
                      <input
                        type="text"
                        value={line.unit}
                        onChange={(e) => handleUpdateLine(idx, 'unit', e.target.value.toUpperCase())}
                        placeholder="PCS"
                        className="w-full min-h-[48px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 text-base font-bold uppercase"
                      />
                    </div>

                    {/* Quantity (decimals allowed up to 3 places, stored as qty_milli) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Quantity
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="any"
                        min="0.001"
                        value={line.quantity}
                        onChange={(e) => handleUpdateLine(idx, 'quantity', e.target.value)}
                        placeholder="1"
                        className="w-full min-h-[48px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 text-base font-bold"
                      />
                    </div>

                    {/* Rate in rupees (editable) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        Rate (₹)
                      </label>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        min="0"
                        value={line.rate}
                        onChange={(e) => handleUpdateLine(idx, 'rate', e.target.value)}
                        placeholder="0.00"
                        className="w-full min-h-[48px] px-3 py-2 rounded-xl border-2 border-slate-300 text-slate-900 text-base font-bold"
                      />
                    </div>

                    {/* GST % (editable per line) */}
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        GST %
                      </label>
                      <select
                        value={line.gst_percent}
                        onChange={(e) => handleUpdateLine(idx, 'gst_percent', e.target.value)}
                        className="w-full min-h-[48px] px-2.5 py-2 rounded-xl border-2 border-slate-300 bg-white text-slate-900 text-base font-bold"
                      >
                        <option value="">Leave blank</option>
                        <option value="0">0%</option>
                        <option value="5">5%</option>
                        <option value="18">18%</option>
                        <option value="40">40%</option>
                      </select>
                    </div>
                  </div>

                  {/* HSN (editable free text) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 items-center">
                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">
                        HSN Code
                      </label>
                      <input
                        type="text"
                        value={line.hsn}
                        onChange={(e) => handleUpdateLine(idx, 'hsn', e.target.value.trim())}
                        placeholder="e.g. 3402"
                        className="w-full min-h-[48px] px-3 py-2 rounded-xl border-2 border-slate-300 font-mono text-slate-900 text-base font-bold"
                      />
                    </div>

                    {/* Calculated Line Amount */}
                    <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-right">
                      <span className="text-xs uppercase font-bold text-slate-400 block">
                        Line Taxable Amount
                      </span>
                      <span className="text-lg font-black text-slate-900 font-mono">
                        {formatRupees(lineAmountPaise)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Datalist for inline line description auto-completion */}
        <datalist id="catalog-item-datalist">
          {itemsCatalog.map((it) => (
            <option key={it.id} value={it.description}>
              {it.hsn ? `HSN: ${it.hsn}` : ''}
            </option>
          ))}
        </datalist>
      </div>

      {/* SECTION 3: LIVE TOTALS (RATE-GROUP BREAKDOWN & GRAND TOTAL) */}
      <div className="bg-white rounded-3xl border-2 border-slate-300 p-5 sm:p-6 shadow-sm space-y-4">
        <h3 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-2">
          3. Live Tax &amp; Totals Breakdown
        </h3>

        {/* Per-Rate Groups Table */}
        {calculatedInvoice.rateGroups.length === 0 ? (
          <p className="text-sm font-semibold text-slate-500">
            Add lines with quantity and rate to see the live tax breakdown.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-black uppercase text-slate-500">
                  <th className="py-2">Rate %</th>
                  <th className="py-2 text-right">Taxable</th>
                  <th className="py-2 text-right">CGST</th>
                  <th className="py-2 text-right">SGST</th>
                  <th className="py-2 text-right">Total Tax</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                {calculatedInvoice.rateGroups.map((g) => (
                  <tr key={g.gstPercent}>
                    <td className="py-2.5 font-bold">{g.gstPercent}%</td>
                    <td className="py-2.5 text-right font-mono">{formatRupees(g.taxablePaise)}</td>
                    <td className="py-2.5 text-right font-mono">{formatRupees(g.cgstPaise)}</td>
                    <td className="py-2.5 text-right font-mono">{formatRupees(g.sgstPaise)}</td>
                    <td className="py-2.5 text-right font-mono font-bold text-slate-900">
                      {formatRupees(g.taxPaise)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Consolidated Summary */}
        <div className="space-y-2 pt-2 border-t border-slate-200 text-sm">
          <div className="flex justify-between font-semibold text-slate-600">
            <span>Total Taxable Value</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(calculatedInvoice.totalTaxablePaise)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-slate-600">
            <span>Total CGST</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(calculatedInvoice.totalCgstPaise)}
            </span>
          </div>
          <div className="flex justify-between font-semibold text-slate-600">
            <span>Total SGST</span>
            <span className="font-mono font-bold text-slate-900">
              {formatRupees(calculatedInvoice.totalSgstPaise)}
            </span>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 text-lg font-black text-slate-900">
            <span>Grand Total</span>
            <span className="text-2xl font-mono text-blue-900">
              {formatRupees(calculatedInvoice.payablePaise)}
            </span>
          </div>
        </div>

        {/* Amount in words */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
          <span className="font-bold text-slate-400 uppercase block mb-0.5">
            Amount in Words:
          </span>
          <p className="font-bold text-slate-800 leading-relaxed">
            {numberToWordsIndian(calculatedInvoice.payablePaise)}
          </p>
        </div>
      </div>

      {/* STICKY BOTTOM BAR */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900 text-white shadow-2xl border-t border-slate-700 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <span className="text-xs uppercase font-bold text-slate-400 block">
              Grand Total
            </span>
            <span className="text-xl sm:text-2xl font-black font-mono tracking-tight text-white">
              {formatRupees(calculatedInvoice.payablePaise)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleInitiateSave}
            disabled={isSaving}
            className="min-h-[52px] px-6 py-3 rounded-2xl bg-blue-600 text-white font-black text-lg hover:bg-blue-500 active:bg-blue-700 shadow-lg flex items-center space-x-2 transition disabled:opacity-50"
          >
            <span>{isSaving ? 'Saving...' : 'Save Bill'}</span>
            <svg className="w-5 h-5 stroke-[3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>

      {/* MODAL: CONFIRM BILL SAVE */}
      {saveModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-900 flex items-center justify-center">
              <svg className="w-7 h-7 stroke-[2.5]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900">
                {isEditMode ? 'Confirm Bill Update' : 'Confirm Bill Finalization'}
              </h3>
              <p className="text-sm font-bold text-blue-900 bg-blue-50 p-3 rounded-xl border border-blue-200">
                {isEditMode
                  ? `Updating bill ${existingInvoice?.invoice_no || ''}. You can make changes anytime.`
                  : 'Invoice will be saved and assigned an automatic sequence number.'}
              </p>
              <p className="text-sm text-slate-600">
                Are you sure all buyer information, branch address, and line items are correct?
              </p>
            </div>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-sm font-semibold space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Buyer:</span>
                <span className="font-bold text-slate-900">{selectedBuyer?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="font-bold text-slate-900">{formatDisplayDate(billDate)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Lines:</span>
                <span className="font-bold text-slate-900">{lines.length} items</span>
              </div>
              <div className="flex justify-between text-base font-black pt-1 border-t border-slate-200">
                <span className="text-slate-900">Grand Total:</span>
                <span className="font-mono text-blue-900">{formatRupees(calculatedInvoice.payablePaise)}</span>
              </div>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setSaveModalOpen(false)}
                disabled={isSaving}
                className="flex-1 min-h-[48px] rounded-2xl border-2 border-slate-400 font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmSave}
                disabled={isSaving}
                className="flex-1 min-h-[48px] rounded-2xl bg-blue-700 text-white font-black hover:bg-blue-800 disabled:opacity-50"
              >
                {isSaving ? 'Saving...' : isEditMode ? 'Update Bill' : 'Yes, Finalize'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: LINE REMOVAL CONFIRMATION */}
      {linePendingRemoval !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-lg font-black text-slate-900">
              Remove Line Item?
            </h3>
            <p className="text-sm font-semibold text-slate-600">
              Are you sure you want to remove &ldquo;{lines[linePendingRemoval]?.description}&rdquo; from this bill?
            </p>
            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setLinePendingRemoval(null)}
                className="flex-1 min-h-[48px] rounded-2xl border-2 border-slate-400 font-bold text-slate-700"
              >
                Keep Line
              </button>
              <button
                type="button"
                onClick={handleConfirmRemoveLine}
                className="flex-1 min-h-[48px] rounded-2xl bg-red-600 text-white font-black hover:bg-red-700"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SHORTCUT ADD NEW ITEM */}
      {newItemModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-900 max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-xl font-black text-slate-900">
              Add New Item
            </h3>
            <p className="text-xs font-semibold text-slate-500">
              This item will be saved to your catalog and added directly to the current bill.
            </p>

            <form onSubmit={handleSaveNewItem} className="space-y-3.5">
              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  Item Description *
                </label>
                <input
                  type="text"
                  required
                  value={newItemForm.description}
                  onChange={(e) => setNewItemForm({ ...newItemForm, description: e.target.value })}
                  placeholder="e.g. Cleaning Detergent"
                  className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-base font-bold text-slate-900 mb-1">
                    Unit
                  </label>
                  <input
                    type="text"
                    value={newItemForm.unit}
                    onChange={(e) => setNewItemForm({ ...newItemForm, unit: e.target.value.toUpperCase() })}
                    placeholder="PCS"
                    className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold uppercase"
                  />
                </div>

                <div>
                  <label className="block text-base font-bold text-slate-900 mb-1">
                    Usual Rate (₹)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newItemForm.usual_rate}
                    onChange={(e) => setNewItemForm({ ...newItemForm, usual_rate: e.target.value })}
                    placeholder="0.00"
                    className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-bold"
                  />
                </div>
              </div>

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
                        setNewItemForm({
                          ...newItemForm,
                          hsn: preset.hsn,
                          gst_percent: String(preset.defaultGst),
                        });
                        setNewItemHsnWarning(null);
                      }}
                      className="text-[11px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-800 border border-blue-200 hover:bg-blue-100 transition active:scale-95 cursor-pointer"
                    >
                      {preset.hsn} ({preset.defaultGst}%) &bull; {preset.category.split('/')[0].trim()}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={newItemForm.hsn}
                  onChange={(e) => {
                    const val = e.target.value.trim();
                    setNewItemForm({ ...newItemForm, hsn: val });
                    const check = validateHSN(val);
                    setNewItemHsnWarning(check.warning);
                  }}
                  placeholder="e.g. 3402"
                  className="w-full min-h-[50px] px-4 py-3 rounded-2xl border-2 border-slate-400 text-slate-900 text-base font-mono font-bold"
                />
                {newItemHsnWarning && (
                  <p className="mt-1 text-xs font-bold text-amber-700">
                    ⚠️ {newItemHsnWarning}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-base font-bold text-slate-900 mb-1">
                  GST %
                </label>
                <select
                  value={newItemForm.gst_percent}
                  onChange={(e) => setNewItemForm({ ...newItemForm, gst_percent: e.target.value })}
                  className="w-full min-h-[50px] px-3 py-3 rounded-2xl border-2 border-slate-400 bg-white text-slate-900 text-base font-bold"
                >
                  <option value="">Leave blank</option>
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="18">18%</option>
                  <option value="40">40%</option>
                </select>
              </div>

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setNewItemModalOpen(false)}
                  className="flex-1 min-h-[48px] rounded-2xl border-2 border-slate-400 font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newItemSaving}
                  className="flex-1 min-h-[48px] rounded-2xl bg-blue-700 text-white font-black hover:bg-blue-800 disabled:opacity-50"
                >
                  {newItemSaving ? 'Saving...' : 'Save & Add Line'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
