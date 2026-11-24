export interface RecognitionAlternative {
  readonly transcript: string;
}

export interface RecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: RecognitionAlternative;
}

export interface RecognitionEvent {
  readonly resultIndex: number;
  readonly results: ArrayLike<RecognitionResult>;
}

export interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

interface RecognitionHost {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
}

export function speechSupport(): 'ready' | 'missing' {
  return recognitionCtor() === null ? 'missing' : 'ready';
}

export function listen(
  onText: (text: string) => void,
  recognition?: Recognition,
  onStop?: () => void,
): { stop(): void } {
  const session = recognition ?? startRecognition();
  if (session === null) return { stop() {} };
  session.continuous = true;
  session.interimResults = true;
  session.lang = 'en-US';
  let closed = false;
  session.onresult = (event: RecognitionEvent) => {
    if (closed) return;
    onText(transcriptOf(event));
  };
  session.onerror = () => {
    if (closed) return;
    onStop?.();
  };
  session.onend = () => {
    if (closed) return;
    onStop?.();
  };
  session.start();
  return {
    stop() {
      closed = true;
      session.onresult = null;
      session.onerror = null;
      session.onend = null;
      session.stop();
    },
  };
}

function startRecognition(): Recognition | null {
  const Factory = recognitionCtor();
  if (Factory === null) return null;
  return new Factory();
}

function recognitionCtor(): (new () => Recognition) | null {
  const host = globalThis as RecognitionHost;
  const found = host.SpeechRecognition ?? host.webkitSpeechRecognition;
  return typeof found === 'function' ? found : null;
}

function transcriptOf(event: RecognitionEvent): string {
  let text = '';
  for (let index = 0; index < event.results.length; index += 1) {
    const result = event.results[index];
    const spoken = result?.[0];
    if (spoken === undefined) continue;
    text += spoken.transcript;
  }
  return text;
}
