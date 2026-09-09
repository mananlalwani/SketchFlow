import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/lib/api';
import { decodeDrawFormat } from '@/lib/drawFormat';
import {
  getPdfImportRasterScale,
  importProjectFile,
  PDF_IMPORT_MAX_PAGES,
} from '@/lib/projectImport';

import { getDocument } from 'pdfjs-dist';

vi.mock('@/lib/api', () => ({ createProject: vi.fn() }));
vi.mock('@/lib/drawFormat', () => ({
  DRAW_FORMAT_EXTENSION: '.dra',
  decodeDrawFormat: vi.fn(),
}));
vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: undefined },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: 'worker.js' }));

describe('importProjectFile', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockPdf(
    pages: Array<{ width: number; height: number }>,
    options: { render?: (pageNumber: number) => Promise<void> } = {},
  ) {
    const cleanup = vi.fn();
    const pageObjects = pages.map((dimensions, index) => ({
      getViewport: vi.fn(({ scale }: { scale: number }) => ({
        width: dimensions.width * scale,
        height: dimensions.height * scale,
      })),
      render: vi.fn(() => ({
        promise: options.render?.(index + 1) ?? Promise.resolve(),
      })),
      cleanup,
    }));
    const pdf = {
      numPages: pages.length,
      getPage: vi.fn(async (pageNumber: number) => pageObjects[pageNumber - 1]),
    };
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(getDocument).mockReturnValue({ promise: Promise.resolve(pdf), destroy } as never);

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => ({})),
      toDataURL: vi.fn(() => 'data:image/png;base64,cGFnZQ=='),
    } as unknown as HTMLCanvasElement;
    const createElement = vi.spyOn(document, 'createElement').mockImplementation((tagName) => {
      if (tagName === 'canvas') return canvas;
      return document.createElementNS('http://www.w3.org/1999/xhtml', tagName);
    });
    return { canvas, cleanup, createElement, destroy, pageObjects, pdf };
  }

  it('decodes and persists a draw archive with its filename as the title', async () => {
    const data = { objects: [] };
    vi.mocked(decodeDrawFormat).mockResolvedValue(data);
    vi.mocked(createProject).mockResolvedValue({
      id: 'project-1',
      userId: 'user-1',
      title: 'Ideas',
      data,
      createdAt: 1,
      updatedAt: 1,
      revision: 1,
    });
    const file = new File(['encoded'], 'Ideas.dra');
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(7)),
    });

    await expect(importProjectFile(file, 'token')).resolves.toEqual({ format: 'dra' });
    expect(decodeDrawFormat).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(createProject).toHaveBeenCalledWith('Ideas', data, 'token');
  });

  it('rejects unsupported file types before creating a project', async () => {
    await expect(importProjectFile(new File(['x'], 'notes.txt'), 'token')).rejects.toThrow(
      'Unsupported project file type',
    );
    expect(createProject).not.toHaveBeenCalled();
  });

  it('uses sequential, bounded rasterization for mixed page orientations', async () => {
    const fixture = mockPdf([
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
    ]);
    vi.mocked(createProject).mockResolvedValue({} as never);

    const file = new File(['pdf'], 'slides.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });

    await expect(importProjectFile(file, 'token')).resolves.toEqual({
      format: 'pdf',
      pageCount: 2,
    });
    expect(fixture.pdf.getPage).toHaveBeenCalledTimes(2);
    expect(fixture.pageObjects[0].render).toHaveBeenCalledTimes(1);
    expect(fixture.pageObjects[1].render).toHaveBeenCalledTimes(1);
    expect(fixture.pageObjects[0].getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(fixture.pageObjects[1].getViewport).toHaveBeenCalledWith({ scale: 1 });
    expect(fixture.cleanup).toHaveBeenCalledTimes(2);
    expect(fixture.destroy).toHaveBeenCalledTimes(1);

    const serialized = String(vi.mocked(createProject).mock.calls[0]?.[1]);
    const project = JSON.parse(serialized) as { objects: Array<{ width: number; height: number }> };
    expect(project.objects).toHaveLength(2);
    expect(project.objects[0].width).toBeGreaterThan(project.objects[0].height);
    expect(project.objects[1].height).toBeGreaterThan(project.objects[1].width);

    fixture.createElement.mockRestore();
  });

  it.each([10, 50, 150])(
    'imports a %i-page small synthetic document without concurrent page work',
    async (pageCount) => {
      const fixture = mockPdf(
        Array.from({ length: pageCount }, () => ({ width: 400, height: 300 })),
      );
      vi.mocked(createProject).mockResolvedValue({} as never);
      const file = new File(['pdf'], 'many-pages.pdf', { type: 'application/pdf' });
      Object.defineProperty(file, 'arrayBuffer', {
        value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
      });

      await expect(importProjectFile(file, 'token')).resolves.toEqual({
        format: 'pdf',
        pageCount,
      });
      expect(fixture.pdf.getPage).toHaveBeenCalledTimes(pageCount);
      expect(fixture.destroy).toHaveBeenCalledTimes(1);
      const latestPayload = vi.mocked(createProject).mock.lastCall?.[1];
      const project = JSON.parse(String(latestPayload)) as {
        height: number;
        objects: Array<{ id: string; y: number }>;
      };
      expect(project.height).toBeGreaterThan(4096);
      expect(project.objects).toHaveLength(pageCount);
      expect(project.objects.at(-1)?.id).toBeTruthy();
      expect(project.objects.at(-1)?.y).toBeGreaterThan(project.objects[0].y);
      fixture.createElement.mockRestore();
    },
  );

  it('rejects a document over the page budget with a recoverable message', async () => {
    const fixture = mockPdf(
      Array.from({ length: PDF_IMPORT_MAX_PAGES + 1 }, () => ({ width: 10, height: 10 })),
    );
    const file = new File(['pdf'], 'too-many-pages.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });

    await expect(importProjectFile(file, 'token')).rejects.toThrow(
      `imports are limited to ${PDF_IMPORT_MAX_PAGES} pages`,
    );
    expect(fixture.pdf.getPage).not.toHaveBeenCalled();
    fixture.createElement.mockRestore();
  });

  it('calculates a lower raster scale for oversized slide dimensions', () => {
    const scale = getPdfImportRasterScale(20_000, 10_000);
    expect(scale).toBeLessThan(1);
    expect(scale * 20_000).toBeLessThanOrEqual(4096);
  });

  it('reports a cumulative raster budget failure before retaining an oversized project', async () => {
    const pageSize = 20_000;
    const fixture = mockPdf([
      ...Array.from({ length: 32 }, () => ({ width: pageSize, height: pageSize })),
    ]);
    const file = new File(['pdf'], 'too-many-pixels.pdf', { type: 'application/pdf' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn().mockResolvedValue(new ArrayBuffer(4)),
    });

    await expect(importProjectFile(file, 'token')).rejects.toThrow('megapixel render budget');
    expect(createProject).not.toHaveBeenCalled();
    expect(fixture.destroy).toHaveBeenCalledTimes(1);
    fixture.createElement.mockRestore();
  });
});
