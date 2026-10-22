import React, { useState } from 'react';
import InvoiceSheet from '../components/InvoiceSheet.jsx';
import { getInvoicePdfFilename } from '../lib/invoiceLayout.js';
import { generateInvoicePdfBlob, downloadInvoicePdf, shareInvoicePdf } from '../lib/pdfGenerator.js';

const SAMPLE_FIRM = {
  name: 'KHANSA ENTERPRISES',
  address: '#158,Pudhupet 3rd Street,\nMELVISHARAM-632509\nRanipet District\nTamil Nadu.',
  phone: '9445671796',
  email: 'mohammedafzalarni@yahoo.com',
  gstin: '33AGXPF4947Q1ZH',
  declaration: 'We declare that this invoice shows the actual price of the goods described & that all particulars are true and correct',
};

// Real Sample A (from 2BILLTAX FORMAT.xlsm: 046/25-26 with two GST rates 5% and 18%)
const SAMPLE_A = {
  id: 'fixture-sample-a',
  invoice_no: '046/25-26',
  invoice_date: '2025-05-02',
  fy: '25-26',
  buyer_order_no: 'U3-85955',
  buyer_order_date: '30/4/2025',
  delivery_no: '2702',
  delivery_date: '2025-05-02',
  despatched_through: 'Road',
  destination: 'Melvisharam',
  terms_of_delivery: 'Immediate',
  buyer_name: 'KH EXPORT INDIA PVT LTD',
  buyer_address: 'LEATHER GOODS DIVISION UNIT-III\n256,257 KATHIYAVADI ROAD,\nMELVISHARAM-632509',
  buyer_gstin: '33AAACR1714R1ZA',
  taxable_paise: 112500,
  cgst_paise: 6062,
  sgst_paise: 6063,
  total_tax_paise: 12125,
  payable_paise: 124625,
  amount_in_words: 'Rupees One Thousand Two Hundred Forty Six and Twenty Five Paise Only',
  lines: [
    {
      line_no: 1,
      description: 'Hair CapNet',
      hsn: '91051900',
      gst_percent: 5,
      qty_milli: 500000,
      rate_paise: 125,
      unit: 'nos',
      amount_paise: 62500,
    },
    {
      line_no: 2,
      description: 'Plastic Oil Nozzle',
      hsn: '39231010',
      gst_percent: 18,
      qty_milli: 200000,
      rate_paise: 250,
      unit: 'nos',
      amount_paise: 50000,
    },
  ],
};

// Real Sample B (from SINGLE FORMAT.xlsm: 047/25-26 with 3 lines @ 18%)
const SAMPLE_B = {
  id: 'fixture-sample-b',
  invoice_no: '047/25-26',
  invoice_date: '2025-05-02',
  fy: '25-26',
  buyer_order_no: 'HK-85811',
  buyer_order_date: '25/04/2025',
  delivery_no: '2703',
  delivery_date: '2025-05-02',
  despatched_through: 'Road',
  destination: 'Chennai',
  terms_of_delivery: 'Immediate',
  buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
  buyer_address: 'Leather Goods Division\n4/74 V.O.C street seneerkuppam, Poonamallee\nChennai-56',
  buyer_gstin: '33AAACR1714R1ZA',
  taxable_paise: 287500,
  cgst_paise: 25875,
  sgst_paise: 25875,
  total_tax_paise: 51750,
  payable_paise: 339250,
  amount_in_words: 'Rupees Three Thousand Three Hundred Ninety Two and Fifty Paise Only',
  lines: [
    {
      line_no: 1,
      description: 'Vim Soap',
      hsn: '34011930',
      gst_percent: 18,
      qty_milli: 20000,
      rate_paise: 1000,
      unit: 'nos',
      amount_paise: 20000,
    },
    {
      line_no: 2,
      description: 'Hammam Soap',
      hsn: '34011930',
      gst_percent: 18,
      qty_milli: 20000,
      rate_paise: 5500,
      unit: 'nos',
      amount_paise: 110000,
    },
    {
      line_no: 3,
      description: 'Surf Excel',
      hsn: '34011930',
      gst_percent: 18,
      qty_milli: 9000,
      rate_paise: 17500,
      unit: 'kg',
      amount_paise: 157500,
    },
  ],
};

