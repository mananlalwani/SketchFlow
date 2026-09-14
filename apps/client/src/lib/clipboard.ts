export interface PastedImage {
  dataUrl: string;
  width: number;
  height: number;
}

export async function getImageFromClipboard(event: ClipboardEvent): Promise<PastedImage | null> {
  const items = event.clipboardData?.items;
  if (!items) return null;

  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (!blob) continue;
      return blobToImage(blob);
    }
  }

  return null;
}

async function blobToImage(blob: Blob): Promise<PastedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (!reader.result || reader.result instanceof ArrayBuffer) {
        reject(new Error('Unable to read image data'));
        return;
      }
      const dataUrl = reader.result;
      const img = new Image();
      img.onload = () => {
        resolve({ dataUrl, width: img.width, height: img.height });
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = dataUrl;
    };

    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.readAsDataURL(blob);
  });
}

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
      const scale = Math.min(1, maxWidth / width, maxHeight / height);
      if (scale < 1) {
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);

      const format = dataUrl.includes('image/png') ? 'image/png' : 'image/jpeg';
      resolve({
        dataUrl: canvas.toDataURL(format, quality),
        width,
        height,
      });
    };

    img.onerror = () => reject(new Error('Failed to compress image'));
    img.src = dataUrl;
  });
}
