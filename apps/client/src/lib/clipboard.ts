/**
 * Clipboard utilities for image paste support
 */

export interface PastedImage {
  dataUrl: string;
  width: number;
  height: number;
}

/**
 * Extract image from clipboard event
 */
export async function getImageFromClipboard(event: ClipboardEvent): Promise<PastedImage | null> {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (!blob) continue;

      return await blobToImage(blob);
    }
  }

  return null;
}

/**
 * Convert blob to image with dimensions
 */
export async function blobToImage(blob: Blob): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (!reader.result || reader.result instanceof ArrayBuffer) {
        reject(new Error('Unable to read image data'));
        return;
      }
      const dataUrl = reader.result;

      // Get dimensions
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.width,
          height: img.height,
        });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    };

    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compress image if it exceeds max size
 */
export async function compressImage(
  dataUrl: string,
  maxWidth: number = 1920,
  maxHeight: number = 1080,
  quality: number = 0.8,
): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      let { width, height } = img;

      // Calculate scale to fit within max dimensions
      const scaleW = maxWidth / width;
      const scaleH = maxHeight / height;
      const scale = Math.min(1, Math.min(scaleW, scaleH));

      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      // Create canvas and draw scaled image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      // Export as JPEG for smaller size (or PNG if original was PNG)
      const isTransparent = dataUrl.includes('image/png');
      const format = isTransparent ? 'image/png' : 'image/jpeg';
      const compressed = canvas.toDataURL(format, quality);

      resolve({
        dataUrl: compressed,
        width,
        height,
      });
    };

    img.onerror = () => reject(new Error('Failed to compress image'));
    img.src = dataUrl;
  });
}

/**
 * Copy canvas region to clipboard
 */
export async function copyToClipboard(canvas: HTMLCanvasElement): Promise<boolean> {
  try {
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, 'image/png');
    });

    if (!blob) return false;

    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);

    return true;
  } catch (error) {
    console.error('Failed to copy to clipboard:', error);
    return false;
  }
}
