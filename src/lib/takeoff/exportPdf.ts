import { jsPDF } from 'jspdf';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Canvas as FabricCanvas } from 'fabric';

/**
 * Export an annotated PDF with Fabric.js overlays rendered on top of each page.
 * Re-renders each page from the original PDF and composites the Fabric canvas on top.
 */
export async function exportAnnotatedPdf(
  pdf: PDFDocumentProxy,
  pageStates: Record<number, unknown>,
  sessionName: string
): Promise<void> {
  const firstPage = await pdf.getPage(1);
  const viewport = firstPage.getViewport({ scale: 1 });

  // Create jsPDF document matching the PDF page dimensions
  const orientation = viewport.width > viewport.height ? 'landscape' : 'portrait';
  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [viewport.width, viewport.height],
  });

  const renderScale = 1.5; // Match TakeoffCanvas render scale

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    if (pageNum > 1) {
      const page = await pdf.getPage(pageNum);
      const pv = page.getViewport({ scale: 1 });
      doc.addPage([pv.width, pv.height], pv.width > pv.height ? 'landscape' : 'portrait');
    }

    // Render PDF page to a temporary canvas
    const page = await pdf.getPage(pageNum);
    const pv = page.getViewport({ scale: renderScale });
    const pdfCanvas = document.createElement('canvas');
    pdfCanvas.width = pv.width;
    pdfCanvas.height = pv.height;
    const ctx = pdfCanvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, canvas: pdfCanvas, viewport: pv }).promise;

    // Add PDF page as base image
    const pageViewport = page.getViewport({ scale: 1 });
    const pdfImgData = pdfCanvas.toDataURL('image/jpeg', 0.85);
    doc.addImage(pdfImgData, 'JPEG', 0, 0, pageViewport.width, pageViewport.height);

    // Composite Fabric.js annotations on top if page state exists
    const fabricState = pageStates[pageNum];
    if (fabricState && typeof fabricState === 'object') {
      try {
        const annotationImg = await renderFabricStateToImage(fabricState as Record<string, unknown>, pv.width, pv.height);
        if (annotationImg) {
          doc.addImage(annotationImg, 'PNG', 0, 0, pageViewport.width, pageViewport.height);
        }
      } catch (err) {
        console.warn(`Failed to render annotations for page ${pageNum}:`, err);
      }
    }
  }

  doc.save(`${sessionName || 'takeoff'}-annotated.pdf`);
}

/**
 * Render a saved Fabric.js canvas state to a transparent PNG data URL.
 * Creates a temporary off-screen Fabric canvas, loads the state, and exports.
 */
async function renderFabricStateToImage(
  fabricJson: string | Record<string, unknown>,
  width: number,
  height: number
): Promise<string | null> {
  // Create an off-screen canvas element
  const canvasEl = document.createElement('canvas');
  canvasEl.width = width;
  canvasEl.height = height;

  const tempCanvas = new FabricCanvas(canvasEl, {
    width,
    height,
    renderOnAddRemove: false,
  });

  try {
    await tempCanvas.loadFromJSON(fabricJson);
    tempCanvas.renderAll();

    // Export as transparent PNG
    const dataUrl = tempCanvas.toDataURL({
      format: 'png',
      multiplier: 1,
    });

    return dataUrl;
  } finally {
    tempCanvas.dispose();
  }
}
