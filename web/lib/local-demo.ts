export function localDemoEnabled(value: string | undefined): boolean {
  return value === '1';
}

export function demoEngineOrigin(): string {
  return 'http://127.0.0.1:8787';
}
