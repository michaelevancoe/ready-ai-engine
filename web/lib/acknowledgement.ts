export const ACK_FALLBACK = "That's really helpful.";

export type AckResult =
  | { readonly kind: 'line'; readonly text: string }
  | { readonly kind: 'timeout' }
  | { readonly kind: 'error' };

export function acknowledgementLine(result: AckResult): string {
  switch (result.kind) {
    case 'line':
      return result.text.trim().length === 0 ? ACK_FALLBACK : result.text;
    case 'timeout':
    case 'error':
      return ACK_FALLBACK;
    default: {
      const leftover: never = result;
      return leftover;
    }
  }
}
