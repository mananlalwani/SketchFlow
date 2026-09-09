import { createProject } from './api';
import { decodeDrawFormat, DRAW_FORMAT_EXTENSION } from './drawFormat';
import { generateId, serializeProject } from './utils';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface ProjectImportResult {
  format: 'dra' | 'pdf';
  pageCount?: number;
}

/**
 * PDF imports are kept deliberately bounded because each page remains as a
 * data URL in the project payload after rasterization. The limits are high
 * enough for ordinary decks and documents while preventing a single import
 * from allocating an unbounded canvas or serialized payload.
 */
export const PDF_IMPORT_MAX_FILE_BYTES = 100 * 1024 * 1024;
export const PDF_IMPORT_MAX_PAGES = 500;
export const PDF_IMPORT_RENDER_SCALE = 2;
export const PDF_IMPORT_MAX_RENDER_DIMENSION = 4096;
export const PDF_IMPORT_MAX_RENDER_PIXELS = 16_000_000;
export const PDF_IMPORT_MAX_TOTAL_RENDER_PIXELS = 500_000_000;
// Keep room for the surrounding create-project request. These mirror the
// server's 10 MiB project and 7 MiB imageData validation ceilings.
export const PDF_IMPORT_MAX_PROJECT_BYTES = 9 * 1024 * 1024;
export const PDF_IMPORT_MAX_IMAGE_DATA_CHARS = 7 * 1024 * 1024;

export type PdfImportErrorCode =
  | 'file-too-large'
  | 'too-many-pages'
  | 'too-many-pixels'
  | 'project-too-large'
  | 'image-too-large'
  | 'canvas-unavailable'
  | 'page-render-failed'
  | 'invalid-document';

/** Error with a message suitable for displaying in the import toast. */
export class PdfImportError extends Error {
  readonly code: PdfImportErrorCode;

  constructor(code: PdfImportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PdfImportError';
    this.code = code;
  }
}

/** Chooses a readable raster scale without exceeding browser canvas budgets. */
export function getPdfImportRasterScale(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new PdfImportError(
      'invalid-document',
      'This PDF contains a page with invalid dimensions and cannot be imported.',
    );
  }

  const dimensionScale = PDF_IMPORT_MAX_RENDER_DIMENSION / Math.max(width, height);
  const pixelScale = Math.sqrt(PDF_IMPORT_MAX_RENDER_PIXELS / (width * height));
  const scale = Math.min(PDF_IMPORT_RENDER_SCALE, dimensionScale, pixelScale);
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new PdfImportError(
      'invalid-document',
      'This PDF page is too large to rasterize safely. Try a lower-resolution PDF.',
    );
  }
  return scale;
}

function assertPdfFileWithinLimits(file: File): void {
  if (file.size > PDF_IMPORT_MAX_FILE_BYTES) {
    const limitMb = Math.round(PDF_IMPORT_MAX_FILE_BYTES / (1024 * 1024));
    throw new PdfImportError(
      'file-too-large',
      `This PDF is too large to import safely (${limitMb} MB limit). Try a smaller or compressed PDF.`,
    );
  }
}

function assertPdfImageWithinLimits(imageData: string, pageNumber: number): void {
  if (imageData.length > PDF_IMPORT_MAX_IMAGE_DATA_CHARS) {
    const limitMb = Math.round(PDF_IMPORT_MAX_IMAGE_DATA_CHARS / (1024 * 1024));
    throw new PdfImportError(
      'image-too-large',
      `Page ${pageNumber} rasterized above the ${limitMb} MB image limit. Try a lower-resolution PDF.`,
    );
  }
}

function assertPdfProjectWithinLimits(serialized: string): void {
  const bytes = new TextEncoder().encode(serialized).byteLength;
  if (bytes > PDF_IMPORT_MAX_PROJECT_BYTES) {
    const limitMb = Math.round(PDF_IMPORT_MAX_PROJECT_BYTES / (1024 * 1024));
    throw new PdfImportError(
      'project-too-large',
      `The imported PDF would create a ${limitMb} MB-plus project. Try fewer pages or a lower-resolution PDF.`,
    );
  }
}

