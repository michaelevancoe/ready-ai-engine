import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { DemoContext } from '../scripts/demo-engine.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const roots = ['web', 'src', 'scripts'];
const allow = new Set([
  'src/access.ts',
  'src/access-http.ts',
  'src/supabase-access.ts',
  'src/memory-access.ts',
  'web/server/visit-reset.ts',
]);
const needles = ['postLesson', 'LessonAdaptation', 'lessonSchema', 'LESSON_RULES', '/v1/drafts/lesson'];
const extensions = new Set(['.ts', '.tsx', '.css', '.js', '.mjs', '.md']);

test('the lesson draft feature is gone outside the access layer', () => {
  const hits: string[] = [];
  for (const dir of roots) walk(join(root, dir), hits);
  assert.deepEqual(hits, []);
});

test('POST /v1/drafts/lesson is not a route', async () => {
  const demo = await DemoContext.open('1');
  const response = await demo.handle(
    new Request('http://example.com/v1/drafts/lesson', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lesson: 'A fictional welcome.', lines: [], childName: 'Rowan' }),
    }),
  );
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: 'not_found' });
});

function walk(dir: string, hits: string[]): void {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.next' || name === '.cloudflare') continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      walk(path, hits);
      continue;
    }
    const suffix = name.slice(name.lastIndexOf('.'));
    if (!extensions.has(suffix)) continue;
    const rel = relative(root, path);
    if (allow.has(rel)) continue;
    const text = readFileSync(path, 'utf8');
    for (const needle of needles) {
      if (text.includes(needle)) hits.push(`${rel}: ${needle}`);
    }
  }
}
