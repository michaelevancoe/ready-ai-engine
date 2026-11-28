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

const LEADING_PREAMBLE = /^here(?:'s|’s| is)\b/iu;

export function stripLeadingPreamble(value: string): string {
  const trimmed = value.trim();
  const lines = trimmed.split(/\r?\n/u);
  const first = (lines[0] ?? '').trim();
  if (!LEADING_PREAMBLE.test(first)) return trimmed;
  const rest = lines.slice(1).join('\n').trim();
  if (rest.length > 0) return rest;
  const colon = first.indexOf(':');
  if (colon === -1) return trimmed;
  return first.slice(colon + 1).trim();
}

export function filterWhatHelps(bullets: readonly string[]): readonly string[] {
  const kept: string[] = [];
  const seen = new Set<string>();
  for (const bullet of bullets) {
    const text = stripLeadingPreamble(bullet);
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
