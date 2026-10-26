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
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 794,
      onclone: (clonedDoc, clonedEl) => {
        // Reset scale transforms and offscreen positioning on cloned DOM so capture is always full-resolution A4
        let cur = clonedEl;
        while (cur && cur !== clonedDoc.body) {
          if (cur.style) {
            if (cur.style.transform && cur.style.transform.includes('scale')) {
              cur.style.transform = 'none';
            }
            if (cur.style.position === 'fixed' || cur.style.position === 'absolute') {
              cur.style.position = 'static';
              cur.style.left = '0';
              cur.style.top = '0';
            }
            if (cur.style.opacity === '0') {
              cur.style.opacity = '1';
            }
          }
          if (cur.classList && cur.classList.contains('invoice-scale-wrapper')) {
            cur.style.width = '794px';
            cur.style.height = 'auto';
            cur.style.overflow = 'visible';
          }
          cur = cur.parentElement;
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
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 200);
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
