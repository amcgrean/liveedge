import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';

// Configure worker — MUST be called before any PDF load
if (typeof window !== 'undefined') {
  GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();
}

let currentRenderTask: RenderTask | null = null;

/**
 * Load a PDF from a File object or ArrayBuffer.
 */
export async function loadPdf(source: File | ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  let data: ArrayBuffer | Uint8Array;
  if (source instanceof File) {
    data = await source.arrayBuffer();
  } else {
    data = source;
  }
  const loadingTask = getDocument({
    data,
    // Avoid JBIG2 wasm URL resolution issues in bundled environments.
    useWasm: false,
  });
  return loadingTask.promise;
}

/**
 * Render a specific page of a PDF to a canvas element.
 * Non-blocking: uses requestAnimationFrame and async render.
 * Cancels any in-progress render task before starting a new one.
 */
export async function renderPage(
  pdf: PDFDocumentProxy,
  pageNumber: number,
  canvas: HTMLCanvasElement,
  scale: number = 1.5
): Promise<{ width: number; height: number }> {
  // Cancel previous render if still in progress
  if (currentRenderTask) {
    try {
      currentRenderTask.cancel();
    } catch {
      // Ignore cancel errors
    }
    currentRenderTask = null;
  }

  const page: PDFPageProxy = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });

  // Set canvas dimensions
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not get 2d context');

  // Wait for next animation frame to avoid blocking
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const renderContext = {
    canvasContext: context,
    canvas,
    viewport,
  };

  currentRenderTask = page.render(renderContext);

  try {
    await currentRenderTask.promise;
  } catch (err: unknown) {
    // RenderingCancelledException is expected when navigating pages quickly
    if (err && typeof err === 'object' && 'name' in err && (err as { name: string }).name === 'RenderingCancelledException') {
      return { width: viewport.width, height: viewport.height };
    }
    throw err;
  } finally {
    currentRenderTask = null;
  }

  return { width: viewport.width, height: viewport.height };
}

/**
 * Get the native (unscaled) dimensions of a PDF page.
 */
export async function getPageDimensions(
  pdf: PDFDocumentProxy,
  pageNumber: number
): Promise<{ width: number; height: number }> {
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height };
}
