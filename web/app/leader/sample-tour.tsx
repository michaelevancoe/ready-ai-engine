'use client';

import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
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
  const store = useLeaderStore();
  const selectedId = useSyncExternalStore(store.subscribe, store.selectedId, store.selectedId);
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
    const card = dialogRef.current;
    if (card === null) return;
    const hole = holeRef.current;
    let frame = 0;
    let settle = 0;
    const targetOf = (): HTMLElement | null => {
      const node = document.querySelector(`[data-tour="${copy.target}"]`);
      return node instanceof HTMLElement ? node : null;
    };
    const place = (): void => {
      const spacer = document.getElementById('scroll-room');
      if (spacer instanceof HTMLElement) spacer.style.height = '0px';
      const node = targetOf();
      if (node === null) {
        revealCard(card);
        return;
      }
      node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      if (!pinTour(node, card, hole)) openRoom(node, card, hole);
    };
    const onScroll = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const node = targetOf();
        if (node === null) revealCard(card);
        else pinTour(node, card, hole);
      });
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const node = targetOf();
        if (node !== null && !pinTour(node, card, hole)) openRoom(node, card, hole);
      }, 80);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(settle);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', onScroll, true);
      const spacer = document.getElementById('scroll-room');
      if (spacer instanceof HTMLElement) spacer.style.height = '0px';
    };
  }, [copy.target, selectedId, step]);

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
  const frame = frameBox();
  card.style.left = `${frame.left}px`;
  card.style.width = `${frame.width}px`;
  card.style.top = 'auto';
  card.style.bottom = `${tourMargin}px`;
  card.style.visibility = 'visible';
  card.style.opacity = '1';
  if (!card.contains(document.activeElement)) card.focus();
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const tourGap = 12;
const tourMargin = 8;
const tourPad = 6;
const sideMin = 220;

function pinTour(target: HTMLElement, card: HTMLElement, hole: HTMLElement | null): boolean {
  const frame = frameBox();
  const topLimit = tourLimitTop();
  const rect = target.getBoundingClientRect();
  const targetBox: Box = { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
  const stacked = cardHeightFor(card, frame.width);
  const candidates: Box[] = [
    { left: frame.left, width: frame.width, top: rect.bottom + tourGap, height: stacked },
    { left: frame.left, width: frame.width, top: rect.top - tourGap - stacked, height: stacked },
  ];
  const viewRight = window.innerWidth - tourMargin;
  const rightRoom = viewRight - (rect.right + tourGap);
  const leftRoom = rect.left - tourGap - tourMargin;
  if (rightRoom >= sideMin) {
    const width = Math.min(frame.width, rightRoom);
    const height = cardHeightFor(card, width);
    candidates.push({
      left: rect.right + tourGap,
      width,
      top: sideTop(rect.top, height, topLimit),
      height,
    });
  }
  if (leftRoom >= sideMin) {
    const width = Math.min(frame.width, leftRoom);
    const height = cardHeightFor(card, width);
    candidates.push({
      left: rect.left - tourGap - width,
      width,
      top: sideTop(rect.top, height, topLimit),
      height,
    });
  }
  const spot = candidates.find((box) => spotFits(box, targetBox, topLimit));
  if (spot === undefined) return false;
  card.style.bottom = 'auto';
  card.style.left = `${spot.left}px`;
  card.style.width = `${spot.width}px`;
  card.style.top = `${spot.top}px`;
  card.style.visibility = 'visible';
  card.style.opacity = '1';
  if (!card.contains(document.activeElement)) card.focus();
  paintHole(hole, rect);
  return true;
}

function openRoom(target: HTMLElement, card: HTMLElement, hole: HTMLElement | null): void {
  const frame = frameBox();
  const needed = cardHeightFor(card, frame.width) + tourGap;
  const topLimit = tourLimitTop();
  const viewBottom = window.innerHeight - tourMargin;
  const rect = target.getBoundingClientRect();
  const roomAbove = rect.top - topLimit;
  const roomBelow = viewBottom - rect.bottom;
  if (roomBelow >= roomAbove) moveTarget(target, rect.bottom - (viewBottom - needed));
  else moveTarget(target, rect.top - (topLimit + needed));
  pinTour(target, card, hole);
}

function frameBox(): { left: number; width: number } {
  const frame = document.querySelector('.frame');
  if (frame instanceof HTMLElement) {
    const rect = frame.getBoundingClientRect();
    return { left: rect.left, width: rect.width };
  }
  return { left: tourMargin, width: Math.max(0, window.innerWidth - tourMargin * 2) };
}

function tourLimitTop(): number {
  const banner = document.querySelector('.sample-banner');
  const bannerBottom = banner instanceof HTMLElement ? banner.getBoundingClientRect().bottom : 0;
  return Math.max(tourMargin, bannerBottom + tourMargin);
}

function cardHeightFor(card: HTMLElement, width: number): number {
  card.style.width = `${width}px`;
  return card.offsetHeight;
}

function sideTop(targetTop: number, height: number, topLimit: number): number {
  const viewBottom = window.innerHeight - tourMargin;
  let top = Math.max(topLimit, targetTop);
  if (top + height > viewBottom) top = viewBottom - height;
  return top;
}

function spotFits(box: Box, target: Box, topLimit: number): boolean {
  const viewBottom = window.innerHeight - tourMargin;
  const viewRight = window.innerWidth - tourMargin;
  return (
    box.top >= topLimit - 0.5 &&
    box.left >= tourMargin - 0.5 &&
    box.left + box.width <= viewRight + 0.5 &&
    box.top + box.height <= viewBottom + 0.5 &&
    !overlaps(box, target)
  );
}

function overlaps(a: Box, b: Box): boolean {
  const width = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const height = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return width > 0.5 && height > 0.5;
}

function paintHole(hole: HTMLElement | null, rect: DOMRect): void {
  if (hole === null) return;
  hole.style.top = `${rect.top - tourPad}px`;
  hole.style.left = `${rect.left - tourPad}px`;
  hole.style.width = `${Math.max(0, rect.width + tourPad * 2)}px`;
  hole.style.height = `${Math.max(0, rect.height + tourPad * 2)}px`;
  hole.style.visibility = 'visible';
  hole.style.opacity = '1';
}

function moveTarget(target: HTMLElement, delta: number): DOMRect {
  if (delta !== 0) {
    const root = document.scrollingElement ?? document.documentElement;
    if (delta > 0) {
      const spare = root.scrollHeight - root.clientHeight - root.scrollTop;
      const spacer = document.getElementById('scroll-room');
      if (spacer instanceof HTMLElement && spare < delta) {
        const current = Number.parseFloat(spacer.style.height) || 0;
        spacer.style.height = `${current + delta - spare}px`;
      }
    }
    root.scrollBy(0, delta);
  }
  return target.getBoundingClientRect();
}
