import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas-pro';

/**
 * PDF generator using jsPDF and html2canvas.
 * Statically bundled so dynamic chunk fetching never fails across PWA updates or offline usage.
 */

/**
 * Renders an array of DOM page elements into an A4 PDF blob.
 *
 * @param {HTMLElement[]|NodeListOf<HTMLElement>} pageElements - Array or NodeList of .invoice-page elements
 * @param {Object} [options]
 * @param {number} [options.scale=2] - html2canvas scale factor for sharp text
 * @param {number} [options.jpegQuality=0.85] - JPEG quality (0.85 produces crisp print while keeping under 120KB/page)
 * @returns {Promise<{ blob: Blob, sizeBytes: number, sizeKb: number }>}
 */
export async function generateInvoicePdfBlob(pageElements, { scale = 2, jpegQuality = 0.85 } = {}) {
  const elements = Array.from(pageElements || []);
  if (elements.length === 0) {
    throw new Error('No invoice page elements provided for PDF generation');
  }

  // A4 portrait: 210mm x 297mm
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });

  for (let i = 0; i < elements.length; i++) {
    const pageEl = elements[i];

    const canvas = await html2canvas(pageEl, {
      scale,
      useCORS: true,
      allowTaint: true,
      logging: false,
      backgroundColor: '#ffffff',
      width: 794,
      height: 1123,
      windowWidth: 794,
      windowHeight: 1123,
      x: 0,
      y: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: async (clonedDoc, clonedEl) => {
        // Copy active document stylesheets into clonedDoc so it never renders unstyled
        try {
          const styleTag = clonedDoc.createElement('style');
          let cssText = '';
          Array.from(document.styleSheets).forEach((sheet) => {
            try {
              Array.from(sheet.cssRules || []).forEach((rule) => {
                cssText += rule.cssText + '\n';
              });
            } catch {
              // ignore cross-origin
            }
          });
          if (cssText) {
            styleTag.textContent = cssText;
            clonedDoc.head.appendChild(styleTag);
          }
        } catch {
          // ignore
        }

        // 1. Configure clonedDoc body as a clean 794px canvas
        if (clonedDoc.body) {
          clonedDoc.body.style.margin = '0';
          clonedDoc.body.style.padding = '0';
          clonedDoc.body.style.backgroundColor = '#ffffff';
          clonedDoc.body.style.overflow = 'visible';
          clonedDoc.body.style.width = '794px';
          clonedDoc.body.style.minWidth = '794px';
        }
        if (clonedDoc.documentElement) {
          clonedDoc.documentElement.style.margin = '0';
          clonedDoc.documentElement.style.padding = '0';
          clonedDoc.documentElement.style.overflow = 'visible';
          clonedDoc.documentElement.style.width = '794px';
          clonedDoc.documentElement.style.minWidth = '794px';
        }

        // 2. Hide all other top-level elements so nothing can overlap or interfere
        if (clonedDoc.body) {
          Array.from(clonedDoc.body.children).forEach((child) => {
            if (child !== clonedEl && !child.contains(clonedEl)) {
              child.style.display = 'none';
            }
          });
        }

        // 3. Move clonedEl to be the direct first child of body at top-left (0, 0)
        // This isolates it from any parent container positioning, transforms, clipping, or offsets
        if (clonedEl && clonedDoc.body) {
          clonedDoc.body.prepend(clonedEl);

          clonedEl.style.position = 'absolute';
          clonedEl.style.top = '0px';
          clonedEl.style.left = '0px';
          clonedEl.style.width = '794px';
          clonedEl.style.minWidth = '794px';
          clonedEl.style.maxWidth = '794px';
          clonedEl.style.height = '1123px';
          clonedEl.style.minHeight = '1123px';
          clonedEl.style.maxHeight = '1123px';
          clonedEl.style.transform = 'none';
          clonedEl.style.margin = '0';
          clonedEl.style.padding = '24px 20px';
          clonedEl.style.boxShadow = 'none';
          clonedEl.style.display = 'flex';
          clonedEl.style.flexDirection = 'column';
          clonedEl.style.justifyContent = 'flex-start';
          clonedEl.style.border = 'none';
          clonedEl.style.opacity = '1';
          clonedEl.style.visibility = 'visible';
          clonedEl.style.zIndex = '99999';
          clonedEl.style.boxSizing = 'border-box';

          // Ensure all descendants inside clonedEl are fully visible
          const allDescendants = clonedEl.querySelectorAll('*');
          allDescendants.forEach((d) => {
            d.style.visibility = 'visible';
            if (d.style.opacity && d.style.opacity !== '1') {
              d.style.opacity = '1';
            }
          });
        }

        // 4. Ensure all images inside clonedDoc are fully decoded before paint
        try {
          const imgs = Array.from(clonedDoc.querySelectorAll('img'));
          await Promise.all(
            imgs.map((img) => {
              if (img.complete && img.naturalWidth > 0) return Promise.resolve();
              return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
                setTimeout(resolve, 300); // 300ms ceiling so capture never hangs
              });
            })
          );
        } catch {
          // Non-blocking fallback
        }
      },
    });

    const imgData = canvas.toDataURL('image/jpeg', jpegQuality);

    if (i > 0) {
      pdf.addPage('a4', 'portrait');
    }

    // 210mm width, 297mm height
    pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  }

  const blob = pdf.output('blob');
  const sizeBytes = blob.size;
  const sizeKb = Math.round(sizeBytes / 1024);

  return { blob, sizeBytes, sizeKb };
}

/**
 * Downloads a generated PDF blob to the user's local disk.
 *
 * @param {Blob} blob - The PDF blob
 * @param {string} filename - The output file name (e.g. "048-26-27.pdf")
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