/** Decodes a supported file and persists it as one new cloud project. */
export async function importProjectFile(
  file: File,
  token: string | null,
): Promise<ProjectImportResult> {
  if (file.name.toLowerCase().endsWith(DRAW_FORMAT_EXTENSION)) {
    const data = await decodeDrawFormat(await file.arrayBuffer());
    const title = file.name.slice(0, -DRAW_FORMAT_EXTENSION.length) || 'Imported Project';
    await createProject(title, data, token);
    return { format: 'dra' };
  }

  if (!file.name.toLowerCase().endsWith('.pdf')) {
    throw new Error('Unsupported project file type');
  }

  assertPdfFileWithinLimits(file);

  const [{ getDocument, GlobalWorkerOptions }, workerModule, buffer] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    file.arrayBuffer(),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;

  const loadingTask = getDocument({ data: buffer });
  let pdf: PDFDocumentProxy;
  try {
    pdf = await loadingTask.promise;
  } catch (error) {
    await loadingTask.destroy();
    throw new PdfImportError(
      'invalid-document',
      'The PDF could not be opened. Check that the file is valid and try again.',
      { cause: error },
    );
  }

  if (!Number.isInteger(pdf.numPages) || pdf.numPages <= 0) {
    await loadingTask.destroy();
    throw new PdfImportError('invalid-document', 'The PDF does not contain any readable pages.');
  }
  if (pdf.numPages > PDF_IMPORT_MAX_PAGES) {
    await loadingTask.destroy();
    throw new PdfImportError(
      'too-many-pages',
      `This PDF has ${pdf.numPages} pages; imports are limited to ${PDF_IMPORT_MAX_PAGES} pages. Split the PDF and try again.`,
    );
  }

  const canvasSize = 4096;
  let yOffset = 100;
  let totalRenderPixels = 0;
  const objects = [];

  try {
    // Render one page at a time. The page canvas is released immediately after
    // encoding, while the resulting data URL is retained as the image object.
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      let page: PDFPageProxy | undefined;
      let canvas: HTMLCanvasElement | undefined;
      try {
        page = await pdf.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const rasterScale = getPdfImportRasterScale(baseViewport.width, baseViewport.height);
        const viewport = page.getViewport({ scale: rasterScale });
        const renderWidth = Math.ceil(viewport.width);
        const renderHeight = Math.ceil(viewport.height);
        const renderPixels = renderWidth * renderHeight;
        totalRenderPixels += renderPixels;
        if (totalRenderPixels > PDF_IMPORT_MAX_TOTAL_RENDER_PIXELS) {
          const limitMp = Math.round(PDF_IMPORT_MAX_TOTAL_RENDER_PIXELS / 1_000_000);
          throw new PdfImportError(
            'too-many-pixels',
            `This PDF is too large to import safely (${limitMp} megapixel render budget). Try fewer pages or a lower-resolution PDF.`,
          );
        }

        canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        if (!context) {
          throw new PdfImportError(
            'canvas-unavailable',
            'PDF import needs a browser canvas. Try the latest desktop browser.',
          );
        }
        canvas.width = renderWidth;
        canvas.height = renderHeight;
        await page.render({ canvasContext: context, viewport, canvas }).promise;

        // Keep page proportions and mixed portrait/landscape dimensions. Only
        // very wide pages are reduced to fit the current canvas width.
        const maxWidth = canvasSize - 200;
        const layoutScale = Math.min(1, maxWidth / viewport.width);
        const width = viewport.width * layoutScale;
        const height = viewport.height * layoutScale;
        const imageData = canvas.toDataURL('image/png');
        assertPdfImageWithinLimits(imageData, pageNumber);
        objects.push({
          id: generateId(),
          type: 'image' as const,
          x: (canvasSize - width) / 2,
          y: yOffset,
          width,
          height,
          color: '#000000',
          size: 1,
          alpha: 1,
          imageData,
        });
        yOffset += height + 50;
      } catch (error) {
        if (error instanceof PdfImportError) throw error;
        throw new PdfImportError(
          'page-render-failed',
          `Could not render page ${pageNumber} of the PDF. Try a smaller or lower-resolution file.`,
          { cause: error },
        );
      } finally {
        page?.cleanup();
        // Clearing the backing store releases the largest temporary allocation
        // before the next page is decoded.
        if (canvas) {
          canvas.width = 0;
          canvas.height = 0;
        }
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  if (objects.length === 0) throw new Error('No pages found in PDF');
  const title = file.name.replace(/\.pdf$/i, '') || 'Imported PDF';
  // Persist the full stacked document height so reopening or exporting the
  // project does not clip pages below the old 4096px default.
  const projectData = serializeProject(objects, canvasSize, yOffset);
  assertPdfProjectWithinLimits(projectData);
  await createProject(title, projectData, token);
  return { format: 'pdf', pageCount: pdf.numPages };
}
