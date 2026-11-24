export function deadline(timeoutMs: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort(new DOMException('timed out', 'TimeoutError'));
  }, timeoutMs);
  return {
    signal: controller.signal,
    done: () => {
      clearTimeout(timer);
    },
  };
}
