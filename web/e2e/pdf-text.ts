import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

export async function readPdf(bytes: Buffer): Promise<{ pages: number; text: string }> {
  const task = getDocument({ data: new Uint8Array(bytes), verbosity: 0 });
  const doc = await task.promise;
  const parts: string[] = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    parts.push(content.items.map((item) => textOf(item)).join(''));
  }
  return { pages: doc.numPages, text: parts.join('\n') };
}

export function compact(value: string): string {
  return value.replace(/\s+/gu, '');
}

function textOf(item: unknown): string {
  if (typeof item === 'object' && item !== null && 'str' in item) {
    const value = item.str;
    return typeof value === 'string' ? value : '';
  }
  return '';
}
