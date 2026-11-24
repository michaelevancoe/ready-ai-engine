import { createRequire } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(new URL('../web/package.json', import.meta.url));
const { Miniflare } = require('miniflare') as {
  Miniflare: new (options: BuiltDemoOptions) => BuiltDemoRuntime;
};

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workerRoot = join(repoRoot, 'web/.cloudflare/output/v0/workers/default');

interface ModuleRecord {
  type: 'esm' | 'json' | 'text';
  contents: string;
}

interface BuiltWorkerConfig {
  compatibilityDate: string;
  compatibilityFlags?: string[];
  assets: {
    directory?: string;
    hasUserWorker?: boolean;
    htmlHandling: string;
    notFoundHandling: string;
    runWorkerFirst: string[];
  };
  env: Record<string, { type: string; value?: string }>;
  manifest?: {
    mainModule: string;
    modulesRoot: string;
    modules: Record<string, ModuleRecord>;
  };
}

interface BuiltDemoOptions {
  host: string;
  port: number;
  workers: Array<{ config: BuiltWorkerConfig }>;
}

interface BuiltDemoRuntime {
  ready: Promise<URL>;
  dispose(): Promise<void>;
}

export interface BuiltDemo {
  url: string;
  close(): Promise<void>;
}

function moduleType(path: string): ModuleRecord['type'] | undefined {
  if (path.endsWith('.map')) return undefined;
  if (path.endsWith('.js')) return 'esm';
  if (path.endsWith('.json')) return 'json';
  return 'text';
}

function bundleModules(bundleDir: string): Record<string, ModuleRecord> {
  const modules: Record<string, ModuleRecord> = {};
  const visit = (directory: string): void => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) {
        visit(path);
        continue;
      }
      const type = moduleType(path);
      if (type === undefined) continue;
      const key = relative(bundleDir, path);
      modules[key] = { type, contents: readFileSync(path, 'utf8') };
    }
  };
  visit(bundleDir);
  return modules;
}

export async function openBuiltDemo(port: number): Promise<BuiltDemo> {
  const bundleDir = join(workerRoot, 'bundle');
  const config = JSON.parse(readFileSync(join(workerRoot, 'worker.config.json'), 'utf8')) as BuiltWorkerConfig;
  config.compatibilityFlags = ['nodejs_compat'];
  config.assets.directory = join(workerRoot, 'assets');
  config.assets.hasUserWorker = true;
  config.manifest = {
    mainModule: 'index.js',
    modulesRoot: bundleDir,
    modules: bundleModules(bundleDir),
  };
  const model = config.env.READY_DEMO_MODEL;
  if (model === undefined) throw new Error('built worker is missing READY_DEMO_MODEL');
  model.value = 'mock';
  config.env.AI_GATEWAY_TOKEN = { type: 'text', value: 'dummy-gateway-token-not-real' };
  const runtime = new Miniflare({
    host: '127.0.0.1',
    port,
    workers: [{ config }],
  });
  const url = await runtime.ready;
  return {
    url: url.origin,
    close: () => runtime.dispose(),
  };
}
