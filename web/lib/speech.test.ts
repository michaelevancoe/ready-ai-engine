import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  listen,
  speechSupport,
  type Recognition,
  type RecognitionEvent,
} from './speech.ts';

test('speech support is missing when the browser API is absent', () => {
  assert.equal(speechSupport(), 'missing');
  const idle = listen(() => {
    throw new Error('no recognition');
  });
  idle.stop();
});

test('a fake recognition delivers the transcript and the module writes no audio', () => {
  const heard: string[] = [];
  const fake = fakeRecognition();
  const session = listen((text) => heard.push(text), fake.recognition);
  fake.emit('Head', false);
  fake.emit('Headphones.', true);
  assert.deepEqual(heard, ['Head', 'Headphones.']);
  session.stop();
  assert.equal(fake.stopped, true);
  assert.equal(fake.started, true);
  const source = readFileSync(new URL('./speech.ts', import.meta.url), 'utf8');
  assert.equal(source.includes('MediaRecorder'), false);
  assert.equal(source.includes('mediaDevices'), false);
  assert.equal(source.includes('audio/'), false);
});

function fakeRecognition(): { recognition: Recognition; started: boolean; stopped: boolean; emit(text: string, final: boolean): void } {
  let started = false;
  let stopped = false;
  const recognition: Recognition = {
    continuous: false,
    interimResults: false,
    lang: '',
    onresult: null,
    onerror: null,
    onend: null,
    start() {
      started = true;
    },
    stop() {
      stopped = true;
    },
  };
  return {
    recognition,
    get started() {
      return started;
    },
    get stopped() {
      return stopped;
    },
    emit(text: string, final: boolean) {
      const event: RecognitionEvent = {
        resultIndex: 0,
        results: { length: 1, 0: { isFinal: final, length: 1, 0: { transcript: text } } },
      };
      recognition.onresult?.(event);
    },
  };
}
