/**
 * Lazy-loaded PDF generator using jsPDF and html2canvas.
 * Keeping imports dynamic ensures main app bundle size remains lean.
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

  // Lazy-load libraries on-demand
  const [{ jsPDF }, html2canvasModule] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
  ]);
  const html2canvas = html2canvasModule.default || html2canvasModule;

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
      windowWidth: 794,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
      onclone: async (clonedDoc, clonedEl) => {
        // 1. Force clonedDoc root and body to exact 794px A4 width with zero scroll/margin
        if (clonedDoc.documentElement) {
          clonedDoc.documentElement.style.width = '794px';
          clonedDoc.documentElement.style.minWidth = '794px';
          clonedDoc.documentElement.style.margin = '0';
          clonedDoc.documentElement.style.padding = '0';
          clonedDoc.documentElement.style.overflow = 'visible';
        }
        if (clonedDoc.body) {
          clonedDoc.body.style.width = '794px';
          clonedDoc.body.style.minWidth = '794px';
          clonedDoc.body.style.margin = '0';
          clonedDoc.body.style.padding = '0';
          clonedDoc.body.style.overflow = 'visible';
        }

        // 2. Unconstrain and reset clonedEl explicitly to 794px A4 dimensions
        if (clonedEl && clonedEl.style) {
          clonedEl.style.width = '794px';
          clonedEl.style.minWidth = '794px';
          clonedEl.style.maxWidth = '794px';
          clonedEl.style.transform = 'none';
          clonedEl.style.margin = '0';
          clonedEl.style.position = 'static';
          clonedEl.style.opacity = '1';
        }

        // 3. Reset all ancestor containers up to body
        let cur = clonedEl ? clonedEl.parentElement : null;
        while (cur && cur !== clonedDoc.body) {
          if (cur.style) {
            cur.style.position = 'static';
            cur.style.left = '0';
            cur.style.top = '0';
            cur.style.opacity = '1';
            cur.style.transform = 'none';
            cur.style.width = '794px';
            cur.style.maxWidth = 'none';
            cur.style.minWidth = '794px';
            cur.style.overflow = 'visible';
            cur.style.margin = '0';
            cur.style.padding = '0';
          }
          cur = cur.parentElement;
        }

        // 4. Ensure all images inside clonedDoc (including logo) are fully decoded
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
