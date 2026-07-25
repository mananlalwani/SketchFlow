import { useEffect } from 'react';
import type { Tool } from '@/store/drawingStore';

interface CanvasToolResetOptions {
  currentTool: Tool;
  clearConstraintMode: () => void;
  clearTriangleVertices: () => void;
  clearTextInput: () => void;
}

/** Clears transient input state whenever the active tool no longer supports it. */
export function useCanvasToolReset({
  currentTool,
  clearConstraintMode,
  clearTriangleVertices,
  clearTextInput,
}: CanvasToolResetOptions) {
  useEffect(() => {
    if (!['rectangle', 'ellipse'].includes(currentTool)) clearConstraintMode();
    if (currentTool !== 'triangle') clearTriangleVertices();
    if (currentTool !== 'text') clearTextInput();
  }, [clearConstraintMode, clearTextInput, clearTriangleVertices, currentTool]);
}
