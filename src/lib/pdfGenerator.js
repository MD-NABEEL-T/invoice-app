import { jsPDF } from 'jspdf';
import { buildVectorInvoicePdf } from './vectorPdfGenerator.js';
import { getInvoicePdfFilename } from './invoiceLayout.js';

/**
 * Official Vector PDF Generator for Khansa Enterprises GST Invoicing.
 * Produces crisp, lightweight (~30-50KB) A4 PDFs with 100% vector text
 * matching Excel Book1.xlsx sheet 230 exactly.
 */

/**
 * Generates an A4 PDF blob for an invoice.
 * Supports being called with (pageElements, options, invoice, firmProfile) or directly with (invoice, options, firmProfile).
 *
 * @param {Object|HTMLElement[]|NodeListOf<HTMLElement>} target - Invoice object OR array of page elements
 * @param {Object} [options]
 * @param {Object} [maybeInvoice] - Invoice object if target was DOM elements
 * @param {Object} [maybeFirm] - Firm profile object
 * @returns {Promise<{ blob: Blob, sizeBytes: number, sizeKb: number, doc: jsPDF }>}
 */
export async function generateInvoicePdfBlob(target, options = {}, maybeInvoice = null, maybeFirm = null) {
  let invoice = null;
  let firmProfile = maybeFirm;

  if (target && !Array.isArray(target) && !target.nodeType && target.invoice_no) {
    invoice = target;
  } else if (maybeInvoice && maybeInvoice.invoice_no) {
    invoice = maybeInvoice;
  } else if (typeof window !== 'undefined' && window.__activeInvoice) {
    invoice = window.__activeInvoice;
    firmProfile = firmProfile || window.__activeFirmProfile;
  }

  if (!invoice) {
    // If target is array of elements, check dataset
    const elements = Array.from(target || []);
    if (elements.length > 0 && elements[0].dataset?.invoice) {
      try {
        invoice = JSON.parse(elements[0].dataset.invoice);
      } catch {
        // ignore
      }
    }
  }

  if (!invoice) {
    throw new Error('No invoice data provided for PDF generation');
  }

  const doc = buildVectorInvoicePdf(invoice, firmProfile, options);
  const blob = doc.output('blob');
  const sizeBytes = blob.size;
  const sizeKb = Math.round(sizeBytes / 1024);

  return { blob, sizeBytes, sizeKb, doc };
}

/**
 * Downloads a generated PDF blob to the user's local disk.
 *
 * @param {Blob} blob - The PDF blob
 * @param {string} filename - The output file name (e.g. "230-26-27.pdf")
 */
export function downloadInvoicePdf(blob, filename = 'invoice.pdf') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  // Retain object URL for 60 seconds so mobile OS / slow download handlers have time to read blob
  setTimeout(() => {
    try {
      if (document.body.contains(a)) {
        document.body.removeChild(a);
      }
      URL.revokeObjectURL(url);
    } catch {
      // Ignore cleanup error
    }
  }, 60000);
}

/**
 * Shares a generated PDF file via navigator.share if supported on the device.
 *
 * @param {Blob} blob - The PDF blob
 * @param {string} filename - The output file name
 * @param {Object} [shareData]
 * @returns {Promise<{ success: boolean, fallbackNeeded: boolean, message?: string }>}
 */
export async function shareInvoicePdf(blob, filename = 'invoice.pdf', { title = 'Tax Invoice', text = '' } = {}) {
  const file = new File([blob], filename, { type: 'application/pdf' });

  if (typeof navigator !== 'undefined' && navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title,
        text,
      });
      return { success: true, fallbackNeeded: false };
    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled share sheet
        return { success: false, fallbackNeeded: false, message: 'Share cancelled' };
      }
      return { success: false, fallbackNeeded: true, message: err.message || 'Share failed' };
    }
  }

  return {
    success: false,
    fallbackNeeded: true,
    message: 'Web Share not supported for files on this browser',
  };
}