// 30-Line Pagination Test Sample
const SAMPLE_30_LINES = {
  id: 'fixture-sample-30',
  invoice_no: 'TEST-30/26-27',
  invoice_date: '2026-10-22',
  fy: '26-27',
  buyer_order_no: 'PO-PAGINATION-30',
  buyer_order_date: '20/10/2026',
  delivery_no: 'DC-9999',
  delivery_date: '2026-10-22',
  despatched_through: 'Internal Truck',
  destination: 'Melvisharam Unit IV',
  terms_of_delivery: 'Standard Terms',
  buyer_name: 'KH EXPORT INDIA PRIVATE LTD',
  buyer_address: 'Central Stores & Logistics\nUnit IV Melvisharam\nRanipet District',
  buyer_gstin: '33AAACR1714R1ZA',
  taxable_paise: 300000,
  cgst_paise: 27000,
  sgst_paise: 27000,
  total_tax_paise: 54000,
  payable_paise: 354000,
  amount_in_words: 'Rupees Three Thousand Five Hundred Forty Only',
  lines: Array.from({ length: 30 }, (_, i) => ({
    line_no: i + 1,
    description: `Industrial Maintenance Item #${i + 1} - Standard Specification`,
    hsn: i % 2 === 0 ? '34011930' : '39231010',
    gst_percent: 18,
    qty_milli: 1000,
    rate_paise: 10000,
    unit: 'nos',
    amount_paise: 10000,
  })),
};

