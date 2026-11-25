import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

const lockDir = '/tmp/ready-account-e2e.lock';
const epochPath = '/tmp/ready-account-e2e.epoch';

export async function withE2eLock<T>(body: (epoch: number) => Promise<T>): Promise<T> {
  await acquireLock();
  try {
    return await body(readEpoch());
  } finally {
    rmSync(lockDir, { recursive: true, force: true });
  }
}

export function bumpE2eEpoch(): number {
  const next = readEpoch() + 1;
  writeFileSync(epochPath, String(next));
  return next;
}

function readEpoch(): number {
  try {
    const value = Number(readFileSync(epochPath, 'utf8'));
    if (!Number.isInteger(value) || value < 0) return 0;
    return value;
  } catch {
    return 0;
  }
}

async function acquireLock(): Promise<void> {
  for (;;) {
    try {
      mkdirSync(lockDir);
      return;
    } catch (error) {
      if (!lockHeld(error)) throw error;
      await delay(20);
    }
  }
}

function lockHeld(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
