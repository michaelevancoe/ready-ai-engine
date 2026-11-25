export const ACK_FALLBACK = "That's really helpful.";

export type AckResult =
  | {
      readonly kind: 'line';
      readonly relevant: boolean;
      readonly line: string;
      readonly clarifyingPrompt: string;
    }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'error' };

export type AckDecision =
  | { readonly action: 'accept'; readonly line: string }
  | { readonly action: 'reask'; readonly prompt: string };

export function acknowledgementLine(result: AckResult): string {
  switch (result.kind) {
    case 'line':
      return result.line.trim().length === 0 ? ACK_FALLBACK : result.line;
    case 'timeout':
    case 'error':
      return ACK_FALLBACK;
    default: {
      const leftover: never = result;
      return leftover;
    }
  }
}

export function decideAck(attempt: number, result: AckResult): AckDecision {
  switch (result.kind) {
    case 'timeout':
    case 'error':
      return { action: 'accept', line: ACK_FALLBACK };
    case 'line':
      if (result.relevant || attempt >= 1) return { action: 'accept', line: acknowledgementLine(result) };
      return { action: 'reask', prompt: result.clarifyingPrompt };
    default: {
      const leftover: never = result;
      return leftover;
    }
  }
}
