export type PostKey = 'sensoryNotes' | 'supportNeeds' | 'whatHelps' | 'whatToAvoid';

export type CardKey = 'loves' | 'overwhelms' | 'whatHelps' | 'communication' | 'sensory' | 'medical';

export type Write =
  | { readonly target: 'post'; readonly key: PostKey }
  | { readonly target: 'card'; readonly key: CardKey }
  | { readonly target: 'summary' };

export interface IntakeNode {
  readonly id: string;
  readonly sectionId: string;
  readonly prompt: string;
  readonly placeholder: string;
  readonly follow?: { readonly when: 'short'; readonly maxChars: number; readonly nodeId: string };
  readonly chips?: readonly string[];
  readonly closeChip?: string;
  readonly writes: readonly Write[];
}

export interface IntakeSection {
  readonly id: string;
  readonly kind: 'counted' | 'medical';
  readonly title: string;
  readonly nodeId: string;
  readonly reviewLabel: string;
}

export interface IntakeTree {
  readonly placeholderNote: string;
  readonly child: { readonly preferredName: 'Rowan'; readonly ageYears: 7 };
  readonly parentName: 'Avery';
  readonly intro: readonly string[];
  readonly sections: readonly IntakeSection[];
  readonly nodes: readonly IntakeNode[];
}

export type TreeParse = { readonly ok: true; readonly tree: IntakeTree } | { readonly ok: false; readonly error: string };

const POST_KEYS = ['sensoryNotes', 'supportNeeds', 'whatHelps', 'whatToAvoid'] as const;

const CARD_KEYS = ['loves', 'overwhelms', 'whatHelps', 'communication', 'sensory', 'medical'] as const;

const PLACEHOLDER_NOTE = 'Questions are placeholders pending a professional question set.';

const TYPE_ANSWER = 'Type your answer...';

const RAW = {
  placeholderNote: PLACEHOLDER_NOTE,
  child: { preferredName: 'Rowan', ageYears: 7 },
  parentName: 'Avery',
  intro: [
    "Hi {parent}, I'm Ready. I'll ask a few short questions about Rowan, one at a time.",
    'Talk or type, whichever is easier. You can skip anything, and nothing is shared until you approve Rowan\'s profile.',
  ],
  sections: [
    { id: 'about', kind: 'counted', title: 'About Rowan', nodeId: 'about', reviewLabel: 'Summary' },
    { id: 'loves', kind: 'counted', title: 'Loves', nodeId: 'loves', reviewLabel: 'Loves' },
    { id: 'overwhelms', kind: 'counted', title: 'Overwhelms', nodeId: 'overwhelms', reviewLabel: 'Overwhelms' },
    { id: 'helps', kind: 'counted', title: 'What helps', nodeId: 'helps', reviewLabel: 'What helps' },
    {
      id: 'communication',
      kind: 'counted',
      title: 'Communication',
      nodeId: 'communication',
      reviewLabel: 'Communication',
    },
    { id: 'sensory', kind: 'counted', title: 'Sensory', nodeId: 'sensory', reviewLabel: 'Sensory' },
    {
      id: 'medical',
      kind: 'medical',
      title: 'Medical',
      nodeId: 'medical',
      reviewLabel: 'Medical / health notes',
    },
  ],
  nodes: [
    {
      id: 'about',
      sectionId: 'about',
      prompt: 'To start: how would you describe Rowan in a sentence or two?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'summary' },
        { target: 'post', key: 'supportNeeds' },
      ],
    },
    {
      id: 'loves',
      sectionId: 'loves',
      prompt: 'What does Rowan love, at church or at home?',
      placeholder: TYPE_ANSWER,
      writes: [{ target: 'card', key: 'loves' }],
    },
    {
      id: 'overwhelms',
      sectionId: 'overwhelms',
      prompt: 'What tends to overwhelm Rowan at church or in new places?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'whatToAvoid' },
        { target: 'card', key: 'overwhelms' },
      ],
    },
    {
      id: 'helps',
      sectionId: 'helps',
      prompt: 'When Rowan starts to feel overwhelmed, what helps most?',
      placeholder: TYPE_ANSWER,
      follow: { when: 'short', maxChars: 40, nodeId: 'helps-more' },
      writes: [
        { target: 'post', key: 'whatHelps' },
        { target: 'card', key: 'whatHelps' },
      ],
    },
    {
      id: 'helps-more',
      sectionId: 'helps',
      prompt:
        'Thanks, {prior}. Is there anything else that calms Rowan, like a quiet spot or a heads-up before changes?',
      placeholder: 'Add a little more...',
      chips: ['A quiet corner', 'A heads-up before changes'],
      closeChip: "That's everything",
      writes: [
        { target: 'post', key: 'whatHelps' },
        { target: 'card', key: 'whatHelps' },
      ],
    },
    {
      id: 'communication',
      sectionId: 'communication',
      prompt: 'How does Rowan communicate when words are hard?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'supportNeeds' },
        { target: 'card', key: 'communication' },
      ],
    },
    {
      id: 'sensory',
      sectionId: 'sensory',
      prompt: 'What sensory things should volunteers know about Rowan at church?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'sensoryNotes' },
        { target: 'card', key: 'sensory' },
      ],
    },
    {
      id: 'medical',
      sectionId: 'medical',
      prompt: "What medical or health note should stay with Rowan's profile?",
      placeholder: TYPE_ANSWER,
      writes: [{ target: 'card', key: 'medical' }],
    },
  ],
};

