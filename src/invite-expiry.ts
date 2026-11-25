export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function inviteExpiresAt(createdAtMs: number): number {
  return createdAtMs + INVITE_TTL_MS;
}

export function inviteOpen(expiresAtMs: number, nowMs: number): boolean {
  return expiresAtMs > nowMs;
}