export default function DevPrintSample() {
  const [selectedSample, setSelectedSample] = useState('SAMPLE_A');
  const [copyCount, setCopyCount] = useState(3);
  const [labelCopies, setLabelCopies] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [measuredPdfSize, setMeasuredPdfSize] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');

  const activeInvoice =
    selectedSample === 'SAMPLE_A'
      ? SAMPLE_A
      : selectedSample === 'SAMPLE_B'
      ? SAMPLE_B
      : SAMPLE_30_LINES;

  const handlePrint = () => {
    window.print();
  };

  const handleGeneratePdf = async (action = 'download') => {
    setGeneratingPdf(true);
    setStatusMsg('Rendering invoice pages to PDF...');
    try {
      const container = document.getElementById('dev-print-container');
      const pages = container.querySelectorAll('.invoice-page');
      const filename = getInvoicePdfFilename(activeInvoice.invoice_no);

      const { blob, sizeBytes, sizeKb } = await generateInvoicePdfBlob(pages, {
        scale: 2,
        jpegQuality: 0.85,
      });

      setMeasuredPdfSize({ sizeBytes, sizeKb, pagesCount: pages.length });

      if (action === 'download') {
        downloadInvoicePdf(blob, filename);
        setStatusMsg(`Downloaded ${filename} (${sizeKb} KB for ${pages.length} pages)`);
      } else if (action === 'share') {
        const shareResult = await shareInvoicePdf(blob, filename, {
          title: `Invoice ${activeInvoice.invoice_no}`,
          text: `Tax Invoice ${activeInvoice.invoice_no}`,
        });

        if (shareResult.fallbackNeeded) {
          downloadInvoicePdf(blob, filename);
          setStatusMsg(`Web Share unavailable. Downloaded ${filename} (${sizeKb} KB) instead.`);
        } else {
          setStatusMsg(`Share sheet opened for ${filename} (${sizeKb} KB)`);
        }
      }
    } catch (err) {
      console.error('PDF error:', err);
      setStatusMsg(`Error: ${err.message}`);
    } finally {
      setGeneratingPdf(false);
    }
  };

  return (
    <div className="space-y-6 pb-16">
      {/* Dev Controls Header Bar */}
      <div className="bg-amber-50 rounded-2xl border-2 border-amber-400 p-5 shadow-sm space-y-4 no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-black uppercase text-amber-800 tracking-wider">
              DEV-ONLY TEST BENCH &bull; NO DB ACCESS
            </span>
            <h2 className="text-2xl font-black text-slate-900">
              A4 Print &amp; PDF Fixtures
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-sm hover:bg-slate-800"
            >
              Browser Print
            </button>
            <button
              type="button"
              disabled={generatingPdf}
              onClick={() => handleGeneratePdf('download')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-blue-700 text-white font-bold text-sm hover:bg-blue-800 disabled:opacity-50"
            >
              {generatingPdf ? 'Rendering PDF...' : 'Download PDF'}
            </button>
            <button
              type="button"
              disabled={generatingPdf}
              onClick={() => handleGeneratePdf('share')}
              className="min-h-[44px] px-4 py-2 rounded-xl bg-emerald-700 text-white font-bold text-sm hover:bg-emerald-800 disabled:opacity-50"
            >
              Share PDF
            </button>
          </div>
        </div>

        {/* Fixture Selector & Options */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-amber-200">
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Select Sample Bill
            </label>
            <select
              value={selectedSample}
              onChange={(e) => setSelectedSample(e.target.value)}
              className="w-full min-h-[44px] px-3 py-2 rounded-xl border-2 border-amber-300 bg-white text-slate-900 font-bold text-sm"
            >
              <option value="SAMPLE_A">Sample A: 046/25-26 (2 rates: 5% + 18%)</option>
              <option value="SAMPLE_B">Sample B: 047/25-26 (3 lines @ 18%)</option>
              <option value="SAMPLE_30">Sample 30-Line: Test Multi-Page Pagination</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Copies (1 - 5)
            </label>
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => setCopyCount((c) => Math.max(1, c - 1))}
                className="w-10 h-10 rounded-lg border-2 border-amber-300 font-black bg-white hover:bg-amber-100"
              >
                -
              </button>
              <span className="font-mono font-black text-lg px-2">
                {copyCount}
              </span>
              <button
                type="button"
                onClick={() => setCopyCount((c) => Math.min(5, c + 1))}
                className="w-10 h-10 rounded-lg border-2 border-amber-300 font-black bg-white hover:bg-amber-100"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-4">
            <input
              id="devLabelCopies"
              type="checkbox"
              checked={labelCopies}
              onChange={(e) => setLabelCopies(e.target.checked)}
              className="w-5 h-5 rounded border-2 border-amber-400"
            />
            <label htmlFor="devLabelCopies" className="text-xs font-bold text-slate-800 cursor-pointer">
              Label Copies (Original / Duplicate / Triplicate)
            </label>
          </div>
        </div>

        {/* Status & Measurement Report */}
        {(statusMsg || measuredPdfSize) && (
          <div className="p-3 bg-white rounded-xl border border-amber-300 text-xs font-semibold text-slate-800 space-y-1">
            {statusMsg && <p>{statusMsg}</p>}
            {measuredPdfSize && (
              <p className="font-mono text-emerald-800 font-bold">
                Measured PDF File Size: {measuredPdfSize.sizeKb} KB ({measuredPdfSize.sizeBytes} bytes) for {measuredPdfSize.pagesCount} A4 pages (target: &lt; 500 KB).
              </p>
            )}
          </div>
        )}
      </div>

      {/* Visible Container for On-Screen Preview and Print */}
      <div id="dev-print-container" className="space-y-8 overflow-x-auto p-2 bg-slate-200/50 rounded-2xl border-2 border-slate-300">
        {Array.from({ length: copyCount }).map((_, cIdx) => {
          let label = '';
          if (labelCopies) {
            if (cIdx === 0) label = 'ORIGINAL FOR RECIPIENT';
            else if (cIdx === 1) label = 'DUPLICATE FOR TRANSPORTER';
            else if (cIdx === 2) label = 'TRIPLICATE FOR SUPPLIER';
            else label = `EXTRA COPY (${cIdx + 1})`;
          }

          return (
            <div key={cIdx} className="space-y-4">
              <div className="text-center font-bold text-xs uppercase tracking-wider text-slate-500 no-print">
                Copy #{cIdx + 1} {label ? `(${label})` : ''}
              </div>
              <InvoiceSheet
                invoice={activeInvoice}
                firmProfile={SAMPLE_FIRM}
                copyLabel={label}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