export const intakeTree = ship(RAW);

export function parseIntakeTree(input: unknown): TreeParse {
  if (!isRecord(input)) return fail('invalid-tree');
  if (input.placeholderNote !== PLACEHOLDER_NOTE) return fail('invalid-tree');
  if (!isRecord(input.child) || input.child.preferredName !== 'Rowan' || input.child.ageYears !== 7) {
    return fail('invalid-tree');
  }
  if (input.parentName !== 'Avery') return fail('invalid-tree');
  const intro = stringList(input.intro);
  if (intro === null || intro.length === 0) return fail('invalid-tree');
  const sections = sectionList(input.sections);
  if (sections === null) return fail('invalid-tree');
  const nodes = nodeList(input.nodes);
  if (nodes === null) return fail('invalid-tree');
  const duplicate = duplicateId(nodes);
  if (duplicate !== null) return fail(`duplicate-node:${duplicate}`);
  const ids = new Set(nodes.map((node) => node.id));
  const sectionIds = new Set(sections.map((section) => section.id));
  for (const section of sections) {
    if (!ids.has(section.nodeId)) return fail(`unknown-node:${section.nodeId}`);
  }
  for (const node of nodes) {
    if (!sectionIds.has(node.sectionId)) return fail(`unknown-section:${node.sectionId}`);
    if (node.follow !== undefined && !ids.has(node.follow.nodeId)) return fail(`unknown-node:${node.follow.nodeId}`);
  }
  return {
    ok: true,
    tree: {
      placeholderNote: PLACEHOLDER_NOTE,
      child: { preferredName: 'Rowan', ageYears: 7 },
      parentName: 'Avery',
      intro,
      sections,
      nodes,
    },
  };
}

function ship(input: unknown): IntakeTree {
  const parsed = parseIntakeTree(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.tree;
}

function fail(error: string): TreeParse {
  return { ok: false, error };
}

function sectionList(value: unknown): IntakeSection[] | null {
  if (!Array.isArray(value)) return null;
  const sections: IntakeSection[] = [];
  for (const item of value) {
    const section = sectionOf(item);
    if (section === null) return null;
    sections.push(section);
  }
  return sections;
}

function sectionOf(value: unknown): IntakeSection | null {
  if (!isRecord(value)) return null;
  if (value.kind !== 'counted' && value.kind !== 'medical') return null;
  if (!isText(value.id) || !isText(value.title) || !isText(value.nodeId) || !isText(value.reviewLabel)) return null;
  return { id: value.id, kind: value.kind, title: value.title, nodeId: value.nodeId, reviewLabel: value.reviewLabel };
}

function nodeList(value: unknown): IntakeNode[] | null {
  if (!Array.isArray(value)) return null;
  const nodes: IntakeNode[] = [];
  for (const item of value) {
    const node = nodeOf(item);
    if (node === null) return null;
    nodes.push(node);
  }
  return nodes;
}

function nodeOf(value: unknown): IntakeNode | null {
  if (!isRecord(value)) return null;
  if (!isText(value.id) || !isText(value.sectionId) || !isText(value.prompt) || !isText(value.placeholder)) return null;
  const writes = writeList(value.writes);
  if (writes === null) return null;
  const follow = followOf(value.follow);
  if (value.follow !== undefined && follow === null) return null;
  const chips = value.chips === undefined ? undefined : stringList(value.chips);
  if (value.chips !== undefined && chips === null) return null;
  if (value.closeChip !== undefined && !isText(value.closeChip)) return null;
  if (follow === null || chips === null) return null;
  return {
    id: value.id,
    sectionId: value.sectionId,
    prompt: value.prompt,
    placeholder: value.placeholder,
    ...(follow === undefined ? {} : { follow }),
    ...(chips === undefined ? {} : { chips }),
    ...(value.closeChip === undefined ? {} : { closeChip: value.closeChip }),
    writes,
  };
}

function followOf(value: unknown): IntakeNode['follow'] | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || value.when !== 'short' || typeof value.maxChars !== 'number' || !isText(value.nodeId)) {
    return null;
  }
  if (!Number.isFinite(value.maxChars)) return null;
  return { when: 'short', maxChars: value.maxChars, nodeId: value.nodeId };
}

function writeList(value: unknown): Write[] | null {
  if (!Array.isArray(value)) return null;
  const writes: Write[] = [];
  for (const item of value) {
    const write = writeOf(item);
    if (write === null) return null;
    writes.push(write);
  }
  return writes;
}

function writeOf(value: unknown): Write | null {
  if (!isRecord(value)) return null;
  if (value.target === 'summary') return { target: 'summary' };
  if (value.target === 'post' && isListed(value.key, POST_KEYS)) return { target: 'post', key: value.key };
  if (value.target === 'card' && isListed(value.key, CARD_KEYS)) return { target: 'card', key: value.key };
  return null;
}

function duplicateId(nodes: readonly IntakeNode[]): string | null {
  const seen = new Set<string>();
  for (const node of nodes) {
    if (seen.has(node.id)) return node.id;
    seen.add(node.id);
  }
  return null;
}

function stringList(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isText)) return null;
  return value;
}

function isListed<T extends string>(value: unknown, keys: readonly T[]): value is T {
  return typeof value === 'string' && keys.some((key) => key === value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
