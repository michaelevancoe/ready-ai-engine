'use client';

import { useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from 'react';
import {
  familyStartLink,
  volunteerStartLink,
  type OnboardingAction,
  type OnboardingState,
  type OnboardingStep,
} from '../../lib/leader-onboarding';
import type { ChurchSetup } from '../../lib/visit';

const CLASSROOM_FIELDS = [
  ['name', 'Church name'],
  ['room', 'Room'],
  ['service', 'Sunday time'],
  ['leader', 'Your name, as families see it'],
  ['ages', 'Ages'],
] as const satisfies ReadonlyArray<readonly [keyof ChurchSetup, string]>;

export function setupReplacesHome(state: OnboardingState): boolean {
  switch (state.status) {
    case 'new':
    case 'in-progress':
    case 'finish':
      return true;
    case 'skipped':
    case 'done':
      return false;
    default: {
      const leftover: never = state;
      return leftover;
    }
  }
}

export function SetupScreens({
  state,
  dispatch,
  church,
  onSaveChurch,
  onExplore,
}: {
  state: OnboardingState;
  dispatch: (action: OnboardingAction) => void;
  church: ChurchSetup;
  onSaveChurch: (church: ChurchSetup) => void;
  onExplore: () => void;
}): ReactNode {
  const screen = screenFor(state);
  switch (screen) {
    case 'welcome':
      return (
        <Welcome
          onStart={() => dispatch({ type: 'start' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onExplore={onExplore}
        />
      );
    case 'classroom':
      return (
        <Classroom
          church={church}
          onBack={() => dispatch({ type: 'back' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onSave={(next) => {
            onSaveChurch(next);
            dispatch({ type: 'next' });
          }}
        />
      );
    case 'family':
      return (
        <ShareLink
          step={3}
          title="Family link"
          fieldLabel="Family link"
          linkFor={familyStartLink}
          intro="Parents open this link and answer the intake on their own phone."
          onBack={() => dispatch({ type: 'back' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onNext={() => dispatch({ type: 'next' })}
        />
      );
    case 'volunteer':
      return (
        <ShareLink
          step={4}
          title="Volunteer link"
          fieldLabel="Volunteer link"
          linkFor={volunteerStartLink}
          intro="Named volunteer invites are coming later. Nothing is sent and no accounts are created from this screen."
          onBack={() => dispatch({ type: 'back' })}
          onSkip={() => dispatch({ type: 'skip' })}
          onNext={() => dispatch({ type: 'next' })}
        />
      );
    case 'finish':
      return (
        <Finish
          churchName={church.name}
          onHome={() => dispatch({ type: 'finish' })}
          onExplore={() => {
            dispatch({ type: 'finish' });
            onExplore();
          }}
        />
      );
    case null:
      return null;
    default: {
      const leftover: never = screen;
      return leftover;
    }
  }
}

export function ResumeCard({
  step,
  onResume,
  onDismiss,
}: {
  step: OnboardingStep;
  onResume: () => void;
  onDismiss: () => void;
}): ReactNode {
  return (
    <section className="resume-card" aria-label="Finish setting up your classroom">
      <div className="resume-row">
        <p className="eyebrow">SETUP · {step} OF 4</p>
        <button type="button" className="text dismiss" aria-label="Dismiss setup reminder" onClick={onDismiss}>
          ×
        </button>
      </div>
      <p className="resume-title">Finish setting up your classroom</p>
      <button type="button" className="primary" onClick={onResume}>
        Resume
      </button>
    </section>
  );
}

export function SettingsCard({ onReplay, onExplore }: { onReplay: () => void; onExplore: () => void }): ReactNode {
  return (
    <section className="settings-card" aria-label="Welcome and samples">
      <button type="button" className="secondary" onClick={onReplay}>
        Show welcome again
      </button>
      <button type="button" className="secondary" onClick={onExplore}>
        Explore with sample families
      </button>
    </section>
  );
}

function Welcome({
  onStart,
  onSkip,
  onExplore,
}: {
  onStart: () => void;
  onSkip: () => void;
  onExplore: () => void;
}): ReactNode {
  return (
    <main>
      <SetupTop step={1} onSkip={onSkip} />
      <h1>Welcome to Ready</h1>
      <ol className="welcome-points">
        <li>
          <h2>Parents share.</h2>
          <p>A parent answers a short, friendly intake. Ready turns it into a brief and a personal Sunday story.</p>
        </li>
        <li>
          <h2>Volunteers prepare.</h2>
          <p>Volunteers read a short &quot;What helps&quot; summary before the child arrives.</p>
        </li>
        <li>
          <h2>You stay in the loop.</h2>
          <p>You see every child, read their brief, and approve each note Ready drafts for parents.</p>
        </li>
      </ol>
      <button type="button" className="primary" onClick={onStart}>
        Set up my classroom
      </button>
      <button type="button" className="secondary" onClick={onExplore}>
        Explore with sample families
      </button>
      <p className="setup-note">About 2 minutes. Skip anytime and come back from Church settings.</p>
    </main>
  );
}

function Classroom({
  church,
  onBack,
  onSkip,
  onSave,
}: {
  church: ChurchSetup;
  onBack: () => void;
  onSkip: () => void;
  onSave: (church: ChurchSetup) => void;
}): ReactNode {
  const [draft, setDraft] = useState(church);

  function onSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSave({
      ...church,
      name: draft.name,
      room: draft.room,
      service: draft.service,
      leader: draft.leader,
      ages: draft.ages,
    });
  }

  return (
    <main>
      <SetupTop step={2} onSkip={onSkip} onBack={onBack} />
      <h1>Your classroom</h1>
      <form onSubmit={onSubmit}>
        {CLASSROOM_FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`setup-${key}`}>{label}</label>
            <input
              id={`setup-${key}`}
              name={key}
              value={draft[key]}
              autoComplete="off"
              onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
            />
          </div>
        ))}
        <button type="submit" className="primary">
          Continue
        </button>
      </form>
    </main>
  );
}

function ShareLink({
  step,
  title,
  fieldLabel,
  linkFor,
  intro,
  onBack,
  onSkip,
  onNext,
}: {
  step: OnboardingStep;
  title: string;
  fieldLabel: string;
  linkFor: (origin: string) => string;
  intro: string;
  onBack: () => void;
  onSkip: () => void;
  onNext: () => void;
}): ReactNode {
  const origin = useOrigin();
  const link = origin === '' ? '' : linkFor(origin);
  return (
    <main>
      <SetupTop step={step} onSkip={onSkip} onBack={onBack} />
      <h1>{title}</h1>
      <p>{intro}</p>
      <LinkField label={fieldLabel} value={link} />
      <button type="button" className="primary" onClick={onNext}>
        Continue
      </button>
    </main>
  );
}

function LinkField({ label, value }: { label: string; value: string }): ReactNode {
  const field = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  async function onCopy(): Promise<void> {
    const ok = await copyLink(value, field.current);
    if (ok) setCopied(true);
  }

  return (
    <div className="link-field">
      <input ref={field} readOnly value={value} aria-label={label} autoComplete="off" />
      <button type="button" className="secondary" onClick={() => void onCopy()}>
        Copy link
      </button>
      {copied ? <p role="status">Copied</p> : null}
    </div>
  );
}

function Finish({
  churchName,
  onHome,
  onExplore,
}: {
  churchName: string;
  onHome: () => void;
  onExplore: () => void;
}): ReactNode {
  return (
    <main>
      <h1>You&apos;re set</h1>
      <p>Your classroom at {churchName} is ready.</p>
      <button type="button" className="primary" onClick={onHome}>
        Go to leader home
      </button>
      <button type="button" className="secondary" onClick={onExplore}>
        Explore with sample families
      </button>
      <p className="setup-note">Change any of this later in Church settings.</p>
    </main>
  );
}

function SetupTop({
  step,
  onSkip,
  onBack,
}: {
  step: OnboardingStep;
  onSkip: () => void;
  onBack?: () => void;
}): ReactNode {
  return (
    <div className={onBack ? 'setup-top with-back' : 'setup-top'}>
      {onBack ? (
        <button type="button" className="text back" onClick={onBack}>
          Back
        </button>
      ) : null}
      <p className="eyebrow">Step {step} of 4</p>
      <button type="button" className="text" onClick={onSkip}>
        Skip for now
      </button>
    </div>
  );
}

function useOrigin(): string {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => '',
  );
}

async function copyLink(value: string, field: HTMLInputElement | null): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    try {
      if (field === null) return false;
      field.focus();
      field.select();
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

type SetupScreen = 'welcome' | 'classroom' | 'family' | 'volunteer' | 'finish' | null;

function screenFor(state: OnboardingState): SetupScreen {
  switch (state.status) {
    case 'new':
      return 'welcome';
    case 'in-progress':
      return screenForStep(state.step);
    case 'finish':
      return 'finish';
    case 'skipped':
    case 'done':
      return null;
    default: {
      const leftover: never = state;
      return leftover;
    }
  }
}

function screenForStep(step: OnboardingStep): SetupScreen {
  switch (step) {
    case 1:
      return 'welcome';
    case 2:
      return 'classroom';
    case 3:
      return 'family';
    case 4:
      return 'volunteer';
    default: {
      const leftover: never = step;
      return leftover;
    }
  }
}
