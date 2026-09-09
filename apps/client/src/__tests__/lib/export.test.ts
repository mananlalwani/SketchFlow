import { describe, expect, it, vi } from 'vitest';
import {
  exportAsPDF,
  exportAsSVG,
  getPdfExportSegmentCount,
  renderObjectToPDF,
  renderObjectsToContext,
} from '@/lib/export';
import type { DrawingObject } from '@/store/drawingStore';

// The PNG entry point requires a browser canvas; the shared canvas renderer is
// tested directly below so this suite remains jsdom-compatible.

describe('export', () => {
  describe('PDF stroke rendering', () => {
    it('renders a pressure-width dot as an alpha-aware filled circle', () => {
      const ellipse = vi.fn();
      const setLineWidth = vi.fn();
      const GState = vi.fn((state: unknown) => state);
      const pdf = {
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setLineWidth,
        setLineCap: vi.fn(),
        setLineJoin: vi.fn(),
        GState,
        setGState: vi.fn(),
        ellipse,
      } as unknown as Parameters<typeof renderObjectToPDF>[0];

      renderObjectToPDF(
        pdf,
        {
          id: 'pdf-dot',
          type: 'stroke',
          points: [{ x: 10, y: 20, width: 8, pressure: 0.75 }],
          color: '#123456',
          size: 4,
          alpha: 0.4,
        },
        5,
        7,
        2,
      );

      expect(setLineWidth).toHaveBeenLastCalledWith(16);
      expect(GState).toHaveBeenCalledWith({ opacity: 0.4, 'stroke-opacity': 0.4 });
      expect(ellipse).toHaveBeenCalledWith(25, 47, 8, 8, 'F');

      renderObjectToPDF(
        pdf,
        {
          id: 'legacy-pressure-dot',
          type: 'stroke',
          points: [{ x: 1, y: 2, pressure: 0.5 }],
          color: '#123456',
          size: 8,
          alpha: 1,
        },
        0,
        0,
        1,
      );
      expect(setLineWidth).toHaveBeenLastCalledWith(5);
      expect(ellipse).toHaveBeenLastCalledWith(1, 2, 2.5, 2.5, 'F');
    });

    it('emits image pages in object order so annotations can layer above them', () => {
      const order: string[] = [];
      const pdf = {
        setDrawColor: vi.fn(),
        setFillColor: vi.fn(),
        setLineWidth: vi.fn(),
        setLineCap: vi.fn(),
        setLineJoin: vi.fn(),
        addImage: vi.fn(() => order.push('image')),
        line: vi.fn(() => order.push('annotation')),
      } as unknown as Parameters<typeof renderObjectToPDF>[0];

      renderObjectToPDF(
        pdf,
        {
          id: 'page',
          type: 'image',
          x: 10,
          y: 20,
          width: 300,
          height: 200,
          imageData: 'data:image/png;base64,cGFnZQ==',
          color: '#000000',
          size: 1,
        },
        5,
        7,
        2,
      );
      renderObjectToPDF(
        pdf,
        {
          id: 'ink',
          type: 'line',
          x: 10,
          y: 20,
          width: 40,
          height: 0,
          color: '#ff0000',
          size: 2,
        },
        5,
        7,
        2,
      );

      expect(order).toEqual(['image', 'annotation']);
      expect(pdf.addImage).toHaveBeenCalledWith(
        'data:image/png;base64,cGFnZQ==',
        'PNG',
        25,
        47,
        600,
        400,
        undefined,
        'FAST',
        0,
      );
    });

    it('produces a valid PDF when a project contains an imported page image', async () => {
      // 1x1 transparent PNG; jsPDF decodes this through its normal image path.
      const imageData =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
      const blob = await exportAsPDF(
        [
          {
            id: 'page',
            type: 'image',
            x: 0,
            y: 0,
            width: 80,
            height: 80,
            imageData,
            color: '#000000',
            size: 1,
          },
          {
            id: 'annotation',
            type: 'line',
            x: 10,
            y: 10,
            width: 50,
            height: 0,
            color: '#ff0000',
            size: 2,
          },
        ],
        { width: 100, height: 100, pageSize: 'custom', orientation: 'portrait' },
      );

      expect(blob.type).toBe('application/pdf');
      expect(blob.size).toBeGreaterThan(0);
    });

    it.each([10, 50, 150])(
      'exports every page and the trailing annotation for a %i-page document',
      async (pageCount) => {
        const imageData =
          'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
        const objects: DrawingObject[] = Array.from({ length: pageCount }, (_, index) => ({
          id: `page-${index}`,
          type: 'image' as const,
          x: 100,
          y: index * 100,
          width: 3000,
          height: 80,
          imageData,
          color: '#000000',
          size: 1,
        }));
        objects.push({
          id: 'last-annotation',
          type: 'line',
          x: 100,
          y: pageCount * 100 + 10,
          width: 3000,
          height: 0,
          color: '#ff0000',
          size: 2,
        });

        const blob = await exportAsPDF(objects, {
          width: 4096,
          height: pageCount * 100 + 100,
        });

        expect(blob.type).toBe('application/pdf');
        expect(blob.size).toBeGreaterThan(0);
        expect(getPdfExportSegmentCount(4096, pageCount * 100 + 100, 842, 595, 20)).toBeGreaterThan(
          pageCount > 10 ? 1 : 0,
        );
      },
    );
  });

  describe('exportAsSVG', () => {
    it('should export empty canvas with background', () => {
      const svg = exportAsSVG([], { width: 100, height: 100, background: '#000' });

      expect(svg).toContain('<?xml version="1.0"');
      expect(svg).toContain('width="100"');
      expect(svg).toContain('height="100"');
      expect(svg).toContain('fill="#000"');
    });

    it('should export stroke objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'stroke',
          points: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 20, y: 0 },
          ],
          color: '#ff0000',
          size: 2,
          alpha: 1,
        },
      ];

      const svg = exportAsSVG(objects, { width: 100, height: 100 });

      expect(svg).toContain('<path');
      expect(svg).toContain('M0,0');
      expect(svg).toContain('L10,10');
      expect(svg).toContain('L20,0');
      expect(svg).toContain('stroke="#ff0000"');
      expect(svg).toContain('stroke-width="2"');
    });

    it('preserves per-point widths and dots in SVG stroke output', () => {
      const svg = exportAsSVG([
        {
          id: 'pressure-stroke',
          type: 'stroke',
          points: [
            { x: 0, y: 0, width: 2 },
            { x: 10, y: 10, width: 8 },
            { x: 20, y: 0, width: 3 },
          ],
          color: '#ff0000',
          size: 4,
          alpha: 0.5,
        },
        {
          id: 'dot',
          type: 'stroke',
          points: [{ x: 30, y: 30, width: 10 }],
          color: '#00ff00',
          size: 2,
          alpha: 0.75,
        },
      ]);

      expect(svg).toContain('stroke-width="8"');
      expect(svg).toContain('stroke-width="3"');
      expect(svg).toContain('opacity="0.5"');
      expect(svg).toContain('<circle cx="30" cy="30" r="5" fill="#00ff00" opacity="0.75"/>');
    });

    it('uses per-point widths for PNG canvas rendering', () => {
      const widths: number[] = [];
      const context = {
        save: () => undefined,
        restore: () => undefined,
        beginPath: () => undefined,
        moveTo: () => undefined,
        lineTo: () => undefined,
        stroke: () => undefined,
        arc: () => undefined,
        fill: () => undefined,
        lineCap: 'round' as CanvasLineCap,
        lineJoin: 'round' as CanvasLineJoin,
        globalAlpha: 1,
        strokeStyle: '#000',
        fillStyle: '#000',
        lineWidth: 1,
        translate: () => undefined,
        rotate: () => undefined,
      } as unknown as CanvasRenderingContext2D;
      Object.defineProperty(context, 'lineWidth', {
        get: () => widths[widths.length - 1] ?? 1,
        set: (value: number) => widths.push(value),
      });

      renderObjectsToContext(context, [
        {
          id: 'pressure-stroke',
          type: 'stroke',
          points: [
            { x: 0, y: 0, width: 2 },
            { x: 10, y: 10, width: 8 },
            { x: 20, y: 0, width: 3 },
          ],
          color: '#ff0000',
          size: 4,
        },
      ]);

      expect(widths).toEqual([4, 8, 3]);
    });

    it('should export line objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'line',
          x: 10,
          y: 20,
          width: 50,
          height: 30,
          color: '#00ff00',
          size: 3,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<line');
      expect(svg).toContain('x1="10"');
      expect(svg).toContain('y1="20"');
      expect(svg).toContain('x2="60"');
      expect(svg).toContain('y2="50"');
    });

    it('should export filled rectangle', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          color: '#0000ff',
          size: 2,
          filled: true,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<rect');
      expect(svg).toContain('fill="#0000ff"');
      expect(svg).not.toContain('fill="none"');
    });

    it('should export outlined rectangle', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          color: '#0000ff',
          size: 2,
          filled: false,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<rect');
      expect(svg).toContain('fill="none"');
      expect(svg).toContain('stroke="#0000ff"');
    });

    it('should export ellipse objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'ellipse',
          x: 0,
          y: 0,
          width: 100,
          height: 60,
          color: '#ff00ff',
          size: 2,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<ellipse');
      expect(svg).toContain('cx="50"');
      expect(svg).toContain('cy="30"');
      expect(svg).toContain('rx="50"');
      expect(svg).toContain('ry="30"');
    });

    it('should export triangle objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'triangle',
          x: 0,
          y: 0,
          width: 100,
          height: 80,
          color: '#ffff00',
          size: 2,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<polygon');
      expect(svg).toContain('points="50,0 100,80 0,80"');
    });

    it('preserves free-form triangle vertices', () => {
      const svg = exportAsSVG([
        {
          id: 'custom-triangle',
          type: 'triangle',
          x: 10,
          y: 20,
          width: 90,
          height: 80,
          points: [
            { x: 10, y: 20 },
            { x: 100, y: 40 },
            { x: 35, y: 100 },
          ],
          color: '#123456',
          size: 3,
          alpha: 1,
        },
      ]);

      expect(svg).toContain('points="10,20 100,40 35,100"');
      expect(svg).not.toContain('points="55,20 100,100 10,100"');
    });

    it('should export text objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'text',
          x: 10,
          y: 20,
          text: 'Hello World',
          fontSize: 32,
          color: '#ffffff',
          size: 1,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<text');
      expect(svg).toContain('Hello World');
      expect(svg).toContain('font-size="32"');
    });

    it('should export multi-line text', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'text',
          x: 10,
          y: 20,
          text: 'Line 1\nLine 2\nLine 3',
          fontSize: 16,
          color: '#ffffff',
          size: 1,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<tspan');
      expect(svg).toContain('Line 1');
      expect(svg).toContain('Line 2');
      expect(svg).toContain('Line 3');
    });

    it('should escape special characters in text', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'text',
          x: 0,
          y: 0,
          text: '<script>alert("xss")</script>',
          fontSize: 16,
          color: '#fff',
          size: 1,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).not.toContain('<script>');
      expect(svg).toContain('&lt;script&gt;');
    });

    it('should handle opacity', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          color: '#fff',
          size: 1,
          alpha: 0.5,
          filled: true,
        },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('opacity="0.5"');
    });

    it('should handle multiple objects', () => {
      const objects: DrawingObject[] = [
        {
          id: '1',
          type: 'rectangle',
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          color: '#f00',
          size: 1,
          filled: true,
        },
        {
          id: '2',
          type: 'ellipse',
          x: 60,
          y: 0,
          width: 50,
          height: 50,
          color: '#0f0',
          size: 1,
          filled: true,
        },
        { id: '3', type: 'line', x: 0, y: 60, width: 100, height: 0, color: '#00f', size: 2 },
      ];

      const svg = exportAsSVG(objects);

      expect(svg).toContain('<rect');
      expect(svg).toContain('<ellipse');
      expect(svg).toContain('<line');
    });
  });
});
