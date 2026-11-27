import type { Visit } from './visit.ts';

export type WhatHelpsAudience = 'review' | 'sample' | 'team';

export function whatHelpsNote(audience: WhatHelpsAudience): string {
  switch (audience) {
    case 'review':
      return 'Ready wrote this from your answers. Check it before you approve: volunteers see it at the top of the brief.';
    case 'sample':
      return 'Sample summary (pre-written)';
    case 'team':
      return "Written by Ready from the parent's approved answers. The parent's own words are below.";
    default: {
      const leftover: never = audience;
      return leftover;
    }
  }
}

export function visitWhatHelps(visit: Visit): readonly string[] {
  const intake = visit.intake;
  switch (intake.status) {
    case 'idle':
    case 'submitting':
      return [];
    case 'draft':
    case 'approving':
    case 'approved':
      return intake.profile.whatHelps;
    case 'error':
      return intake.retry === 'approve' ? intake.profile.whatHelps : [];
    default: {
      const leftover: never = intake;
      return leftover;
    }
  }
}
