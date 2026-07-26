import { useCallback, useEffect, type ChangeEvent, type RefObject } from 'react';
import { getImageFromClipboard, compressImage } from '@/lib/clipboard';
import { createCanvasImage } from '@/lib/canvasImage';
import { generateId } from '@/lib/utils';
import { useDrawingStore, type DrawingObject } from '@/store/drawingStore';

interface CanvasImageInputOptions {
  canvasRef: RefObject<HTMLCanvasElement>;
  viewX: number;
  viewY: number;
  zoom: number;
  textInputActive: boolean;
  addObject: (object: DrawingObject) => void;
  saveHistory: () => void;
}

interface CanvasImageData {
  dataUrl: string;
  width: number;
  height: number;
}

const MAX_IMAGE_SIZE = 1920;

/** Handles paste/upload image normalization and inserts images at the visible canvas center. */
export function useCanvasImageInput({
  canvasRef,
  viewX,
  viewY,
  zoom,
  textInputActive,
  addObject,
  saveHistory,
}: CanvasImageInputOptions) {
  const insertImage = useCallback(
    (image: CanvasImageData) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const imageObject = createCanvasImage({
        id: generateId(),
        centerX: viewX + rect.width / 2 / zoom,
        centerY: viewY + rect.height / 2 / zoom,
        width: image.width,
        height: image.height,
        dataUrl: image.dataUrl,
      });
      saveHistory();
      addObject(imageObject);
    },
    [addObject, canvasRef, saveHistory, viewX, viewY, zoom],
  );

  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      if (textInputActive) return;
      const image = await getImageFromClipboard(event);
      if (!image) return;
      event.preventDefault();
      const finalImage =
        image.width > MAX_IMAGE_SIZE || image.height > MAX_IMAGE_SIZE
          ? await compressImage(image.dataUrl, MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, 0.85)
          : image;
      insertImage(finalImage);
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [insertImage, textInputActive]);

  return useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        console.warn('Invalid file type');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        const image = new Image();
        image.onload = async () => {
          const finalImage =
            image.width > MAX_IMAGE_SIZE || image.height > MAX_IMAGE_SIZE
              ? await compressImage(dataUrl, MAX_IMAGE_SIZE, MAX_IMAGE_SIZE, 0.85)
              : { dataUrl, width: image.width, height: image.height };
          insertImage(finalImage);
          useDrawingStore.getState().setTool('select');
        };
        image.src = dataUrl;
      };
      reader.readAsDataURL(file);
      event.target.value = '';
    },
    [insertImage],
  );
}
