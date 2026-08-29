import { createProject } from './api';
import { decodeDrawFormat, DRAW_FORMAT_EXTENSION } from './drawFormat';
import { generateId, serializeProject } from './utils';

export interface ProjectImportResult {
  format: 'dra' | 'pdf';
  pageCount?: number;
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

  const [{ getDocument, GlobalWorkerOptions }, workerModule, buffer] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
    file.arrayBuffer(),
  ]);
  GlobalWorkerOptions.workerSrc = workerModule.default;
  const pdf = await getDocument({ data: buffer }).promise;
  const canvasSize = 4096;
  let yOffset = 100;
  const objects = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    await page.render({ canvasContext: context, viewport, canvas }).promise;

    const maxWidth = canvasSize - 200;
    const scale = Math.min(1, maxWidth / viewport.width);
    const width = viewport.width * scale;
    const height = viewport.height * scale;
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
      imageData: canvas.toDataURL('image/png'),
    });
    yOffset += height + 50;
  }

  if (objects.length === 0) throw new Error('No pages found in PDF');
  const title = file.name.replace(/\.pdf$/i, '') || 'Imported PDF';
  await createProject(title, serializeProject(objects, canvasSize, canvasSize), token);
  return { format: 'pdf', pageCount: pdf.numPages };
}
