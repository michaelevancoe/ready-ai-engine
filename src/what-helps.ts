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

const DRAFT_PROFILE_BODY =
  /^(?:(?:a|an|the)\s+)?draft(?:\s+child)?\s+profile(?:\s+for\s+[\p{L}\p{N}'’.-]+(?:\s+[\p{L}\p{N}'’.-]+)*)?$/iu;

const POSSESSIVE_DRAFT = /^[\p{L}\p{N}'’.-]+(?:'s|’s)\s+draft(?:\s+child)?\s+profile$/iu;

function draftAnnouncement(line: string): boolean {
  const text = line.trim().replace(/[.!?:]+\s*$/u, '').trim();
  if (!LEADING_PREAMBLE.test(text)) return false;
  const rest = text.replace(/^here(?:'s|’s| is)\s+/iu, '');
  return DRAFT_PROFILE_BODY.test(rest) || POSSESSIVE_DRAFT.test(rest);
}

function preambleOnlyLine(line: string): boolean {
  const text = line.trim();
  if (text.length === 0) return false;
  const sentences = text.split(/(?<=[.!])\s+/u).filter((part) => part.trim().length > 0);
  if (sentences.length > 1) return sentences.every((sentence) => draftAnnouncement(sentence));
  return draftAnnouncement(text);
}

function stripPreambleLine(line: string): string {
  if (line.length === 0 || preambleOnlyLine(line)) return '';
  if (!LEADING_PREAMBLE.test(line)) return line;
  const colon = line.indexOf(':');
  if (colon === -1) return line;
  const tail = line.slice(colon + 1).trim();
  if (tail.length === 0 || preambleOnlyLine(tail)) return '';
  return tail;
}

export function stripLeadingPreamble(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return '';
  const lines = trimmed.split(/\r?\n/u).map((line) => line.trim());
  const first = lines[0] ?? '';
  const rest = lines.slice(1);
  const laterPreamble = rest.some(preambleOnlyLine);
  if (!LEADING_PREAMBLE.test(first) && !preambleOnlyLine(first) && !laterPreamble) return trimmed;
  const head = stripPreambleLine(first);
  const body = rest.filter((line) => line.length > 0 && !preambleOnlyLine(line));
  return [head, ...body].filter((line) => line.length > 0).join('\n').trim();
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
