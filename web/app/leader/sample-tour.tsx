'use client';

import { createContext, useCallback, useContext, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { DemoStore, type ReadyStore } from '../../lib/ready-store';
import { useDemoMode, useReadyStore } from '../visit-shell';

export type TourStep = 1 | 2 | 3;

interface TourValue {
  readonly exploring: boolean;
  readonly step: TourStep | null;
  readonly closed: number;
  start(): void;
  end(): void;
  next(): void;
}

const TourContext = createContext<TourValue | null>(null);
const SampleStoreContext = createContext<ReadyStore | null>(null);

const COPY = {
  1: {
    title: "Today's children",
    body: 'Each family who finishes the intake shows up here, with where they are: brief ready, notes in, or a note to approve. Tap a child to open them.',
    target: 'children',
  },
  2: {
    title: 'What helps, by Ready',
    body: "Ready condenses the parent's long answers into 3–5 bullets your team can read in seconds. The parent's own words are one tap away.",
    target: 'summary',
  },
  3: {
    title: 'You approve every note',
    body: "After class, Ready drafts a note to the parent from the volunteer's notes. Edit it if you like. Nothing goes to a parent until you approve.",
    target: 'approve',
  },
} as const;

export function useLeaderStore(): ReadyStore {
  const sample = useContext(SampleStoreContext);
  const ready = useReadyStore();
  return sample ?? ready;
}

export function useLeaderTour(): TourValue {
  const tour = useContext(TourContext);
  if (tour === null) throw new Error('Leader tour is missing.');
  return tour;
}

export function LeaderExplore({ children }: { children: ReactNode }): ReactNode {
  const demo = useDemoMode();
  const [exploring, setExploring] = useState(false);
  const [step, setStep] = useState<TourStep | null>(null);
  const [closed, setClosed] = useState(0);
  const sampleRef = useRef<DemoStore | null>(null);
  const stepRef = useRef<TourStep | null>(null);
  stepRef.current = step;
  if (!demo && exploring && sampleRef.current === null) sampleRef.current = new DemoStore();
  const sample = !demo && exploring ? sampleRef.current : null;

  const end = useCallback(() => {
    setStep(null);
    setExploring(false);
    setClosed((count) => count + 1);
  }, []);

  const start = useCallback(() => {
    setExploring(true);
    setStep(1);
  }, []);

  const next = useCallback(() => {
    const current = stepRef.current;
    switch (current) {
      case 1:
        setStep(2);
        return;
      case 2:
        setStep(3);
        return;
      case 3:
        setStep(null);
        setExploring(false);
        setClosed((count) => count + 1);
        return;
      case null:
        return;
      default: {
        const leftover: never = current;
        return leftover;
      }
    }
  }, []);

  const tour = useMemo<TourValue>(
    () => ({ exploring, step, closed, start, end, next }),
    [closed, end, exploring, next, start, step],
  );

  return (
    <TourContext.Provider value={tour}>
      <SampleStoreContext.Provider value={sample}>
        {sample !== null ? <SampleBanner onExit={end} /> : null}
        {children}
        {step !== null ? <TourCoach step={step} onNext={next} onEnd={end} /> : null}
      </SampleStoreContext.Provider>
    </TourContext.Provider>
  );
}

function SampleBanner({ onExit }: { onExit: () => void }): ReactNode {
  return (
    <div className="sample-banner">
      <p>Sample families · not your church</p>
      <button type="button" className="secondary" onClick={onExit}>
        Exit
      </button>
    </div>
  );
}

function TourCoach({ step, onNext, onEnd }: { step: TourStep; onNext: () => void; onEnd: () => void }): ReactNode {
  const copy = COPY[step];
  const dialogRef = useRef<HTMLDivElement>(null);
  const holeRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    dialog?.focus();
    function onKey(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onEnd();
        return;
      }
      if (event.key !== 'Tab' || dialog === null) return;
      const items = focusable(dialog);
      const first = items[0];
      const last = items[items.length - 1];
      if (first === undefined || last === undefined) {
        event.preventDefault();
        return;
      }
      const active = document.activeElement;
      if (event.shiftKey) {
        if (active === first || active === dialog || !dialog.contains(active)) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onEnd, step]);

  useLayoutEffect(() => {
    let frame = 0;
    let tries = 0;
    const run = (): void => {
      const card = dialogRef.current;
      const node = document.querySelector(`[data-tour="${copy.target}"]`);
      if (card === null) return;
      if (!(node instanceof HTMLElement)) {
        if (tries < 40) {
          tries += 1;
          frame = requestAnimationFrame(run);
          return;
        }
        revealCard(card);
        return;
      }
      placeTour(node, card, holeRef.current);
    };
    run();
    window.addEventListener('resize', run);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', run);
    };
  }, [copy.target, step]);

  const primary = step === 3 ? 'Finish tour' : 'Next';
  return (
    <div className="tour-layer">
      <div className="tour-catch" />
      <div ref={holeRef} className="tour-hole" />
      <div
        ref={dialogRef}
        className="tour-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
      >
        <p className="tour-chrome">{step} of 3 · Sample families</p>
        <h2 id="tour-title">{copy.title}</h2>
        <p>{copy.body}</p>
        <div className="tour-actions">
          <button type="button" className="secondary" onClick={onEnd}>
            End tour
          </button>
          <button type="button" className="primary" onClick={onNext}>
            {primary}
          </button>
        </div>
      </div>
    </div>
  );
}

