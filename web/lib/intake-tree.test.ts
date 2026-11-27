import assert from 'node:assert/strict';
import { test } from 'node:test';
import { intakeTree, parseIntakeTree, type IntakeTree, type Write } from './intake-tree.ts';

const NOTE = 'Questions are placeholders pending a professional question set.';
const BEHAVIOR =
  'When {child} is very upset, does that ever lead to hurting themselves or others, or running off? If so, what helps in that moment?';
const GENDERED = /\b(?:he|him|his|himself|she|her|hers|herself)\b/iu;

test('the shipped tree parses nine required sections', () => {
  const parsed = parseIntakeTree(intakeTree);
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  assert.equal(parsed.tree.placeholderNote, NOTE);
  assert.equal(intakeTree.placeholderNote, NOTE);
  assert.equal(parsed.tree.sections.length, 9);
  assert.deepEqual(
    parsed.tree.sections.map((section) => section.id),
    ['about', 'loves', 'overwhelms', 'helps', 'communication', 'sensory', 'toileting', 'allergies', 'behavior'],
  );
  const helps = parsed.tree.nodes.find((node) => node.id === 'helps')?.follow;
  assert.equal(helps?.when, 'short');
  if (helps?.when !== 'short') return;
  assert.equal(helps.maxChars, 40);
  assert.equal(helps.nodeId, 'helps-more');
  const allergies = parsed.tree.nodes.find((node) => node.id === 'allergies')?.follow;
  assert.equal(allergies?.when, 'allergy');
  if (allergies?.when !== 'allergy') return;
  assert.equal(allergies.nodeId, 'allergies-more');
  assert.equal(parsed.tree.nodes.find((node) => node.id === 'behavior')?.prompt, BEHAVIOR);
  assert.equal(parsed.tree.sections.find((section) => section.id === 'behavior')?.title, 'Behavior & safety');
  assert.equal(parsed.tree.sections.find((section) => section.id === 'behavior')?.reviewLabel, 'Safety & calming');
  assert.equal(parsed.tree.sections.find((section) => section.id === 'toileting')?.title, 'Toileting');
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
  assert.equal(duplicate.error, 'duplicate-node:name');
});

test('the about section starts with the child name and age', () => {
  assert.deepEqual(
    intakeTree.nodes.slice(0, 3).map((node) => node.id),
    ['name', 'age', 'about'],
  );
  assert.equal(intakeTree.sections[0]?.title, 'About your child');
  assert.equal(intakeTree.sections[0]?.nodeId, 'name');
  assert.equal(intakeTree.sections.length, 9);
  const name = intakeTree.nodes[0];
  const age = intakeTree.nodes[1];
  assert.equal(name?.prompt, 'What name does your child go by at church?');
  assert.equal(name?.check, 'name');
  assert.equal(name?.writes.length, 0);
  assert.equal(name?.chips, undefined);
  assert.equal(name?.follow, undefined);
  assert.equal(age?.prompt, 'How old is {child}?');
  assert.equal(age?.check, 'age');
  assert.deepEqual(age?.chips, ['6', '7', '8', '9']);
  assert.equal(age?.writes.length, 0);
  assert.equal(age?.follow, undefined);
  assert.equal('child' in intakeTree, false);
  assert.equal(intakeTree.parentName, 'Avery');
  for (const node of intakeTree.nodes) {
    assert.equal(node.prompt.includes('Rowan'), false, node.id);
    assert.equal(/\b(?:he|his)\b/iu.test(node.prompt), false, node.id);
    assert.equal(GENDERED.test(node.prompt), false, node.id);
    if (node.id === 'communication') {
      assert.equal(node.prompt.includes('what they need'), true);
      continue;
    }
    assert.equal(/\bthey need\b/iu.test(node.prompt), false, node.id);
  }
});

test('a medical offer, an optional section, and a skip are rejected', () => {
  const offered = parseIntakeTree({ ...intakeTree, medicalOffer: { lead: 'One last question.' } });
  assert.equal(offered.ok, false);
  if (offered.ok) return;
  assert.equal(offered.error, 'medical-offer');

  const medical = parseIntakeTree({
    ...intakeTree,
    sections: intakeTree.sections.map((item) => (item.id === 'sensory' ? { ...item, kind: 'medical' } : item)),
  });
  assert.equal(medical.ok, false);
  if (medical.ok) return;
  assert.equal(medical.error, 'medical-offer');

  const optional = parseIntakeTree({
    ...intakeTree,
    sections: intakeTree.sections.map((item) => (item.id === 'sensory' ? { ...item, optional: true } : item)),
  });
  assert.equal(optional.ok, false);
  if (optional.ok) return;
  assert.equal(optional.error, 'optional-section');

  const skipped = parseIntakeTree({
    ...intakeTree,
    nodes: intakeTree.nodes.map((item) => (item.id === 'sensory' ? { ...item, skip: true } : item)),
  });
  assert.equal(skipped.ok, false);
  if (skipped.ok) return;
  assert.equal(skipped.error, 'skip');
});

test('the profile cards that remain are written by a node', () => {
  const writes = intakeTree.nodes.flatMap((node) => node.writes);
  assert.equal(writes.some(isSummary), true);
  assert.equal(writes.some((write) => isCard(write, 'loves')), true);
  assert.equal(writes.some((write) => isCard(write, 'overwhelms')), true);
  assert.equal(writes.some((write) => isCard(write, 'whatHelps')), true);
  assert.equal(writes.some((write) => isCard(write, 'communication')), true);
  assert.equal(writes.some((write) => isCard(write, 'sensory')), true);
  assert.deepEqual(intakeTree.nodes.find((node) => node.id === 'toileting')?.writes, [
    { target: 'card', key: 'toileting' },
  ]);
  assert.deepEqual(intakeTree.nodes.find((node) => node.id === 'allergies')?.writes, [
    { target: 'card', key: 'allergies' },
  ]);
  assert.deepEqual(intakeTree.nodes.find((node) => node.id === 'allergies-more')?.writes, [
    { target: 'card', key: 'allergies' },
  ]);
  assert.deepEqual(intakeTree.nodes.find((node) => node.id === 'behavior')?.writes, [
    { target: 'card', key: 'calming' },
  ]);
});

function withHelpsFollow(tree: IntakeTree, nodeId: string): IntakeTree {
  return {
    ...tree,
    nodes: tree.nodes.map((node) => {
      if (node.id !== 'helps' || node.follow?.when !== 'short') return node;
      return { ...node, follow: { ...node.follow, nodeId } };
    }),
  };
}

function isSummary(write: Write): boolean {
  return write.target === 'summary';
}

function isCard(write: Write, key: 'loves' | 'overwhelms' | 'whatHelps' | 'communication' | 'sensory'): boolean {
  return write.target === 'card' && write.key === key;
}
