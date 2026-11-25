const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxSide = 1152;

interface PhotoBitmap {
  readonly width: number;
  readonly height: number;
  close(): void;
}

interface PhotoContext {
  drawImage(image: PhotoBitmap, dx: number, dy: number, dw: number, dh: number): void;
}

interface PhotoCanvas {
  width: number;
  height: number;
  getContext(kind: '2d'): PhotoContext | null;
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void;
}

interface PhotoDocument {
  createElement(tag: 'canvas'): PhotoCanvas;
}

export function isChurchPhotoFile(file: { readonly type: string }): boolean {
  return photoTypes.has(file.type);
}

export async function readChurchPhoto(file: File): Promise<string> {
  if (!isChurchPhotoFile(file)) throw new Error('Use a JPEG, PNG, or WebP photo.');
  const create = (globalThis as { createImageBitmap?: (blob: Blob) => Promise<PhotoBitmap> }).createImageBitmap;
  const doc = (globalThis as { document?: PhotoDocument }).document;
  if (create === undefined || doc === undefined) throw new Error('Photos can be read only in the browser.');
  const bitmap = await create(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = doc.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    bitmap.close();
    throw new Error('Could not read that photo.');
  }
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const type = file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const blob = await canvasBlob(canvas, type);
  return URL.createObjectURL(blob);
}

function canvasBlob(canvas: PhotoCanvas, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value === null) reject(new Error('Could not read that photo.'));
      else resolve(value);
    }, type, 0.85);
  });
}