function focusable(dialog: HTMLElement): HTMLElement[] {
  return [...dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea')].filter(
    (node) => !node.hasAttribute('disabled'),
  );
}

function revealCard(card: HTMLElement): void {
  const margin = 8;
  const frame = document.querySelector('.frame');
  const frameRect = frame instanceof HTMLElement ? frame.getBoundingClientRect() : null;
  card.style.left = `${frameRect?.left ?? margin}px`;
  card.style.width = `${frameRect?.width ?? Math.max(0, window.innerWidth - margin * 2)}px`;
  card.style.top = 'auto';
  card.style.bottom = `${margin}px`;
  card.style.visibility = 'visible';
  card.style.opacity = '1';
  if (!card.contains(document.activeElement)) card.focus();
}

function placeTour(target: HTMLElement, card: HTMLElement, hole: HTMLElement | null): void {
  const gap = 12;
  const margin = 8;
  const pad = 6;
  const frame = document.querySelector('.frame');
  const frameRect = frame instanceof HTMLElement ? frame.getBoundingClientRect() : null;
  const left = frameRect?.left ?? margin;
  const width = frameRect?.width ?? Math.max(0, window.innerWidth - margin * 2);
  card.style.left = `${left}px`;
  card.style.width = `${width}px`;
  card.style.bottom = 'auto';
  const banner = document.querySelector('.sample-banner');
  const limitTop = (banner instanceof HTMLElement ? banner.getBoundingClientRect().bottom : 0) + margin;
  const cardHeight = card.offsetHeight;
  target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  let rect = target.getBoundingClientRect();
  const needed = cardHeight + gap;
  const roomAbove = (): number => rect.top - limitTop;
  const roomBelow = (): number => window.innerHeight - rect.bottom - margin;
  if (roomBelow() >= roomAbove()) {
    if (roomBelow() < needed) {
      window.scrollBy(0, needed - roomBelow());
      rect = target.getBoundingClientRect();
    }
  } else if (roomAbove() < needed) {
    window.scrollBy(0, roomAbove() - needed);
    rect = target.getBoundingClientRect();
  }
  const below = roomBelow() >= needed || roomBelow() >= roomAbove();
  let top = below ? rect.bottom + gap : rect.top - gap - cardHeight;
  if (!below && top < limitTop) {
    window.scrollBy(0, top - limitTop);
    rect = target.getBoundingClientRect();
    top = rect.top - gap - cardHeight;
  }
  if (below && top + cardHeight > window.innerHeight - margin) {
    const shift = top + cardHeight - (window.innerHeight - margin);
    window.scrollBy(0, shift);
    rect = target.getBoundingClientRect();
    top = rect.bottom + gap;
  }
  if (top < rect.bottom && top + cardHeight > rect.top) {
    top = limitTop;
    const desired = top + cardHeight + gap;
    window.scrollBy(0, rect.top - desired);
    rect = target.getBoundingClientRect();
    top = Math.max(limitTop, rect.top - gap - cardHeight);
    if (top + cardHeight > rect.top) top = limitTop;
  }
  card.style.top = `${Math.max(limitTop, top)}px`;
  card.style.visibility = 'visible';
  card.style.opacity = '1';
  if (!card.contains(document.activeElement)) card.focus();
  if (hole === null) return;
  hole.style.top = `${rect.top - pad}px`;
  hole.style.left = `${rect.left - pad}px`;
  hole.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
  hole.style.height = `${Math.max(0, rect.height + pad * 2)}px`;
  hole.style.visibility = 'visible';
  hole.style.opacity = '1';
}
