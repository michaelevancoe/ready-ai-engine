import { isChurchPhotoFile } from '../../lib/church-photo-file';

const maxSide = 1152;

export async function readChurchPhoto(file: File): Promise<string> {
  if (!isChurchPhotoFile(file)) throw new Error('Use a JPEG, PNG, or WebP photo.');
  const bitmap = await createImageBitmap(file);
  const longest = Math.max(bitmap.width, bitmap.height);
  const scale = longest > maxSide ? maxSide / longest : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
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

function canvasBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((value) => {
      if (value === null) reject(new Error('Could not read that photo.'));
      else resolve(value);
    }, type, 0.85);
  });
}
