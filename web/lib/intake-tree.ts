export const SECTION_IDS = [
  'about',
  'loves',
  'overwhelms',
  'helps',
  'communication',
  'sensory',
  'toileting',
  'allergies',
  'behavior',
] as const;

export type SectionId = (typeof SECTION_IDS)[number];

export type PostKey = 'sensoryNotes' | 'supportNeeds' | 'whatHelps' | 'whatToAvoid';

export type CardKey =
  | 'loves'
  | 'overwhelms'
  | 'whatHelps'
  | 'communication'
  | 'sensory'
  | 'toileting'
  | 'allergies'
  | 'calming';

export type Write =
  | { readonly target: 'post'; readonly key: PostKey }
  | { readonly target: 'card'; readonly key: CardKey }
  | { readonly target: 'summary' };

export type Follow =
  | { readonly when: 'short'; readonly maxChars: number; readonly nodeId: string }
  | { readonly when: 'allergy'; readonly nodeId: string };

export interface IntakeNode {
  readonly id: string;
  readonly sectionId: string;
  readonly prompt: string;
  readonly placeholder: string;
  readonly check?: 'name' | 'age';
  readonly follow?: Follow;
  readonly chips?: readonly string[];
  readonly closeChip?: string;
  readonly writes: readonly Write[];
}

export interface IntakeSection {
  readonly id: SectionId;
  readonly title: string;
  readonly nodeId: string;
  readonly reviewLabel: string;
}

export interface IntakeTree {
  readonly placeholderNote: string;
  readonly parentName: 'Avery';
  readonly sections: readonly IntakeSection[];
  readonly nodes: readonly IntakeNode[];
}

export type TreeParse = { readonly ok: true; readonly tree: IntakeTree } | { readonly ok: false; readonly error: string };

const POST_KEYS = ['sensoryNotes', 'supportNeeds', 'whatHelps', 'whatToAvoid'] as const;

const CARD_KEYS = [
  'loves',
  'overwhelms',
  'whatHelps',
  'communication',
  'sensory',
  'toileting',
  'allergies',
  'calming',
] as const;

const PLACEHOLDER_NOTE = 'Questions are placeholders pending a professional question set.';

const TYPE_ANSWER = 'Type your answer...';

