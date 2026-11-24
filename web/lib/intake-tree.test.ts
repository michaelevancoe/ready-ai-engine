import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intakeTree, parseIntakeTree, type IntakeTree, type Write } from './intake-tree.ts';

const NOTE = 'Questions are placeholders pending a professional question set.';

test('the shipped tree parses and carries the placeholder note', () => {
  const parsed = parseIntakeTree(intakeTree);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.tree.placeholderNote, NOTE);
  assert.equal(intakeTree.placeholderNote, NOTE);
  assert.equal(parsed.tree.sections.filter((section) => section.kind === 'counted').length, 6);
  assert.equal(parsed.tree.nodes.find((node) => node.id === 'helps')?.follow?.maxChars, 40);
  assert.equal(parsed.tree.nodes.find((node) => node.id === 'helps')?.follow?.nodeId, 'helps-more');
});

test('an unreachable node fails and a follow target still parses', () => {
  const parsed = parseIntakeTree({
    ...intakeTree,
    nodes: [
      ...intakeTree.nodes,
      {
        id: 'extra',
        sectionId: 'about',
        prompt: 'Another question about Rowan?',
        placeholder: 'Type your answer...',
        writes: [{ target: 'summary' }],
      },
    ],
  });
  assert.equal(parsed.ok, false);
  if (parsed.ok) return;
  assert.equal(parsed.error, 'unreachable-node:extra');
  assert.equal(intakeTree.nodes.some((node) => node.id === 'helps-more'), true);
  assert.equal(intakeTree.sections.some((section) => section.nodeId === 'helps-more'), false);
});

test('a dangling follow id fails', () => {
  const broken = parseIntakeTree(withHelpsFollow(intakeTree, 'missing-follow'));
  assert.equal(broken.ok, false);
  if (broken.ok) return;
  assert.equal(broken.error, 'unknown-node:missing-follow');
});

test('a section node id and a node section id must exist, and node ids are unique', () => {
  const section = parseIntakeTree({
    ...intakeTree,
    sections: intakeTree.sections.map((item) => (item.id === 'sensory' ? { ...item, nodeId: 'missing-node' } : item)),
  });
  assert.equal(section.ok, false);
  if (section.ok) return;
  assert.equal(section.error, 'unknown-node:missing-node');

  const node = parseIntakeTree({
    ...intakeTree,
    nodes: intakeTree.nodes.map((item) => (item.id === 'sensory' ? { ...item, sectionId: 'missing-section' } : item)),
  });
  assert.equal(node.ok, false);
  if (node.ok) return;
  assert.equal(node.error, 'unknown-section:missing-section');

  const duplicate = parseIntakeTree({
    ...intakeTree,
    nodes: [...intakeTree.nodes, intakeTree.nodes[0]],
  });
  assert.equal(duplicate.ok, false);
  if (duplicate.ok) return;
  assert.equal(duplicate.error, 'duplicate-node:about');
});

test('every profile section is written by at least one node', () => {
  const writes = intakeTree.nodes.flatMap((node) => node.writes);
  assert.equal(writes.some(isSummary), true);
  assert.equal(writes.some((write) => isCard(write, 'loves')), true);
  assert.equal(writes.some((write) => isCard(write, 'overwhelms')), true);
  assert.equal(writes.some((write) => isCard(write, 'whatHelps')), true);
  assert.equal(writes.some((write) => isCard(write, 'communication')), true);
  assert.equal(writes.some((write) => isCard(write, 'sensory')), true);
  assert.equal(writes.some((write) => isCard(write, 'medical')), true);
});

function withHelpsFollow(tree: IntakeTree, nodeId: string): IntakeTree {
  return {
    ...tree,
    nodes: tree.nodes.map((node) =>
      node.id === 'helps' && node.follow !== undefined ? { ...node, follow: { ...node.follow, nodeId } } : node,
    ),
  };
}

function isSummary(write: Write): boolean {
  return write.target === 'summary';
}

function isCard(write: Write, key: 'loves' | 'overwhelms' | 'whatHelps' | 'communication' | 'sensory' | 'medical'): boolean {
  return write.target === 'card' && write.key === key;
}
