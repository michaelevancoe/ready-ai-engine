const photoTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);

export function isChurchPhotoFile(file: { readonly type: string }): boolean {
  return photoTypes.has(file.type);
}
