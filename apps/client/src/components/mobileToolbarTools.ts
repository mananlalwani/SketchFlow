import {
  Circle,
  Eraser,
  Hand,
  Highlighter,
  ImageIcon,
  Minus,
  Move,
  MousePointer2,
  Pen,
  Square,
  Star,
  Triangle,
  Type,
} from 'lucide-react';
import type { Tool } from '@/store/drawingStore';

export const tools = [
  { id: 'hand', icon: Hand, label: 'Pan' },
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'move', icon: Move, label: 'Move' },
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'line', icon: Minus, label: 'Line' },
  { id: 'rectangle', icon: Square, label: 'Rectangle' },
  { id: 'ellipse', icon: Circle, label: 'Ellipse' },
  { id: 'triangle', icon: Triangle, label: 'Triangle' },
  { id: 'star', icon: Star, label: 'Star' },
  { id: 'text', icon: Type, label: 'Text' },
  { id: 'image', icon: ImageIcon, label: 'Image' },
] as const satisfies readonly { id: Tool; icon: typeof Hand; label: string }[];

export const quickTools = [
  { id: 'pen', icon: Pen, label: 'Pen' },
  { id: 'highlighter', icon: Highlighter, label: 'Highlighter' },
  { id: 'eraser', icon: Eraser, label: 'Eraser' },
  { id: 'select', icon: MousePointer2, label: 'Select' },
  { id: 'hand', icon: Hand, label: 'Pan' },
] as const satisfies readonly { id: Tool; icon: typeof Hand; label: string }[];

/** The tablet overflow keeps the complete desktop tool set reachable. */
export const tabletFullToolIds = tools.map(({ id }) => id);
