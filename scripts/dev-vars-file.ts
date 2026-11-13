import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDevVars } from './live-env.ts';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

export function loadDevVarsFile(): Record<string, string> {
  const path = join(repoRoot, '.dev.vars');
  if (!existsSync(path)) return {};
  return parseDevVars(readFileSync(path, 'utf8'));
}
