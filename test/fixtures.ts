import type { ChildProfile } from '../src/profile.ts';
import { fictionalDemoEnv } from '../src/demo-env.ts';
import { churchStore, ids, MemoryStore } from '../src/memory-store.ts';
import { sessionToken } from '../src/session-auth.ts';

export { churchStore, ids, MemoryStore };
export const testEnv = fictionalDemoEnv;

export const nowMs = 1_700_000_000_000;

export function sampleProfile(): ChildProfile {
  return {
    summary: 'Prefers a quiet corner.',
    sensoryConsiderations: ['loud music'],
    supportStrategies: ['offer a quiet seat'],
    avoid: ['surprises'],
    volunteerGuidance: 'Explain the next activity first.',
    whatHelps: ['Offer a quiet seat.', 'Give a warning before music.', 'Explain the next activity first.'],
  };
}

export function chatEnvelope(content: unknown, status = 200): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { role: 'assistant', content: JSON.stringify(content) } }],
    }),
    { status, headers: { 'content-type': 'application/json' } },
  );
}

export async function bearer(userId: string): Promise<string> {
  return `Bearer ${sessionToken(userId)}`;
}

export function intakeBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    organizationId: ids.org,
    childId: ids.rowan,
    answers: {
      preferredName: 'Rowan',
      ageYears: 7,
      sensoryNotes: 'SENSORY-NOTE-ORANGE-BLOCK',
      supportNeeds: 'A quiet seat near the door.',
      whatHelps: 'A warning before music.',
      whatToAvoid: 'Surprise loud songs.',
    },
    ...overrides,
  };
}
