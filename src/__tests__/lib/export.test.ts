import { describe, it, expect, vi, beforeEach } from 'vitest';
import { exportAsSVG } from '@/lib/export';
import type { DrawingObject } from '@/store/drawingStore';

// Note: exportAsPNG requires canvas which isn't available in jsdom
// We test it indirectly through the SVG export which shares rendering logic

describe('export', () => {
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
          points: [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }],
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
        { id: '1', type: 'rectangle', x: 0, y: 0, width: 50, height: 50, color: '#f00', size: 1, filled: true },
        { id: '2', type: 'ellipse', x: 60, y: 0, width: 50, height: 50, color: '#0f0', size: 1, filled: true },
        { id: '3', type: 'line', x: 0, y: 60, width: 100, height: 0, color: '#00f', size: 2 },
      ];
      
      const svg = exportAsSVG(objects);
      
      expect(svg).toContain('<rect');
      expect(svg).toContain('<ellipse');
      expect(svg).toContain('<line');
    });
  });
});
