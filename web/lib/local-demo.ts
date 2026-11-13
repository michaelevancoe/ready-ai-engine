export type DemoModelMode = 'mock' | 'live';

export function localDemoEnabled(value: string | undefined): boolean {
  return value === '1';
}

export function demoModelMode(value: string | undefined): DemoModelMode {
  return value === 'live' ? 'live' : 'mock';
}

export function demoEngineOrigin(): string {
  return 'http://127.0.0.1:8787';
}