const RAW = {
  placeholderNote: PLACEHOLDER_NOTE,
  parentName: 'Avery',
  sections: [
    { id: 'about', title: 'About your child', nodeId: 'name', reviewLabel: 'Summary' },
    { id: 'loves', title: 'Loves', nodeId: 'loves', reviewLabel: 'Loves' },
    { id: 'overwhelms', title: 'Overwhelms', nodeId: 'overwhelms', reviewLabel: 'Overwhelms' },
    { id: 'helps', title: 'What helps', nodeId: 'helps', reviewLabel: 'What helps' },
    { id: 'communication', title: 'Communication', nodeId: 'communication', reviewLabel: 'Communication' },
    { id: 'sensory', title: 'Sensory', nodeId: 'sensory', reviewLabel: 'Sensory' },
    { id: 'toileting', title: 'Toileting', nodeId: 'toileting', reviewLabel: 'Toileting' },
    { id: 'allergies', title: 'Allergies & health', nodeId: 'allergies', reviewLabel: 'Allergies & health' },
    { id: 'behavior', title: 'Behavior & safety', nodeId: 'behavior', reviewLabel: 'Safety & calming' },
  ],
  nodes: [
    {
      id: 'name',
      sectionId: 'about',
      prompt: 'What name does your child go by at church?',
      placeholder: TYPE_ANSWER,
      check: 'name',
      writes: [],
    },
    {
      id: 'age',
      sectionId: 'about',
      prompt: 'How old is {child}?',
      placeholder: TYPE_ANSWER,
      check: 'age',
      chips: ['6', '7', '8', '9'],
      writes: [],
    },
    {
      id: 'about',
      sectionId: 'about',
      prompt: 'To start: how would you describe {child} in a sentence or two?',
      placeholder: TYPE_ANSWER,
      writes: [{ target: 'summary' }, { target: 'post', key: 'supportNeeds' }],
    },
    {
      id: 'loves',
      sectionId: 'loves',
      prompt: 'What does {child} love, at church or at home?',
      placeholder: TYPE_ANSWER,
      writes: [{ target: 'card', key: 'loves' }],
    },
    {
      id: 'overwhelms',
      sectionId: 'overwhelms',
      prompt: 'What tends to overwhelm {child} at church or in new places?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'whatToAvoid' },
        { target: 'card', key: 'overwhelms' },
      ],
    },
    {
      id: 'helps',
      sectionId: 'helps',
      prompt: 'What helps {child} feel calm again when things get to be too much?',
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
        'One more about what helps: is there anything else that calms {child}, like a quiet spot or a heads-up before changes?',
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
      prompt: 'How does {child} usually let you know what {child} needs?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'supportNeeds' },
        { target: 'card', key: 'communication' },
      ],
    },
    {
      id: 'sensory',
      sectionId: 'sensory',
      prompt: 'What sensory things should volunteers know about {child} at church?',
      placeholder: TYPE_ANSWER,
      writes: [
        { target: 'post', key: 'sensoryNotes' },
        { target: 'card', key: 'sensory' },
      ],
    },
    {
      id: 'toileting',
      sectionId: 'toileting',
      prompt: 'How does {child} usually let you know they need the bathroom?',
      placeholder: TYPE_ANSWER,
      chips: ['Tells an adult', 'Uses a sign or picture', 'Needs reminders', 'Needs help in the bathroom'],
      writes: [{ target: 'card', key: 'toileting' }],
    },
    {
      id: 'allergies',
      sectionId: 'allergies',
      prompt: 'Does {child} have any allergies, to food, medicine, or anything else?',
      placeholder: TYPE_ANSWER,
      chips: ['No known allergies', 'Food allergy', 'Medicine allergy', 'Something else'],
      follow: { when: 'allergy', nodeId: 'allergies-more' },
      writes: [{ target: 'card', key: 'allergies' }],
    },
    {
      id: 'allergies-more',
      sectionId: 'allergies',
      prompt: 'One more about allergies and health: what happens for {child}, and what should a volunteer do?',
      placeholder: TYPE_ANSWER,
      writes: [{ target: 'card', key: 'allergies' }],
    },
    {
      id: 'behavior',
      sectionId: 'behavior',
      prompt:
        'When {child} is very upset, does {child} ever hurt himself or others, or run off? If so, what helps in that moment?',
      placeholder: TYPE_ANSWER,
      chips: ['No, not usually', 'Sometimes runs off', 'Sometimes hits or bites', 'Let me explain'],
      writes: [{ target: 'card', key: 'calming' }],
    },
  ],
};

export const intakeTree = ship(RAW);

export function parseIntakeTree(input: unknown): TreeParse {
  if (!isRecord(input)) return fail('invalid-tree');
  if (input.placeholderNote !== PLACEHOLDER_NOTE) return fail('invalid-tree');
  if (input.parentName !== 'Avery') return fail('invalid-tree');
  if (input.medicalOffer !== undefined) return fail('medical-offer');
  if (hasSkip(input)) return fail('skip');
  const flagged = flaggedShape(input.sections, input.nodes);
  if (flagged !== null) return fail(flagged);
  const sections = sectionList(input.sections);
  if (sections === null) return fail('invalid-tree');
  const nodes = nodeList(input.nodes);
  if (nodes === null) return fail('invalid-tree');
  const duplicate = duplicateId(nodes);
  if (duplicate !== null) return fail(`duplicate-node:${duplicate}`);
  const ids = new Set(nodes.map((node) => node.id));
  const sectionIds = new Set<string>(sections.map((section) => section.id));
  for (const section of sections) {
    if (!ids.has(section.nodeId)) return fail(`unknown-node:${section.nodeId}`);
  }
  for (const node of nodes) {
    if (!sectionIds.has(node.sectionId)) return fail(`unknown-section:${node.sectionId}`);
    if (node.follow !== undefined && !ids.has(node.follow.nodeId)) return fail(`unknown-node:${node.follow.nodeId}`);
  }
  const reachable = reachableIds(sections, nodes);
  for (const node of nodes) {
    if (!reachable.has(node.id)) return fail(`unreachable-node:${node.id}`);
  }
  return {
    ok: true,
    tree: {
      placeholderNote: PLACEHOLDER_NOTE,
      parentName: 'Avery',
      sections,
      nodes,
    },
  };
}

