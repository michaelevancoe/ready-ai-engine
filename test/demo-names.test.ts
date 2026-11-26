import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const retired = ['Eli', 'Sam Rivera'] as const;
const skipDirectories = new Set([
  'node_modules',
  '.next',
  '.cloudflare',
  '.vinext',
  'dist',
  'test-results',
  'playwright-report',
]);

function sourceFiles(directory: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(directory)) {
    if (skipDirectories.has(name)) continue;
    const path = join(directory, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    found.push(path);
  }
  return found;
}

test('Theo Park does not appear in web or src TypeScript', () => {
  const files = [...sourceFiles(join(root, 'web')), ...sourceFiles(join(root, 'src'))].filter(
    (path) => path.endsWith('.ts') || path.endsWith('.tsx'),
  );
  for (const path of files) {
    assert.equal(readFileSync(path, 'utf8').includes('Theo Park'), false, path);
  }
});

test('Eli and Sam Rivera do not appear in the demo copy', () => {
  const paths = [
    join(root, 'README.md'),
    join(root, 'src/demo-drafts.ts'),
    join(root, 'scripts/demo-engine.ts'),
    ...sourceFiles(join(root, 'web')),
  ];
  for (const path of paths) {
    const text = readFileSync(path, 'utf8');
    for (const name of retired) {
      assert.equal(text.includes(name), false, `${path} includes ${name}`);
    }
  }
});
