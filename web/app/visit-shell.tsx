'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from 'react';
import { FICTIONAL_DATA_LABEL } from '../lib/fictional-label';
import { initialVisit, reduceVisit, type DemoRole, type Visit, type VisitEvent } from '../lib/visit';

interface VisitState {
  visit: Visit;
  dispatch: Dispatch<VisitEvent>;
}

const VisitContext = createContext<VisitState | null>(null);

export function useVisit(): VisitState {
  const state = useContext(VisitContext);
  if (state === null) throw new Error('Visit state is missing.');
  return state;
}

let scrolledId: string | null = null;

function scrollRoom(id: string): void {
  const spacer = document.getElementById('scroll-room');
  const node = document.getElementById(id);
  if (!(spacer instanceof HTMLElement) || node === null) return;
  spacer.style.height = '0px';
  const root = document.scrollingElement ?? document.documentElement;
  const margin = Number.parseFloat(getComputedStyle(node).scrollMarginTop) || 0;
  const top = node.getBoundingClientRect().top + root.scrollTop - margin;
  const shortfall = Math.ceil(top - (root.scrollHeight - root.clientHeight));
  spacer.style.height = shortfall > 0 ? `${shortfall}px` : '0px';
}

function clearScrollRoom(): void {
  const spacer = document.getElementById('scroll-room');
  if (spacer instanceof HTMLElement) spacer.style.height = '0px';
}

export function useScrollWhen(active: boolean, id: string, block: ScrollLogicalPosition = 'start'): void {
  const previous = useRef(active);
  useEffect(() => {
    if (!previous.current && active) {
      scrolledId = id;
      if (block === 'start') scrollRoom(id);
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block });
    }
    previous.current = active;
  }, [active, block, id]);
}

export function VisitShell({ children }: { children: ReactNode }) {
  const [visit, dispatch] = useReducer(reduceVisit, initialVisit());
  const pathname = usePathname();
  const role = roleFor(pathname);
  useEffect(() => {
    scrolledId = null;
    clearScrollRoom();
    dispatch({ type: 'role', role });
    window.scrollTo(0, 0);
  }, [role]);
  useEffect(() => {
    const frame = document.querySelector('.frame');
    const spacer = document.getElementById('scroll-room');
    if (!(frame instanceof HTMLElement) || !(spacer instanceof HTMLElement)) return;
    let last = frame.scrollHeight - spacer.offsetHeight;
    const observer = new ResizeObserver(() => {
      const next = frame.scrollHeight - spacer.offsetHeight;
      if (next > last + 1) {
        if (scrolledId === null) clearScrollRoom();
        else scrollRoom(scrolledId);
      }
      last = frame.scrollHeight - spacer.offsetHeight;
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, [role]);

  return (
    <VisitContext.Provider value={{ visit, dispatch }}>
      <div className="frame">
        <p className="fictional">{FICTIONAL_DATA_LABEL}</p>
        <nav aria-label="Role" className="role-nav">
          <Link href="/" aria-current={role === 'parent' ? 'page' : undefined}>
            Parent
          </Link>
          <Link href="/volunteer" aria-current={role === 'volunteer' ? 'page' : undefined}>
            Volunteer
          </Link>
          <Link href="/leader" aria-current={role === 'leader' ? 'page' : undefined}>
            Leader
          </Link>
        </nav>
        {children}
        <div id="scroll-room" />
      </div>
    </VisitContext.Provider>
  );
}

function roleFor(pathname: string): DemoRole {
  if (pathname === '/volunteer' || pathname.startsWith('/volunteer/')) return 'volunteer';
  if (pathname === '/leader' || pathname.startsWith('/leader/')) return 'leader';
  return 'parent';
}