export function isSectionId(value: string): value is SectionId {
  return SECTION_IDS.some((id) => id === value);
}

function ship(input: unknown): IntakeTree {
  const parsed = parseIntakeTree(input);
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.tree;
}

function fail(error: string): TreeParse {
  return { ok: false, error };
}

function flaggedShape(sections: unknown, nodes: unknown): string | null {
  if (Array.isArray(sections)) {
    for (const section of sections) {
      if (!isRecord(section)) continue;
      if (section.kind === 'medical') return 'medical-offer';
      if (section.optional !== undefined || (section.kind !== undefined && section.kind !== 'counted')) {
        return 'optional-section';
      }
      if (hasSkip(section)) return 'skip';
    }
  }
  if (Array.isArray(nodes)) {
    for (const node of nodes) {
      if (isRecord(node) && hasSkip(node)) return 'skip';
    }
  }
  return null;
}

function sectionList(value: unknown): IntakeSection[] | null {
  if (!Array.isArray(value) || value.length !== SECTION_IDS.length) return null;
  const sections: IntakeSection[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const expected = SECTION_IDS[index];
    if (expected === undefined) return null;
    const section = sectionOf(value[index], expected);
    if (section === null) return null;
    sections.push(section);
  }
  return sections;
}

function sectionOf(value: unknown, id: SectionId): IntakeSection | null {
  if (!isRecord(value) || value.id !== id) return null;
  if (!isText(value.title) || !isText(value.nodeId) || !isText(value.reviewLabel)) return null;
  return { id, title: value.title, nodeId: value.nodeId, reviewLabel: value.reviewLabel };
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
  if (!isText(value.id) || !isText(value.sectionId) || !isText(value.prompt) || !isText(value.placeholder)) {
    return null;
  }
  const writes = writeList(value.writes);
  if (writes === null) return null;
  const follow = followOf(value.follow);
  if (value.follow !== undefined && follow === null) return null;
  const check = checkOf(value.check);
  if (value.check !== undefined && check === null) return null;
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
    ...(check === undefined || check === null ? {} : { check }),
    ...(chips === undefined ? {} : { chips }),
    ...(value.closeChip === undefined ? {} : { closeChip: value.closeChip }),
    writes,
  };
}

function followOf(value: unknown): Follow | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || !isText(value.nodeId)) return null;
  if (value.when === 'short') {
    if (typeof value.maxChars !== 'number' || !Number.isFinite(value.maxChars)) return null;
    return { when: 'short', maxChars: value.maxChars, nodeId: value.nodeId };
  }
  if (value.when === 'allergy') return { when: 'allergy', nodeId: value.nodeId };
  return null;
}

function checkOf(value: unknown): 'name' | 'age' | null | undefined {
  if (value === undefined) return undefined;
  if (value === 'name' || value === 'age') return value;
  return null;
}

function reachableIds(sections: readonly IntakeSection[], nodes: readonly IntakeNode[]): Set<string> {
  const targets = new Set(nodes.flatMap((node) => (node.follow === undefined ? [] : [node.follow.nodeId])));
  const reachable = new Set(sections.map((section) => section.nodeId));
  let grew = true;
  while (grew) {
    grew = false;
    for (const node of nodes) {
      if (!reachable.has(node.id)) continue;
      const followId = node.follow?.nodeId;
      if (followId !== undefined && !reachable.has(followId)) {
        reachable.add(followId);
        grew = true;
      }
      const next = nextPlain(nodes, node, targets);
      if (next !== null && !reachable.has(next)) {
        reachable.add(next);
        grew = true;
      }
    }
  }
  return reachable;
}

function nextPlain(nodes: readonly IntakeNode[], node: IntakeNode, targets: ReadonlySet<string>): string | null {
  const start = nodes.findIndex((item) => item.id === node.id);
  for (let index = start + 1; index < nodes.length; index += 1) {
    const candidate = nodes[index];
    if (candidate === undefined) return null;
    if (targets.has(candidate.id)) continue;
    if (candidate.sectionId !== node.sectionId) return null;
    return candidate.id;
  }
  return null;
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

function hasSkip(value: Record<string, unknown>): boolean {
  return value.skip !== undefined || value.skipLabel !== undefined;
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
