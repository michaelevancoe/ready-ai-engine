import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { openBuiltDemo } from './built-demo.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function buildWeb(): void {
  const build = spawnSync('npm', ['run', 'build:vinext'], {
    cwd: join(repoRoot, 'web'),
    encoding: 'utf8',
    stdio: 'inherit',
  });
  assert.equal(build.status, 0);
}

function assetPath(html: string, pattern: RegExp): string {
  const path = html.match(pattern)?.[1];
  assert.ok(path, pattern.source);
  return path;
}

test('the built worker serves static assets, robots, and the engine', async () => {
  buildWeb();
  const demo = await openBuiltDemo(0);
  try {
    const root = await fetch(demo.url + '/');
    const html = await root.text();
    assert.equal(root.status, 200);
    assert.equal(root.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(root.headers.get('x-robots-tag'), 'noindex');

    const cssPath = assetPath(html, /href="(\/_next\/static\/css\/[^"]+)"/);
    const css = await fetch(demo.url + cssPath);
    assert.equal(css.status, 200);
    assert.match(css.headers.get('content-type') ?? '', /^text\/css/);
    assert.equal(css.headers.get('x-robots-tag'), 'noindex');
    assert.notEqual(await css.text(), 'Not Found');

    const scriptPath = assetPath(html, /src="(\/_next\/static\/chunks\/[^"]+)"/);
    const script = await fetch(demo.url + scriptPath);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type') ?? '', /javascript/);
    assert.equal(script.headers.get('x-robots-tag'), 'noindex');

    const robots = await fetch(demo.url + '/robots.txt');
    assert.equal(robots.status, 200);
    assert.equal(robots.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');

    const rejected = await fetch(demo.url + '/v1/intake/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    });
    assert.equal(rejected.status, 400);
    assert.match(rejected.headers.get('content-type') ?? '', /^application\/json/);
    assert.equal(rejected.headers.get('x-robots-tag'), 'noindex');
    assert.equal(await rejected.text(), '{"error":"invalid_input"}');

    const intake = await fetch(demo.url + '/v1/intake/profile', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        preferredName: 'Rowan',
        ageYears: 7,
        sensoryNotes: 'TICK-QUIET-ROOM',
        supportNeeds: 'A quiet seat near the door.',
        whatHelps: 'A warning before music.',
        whatToAvoid: 'Surprise loud songs.',
      }),
    });
    assert.equal(intake.status, 201);
    assert.equal(intake.headers.get('x-robots-tag'), 'noindex');
    assert.equal((await intake.text()).includes('TICK-QUIET-ROOM'), true);
  } finally {
    await demo.close();
  }
});
