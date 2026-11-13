import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { dirname } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const skipDirectories = new Set([
  '.git',
  'node_modules',
  '.wrangler',
  'dist',
  'coverage',
  '.next',
  '.cloudflare',
  '.vinext',
  'playwright-report',
  'test-results',
]);
const productRoots = ['src', 'test', 'supabase', 'web', 'scripts'];
const productFiles = [
  'README.md',
  'wrangler.toml',
  'package.json',
  '.dev.vars.example',
  '.gitignore',
  'tsconfig.json',
  'tsconfig.test.json',
  'worker-configuration.d.ts',
];

const gatewayHost = ['gateway.ai', 'cloudflare.com'].join('.');
const allowedReadmeGatewayBase = ['https://', gatewayHost, '/v1'].join('');
const banned = [
  gatewayHost,
  ['api', 'cloudflare.com'].join('.'),
  ['supabase', 'co'].join('.'),
  ['api.openai', 'com'].join('.'),
  ['wrangler', 'deploy'].join(' '),
  ['sk', 'live'].join('-'),
  ['sk', 'proj'].join('-'),
];

function files(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (skipDirectories.has(entry)) continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...files(path));
    // Next rewrites a documentation URL into next-env.d.ts during build.
    else if (entry !== 'package-lock.json' && entry !== 'next-env.d.ts' && !entry.endsWith('.tsbuildinfo')) {
      found.push(path);
    }
  }
  return found;
}

test('tracked product files do not hardcode account hosts, ids, or keys', () => {
  const scanned = [
    ...productRoots.flatMap((directory) => files(join(root, directory))),
    ...productFiles.map((file) => join(root, file)),
  ];
  for (const path of scanned) {
    let text = readFileSync(path, 'utf8');
    const rel = relative(root, path);
    if (rel === 'README.md') {
      assert.equal(
        text.includes(`${allowedReadmeGatewayBase}/`),
        false,
        `${rel} extends the public gateway base`,
      );
      text = text.replaceAll(allowedReadmeGatewayBase, '');
    }
    for (const needle of banned) {
      assert.equal(text.includes(needle), false, `${rel} contains ${needle}`);
    }
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const accountIds = code.match(/(?<![0-9a-f])[0-9a-f]{32}(?![0-9a-f])/gi) ?? [];
    assert.deepEqual(accountIds, [], rel);
    for (const match of text.matchAll(/https?:\/\/([^/\s"'`]+)/g)) {
      const host = match[1]?.split(':')[0] ?? '';
      assert.ok(
        host === 'example.com' || host.endsWith('.example.com') || host === '127.0.0.1',
        `${rel} has ${host}`,
      );
    }
  }
});

test('package scripts do not deploy', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  for (const script of Object.values(pkg.scripts)) {
    assert.equal(script.includes('deploy'), false);
  }
});
