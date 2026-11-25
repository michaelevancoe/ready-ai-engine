import type { SocialStory } from './visit.ts';

export type Reader =
  | { readonly phase: 'closed' }
  | { readonly phase: 'writing' }
  | { readonly phase: 'failed' }
  | { readonly phase: 'shown'; readonly title: string; readonly paragraphs: readonly string[] };

export type ReaderEvent =
  | { readonly type: 'open'; readonly saved: SocialStory | null }
  | { readonly type: 'loaded'; readonly value: SocialStory }
  | { readonly type: 'fail' }
  | { readonly type: 'retry' }
  | { readonly type: 'back' };

export function initialReader(): Reader {
  return { phase: 'closed' };
}

export function storyParagraphs(body: string): string[] {
  return body
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

export function reduceReader(reader: Reader, event: ReaderEvent): Reader {
  switch (event.type) {
    case 'open':
      return event.saved === null ? { phase: 'writing' } : shown(event.saved);
    case 'loaded':
      if (reader.phase !== 'writing') return reader;
      return shown(event.value);
    case 'fail':
      if (reader.phase !== 'writing') return reader;
      return { phase: 'failed' };
    case 'retry':
      if (reader.phase !== 'failed') return reader;
      return { phase: 'writing' };
    case 'back':
      return { phase: 'closed' };
    default: {
      const leftover: never = event;
      return leftover;
    }
  }
}

function shown(value: SocialStory): Reader {
  return { phase: 'shown', title: value.title, paragraphs: storyParagraphs(value.body) };
}
