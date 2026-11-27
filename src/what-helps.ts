const BANNED = [
  'autism',
  'aphasia',
  'diagnos',
  'disorder',
  'disabilit',
  'impair',
  'individuals',
  'medical',
  'allerg',
  'medication',
  'condition',
  'special needs',
] as const;

export function filterWhatHelps(bullets: readonly string[]): readonly string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const bullet of bullets) {
    const text = bullet.trim();
    if (text.length === 0 || text.length > 110 || wordCount(text) > 16) continue;
    if (hasNonLatinLetter(text)) continue;
    const lower = text.toLowerCase();
    if (BANNED.some((word) => lower.includes(word))) continue;
    if (seen.has(lower)) continue;
    seen.add(lower);
    kept.push(text);
  }
  return kept;
}

function wordCount(value: string): number {
  if (value.length === 0) return 0;
  return value.split(/\s+/u).length;
}

function hasNonLatinLetter(value: string): boolean {
  for (const letter of value.match(/\p{L}/gu) ?? []) {
    if (!/\p{Script=Latin}/u.test(letter)) return true;
  }
  return false;
}
