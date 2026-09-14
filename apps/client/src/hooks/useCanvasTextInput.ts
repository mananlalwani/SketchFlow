import { useCallback, useRef, useState } from 'react';
import { generateId } from '@/lib/utils';
import { createTextObject } from '@/lib/canvasShapeCommit';
import { drawingObjectsToRendererScene } from '@/lib/canvasRendererObject';
import type { CanvasPresentation } from '@/lib/canvasPresentation';

interface UseCanvasTextInputOptions {
  textFontSize: number;
  brushColor: string;
  brushSize: number;
  brushOpacity: number;
  addObject: (object: ReturnType<typeof createTextObject>) => void;
  saveHistory: () => void;
  presentation: CanvasPresentation;
}

export function useCanvasTextInput({
  textFontSize,
  brushColor,
  brushSize,
  brushOpacity,
  addObject,
  saveHistory,
  presentation,
}: UseCanvasTextInputOptions) {
  const [textInputPos, setTextInputPos] = useState<{
    x: number;
    y: number;
    worldX: number;
    worldY: number;
  } | null>(null);
  const [textInputValue, setTextInputValue] = useState('');
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  const clearTextInput = useCallback(() => {
    setTextInputPos(null);
    setTextInputValue('');
  }, []);

  const openTextInput = useCallback((clientX: number, clientY: number, worldX: number, worldY: number) => {
    setTextInputPos({
      x: Math.max(12, Math.min(clientX, window.innerWidth - 532)),
      y: Math.max(12, Math.min(clientY, window.innerHeight - 224)),
      worldX,
      worldY,
    });
    setTextInputValue('');
    setTimeout(() => textInputRef.current?.focus(), 0);
  }, []);

  const submitTextInput = useCallback(() => {
    if (!textInputPos || !textInputValue.trim()) return;
    const textObject = createTextObject({
      id: generateId(),
      x: textInputPos.worldX,
      y: textInputPos.worldY,
      text: textInputValue.trim(),
      fontSize: textFontSize,
      color: brushColor,
      size: brushSize,
      alpha: brushOpacity,
    });
    saveHistory();
    addObject(textObject);
    const [drawing] = drawingObjectsToRendererScene([textObject]).drawings;
    if (drawing) presentation.send({ type: 'shape', data: drawing });
    clearTextInput();
  }, [
    addObject,
    brushColor,
    brushOpacity,
    brushSize,
    clearTextInput,
    presentation,
    saveHistory,
    textFontSize,
    textInputPos,
    textInputValue,
  ]);

  return {
    textInputPos,
    textInputValue,
    textInputRef,
    setTextInputValue,
    clearTextInput,
    openTextInput,
    submitTextInput,
  };
}
