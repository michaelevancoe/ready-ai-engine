'use client';

import { useState, useSyncExternalStore, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { postLesson, postSundayUpdate } from '../../lib/drafts';
import {
  checkInBrief,
  childAgeYears,
  childPreferredName,
  type BriefLine,
  type ChurchSetup,
  type LessonAdaptation,
  type Visit,
} from '../../lib/visit';
import { useReadyStore, useScrollWhen } from '../visit-shell';

const CHURCH_FIELDS = [
  ['name', 'Church name'],
  ['service', 'Service'],
  ['room', 'Room'],
  ['leader', 'Leader'],
  ['ages', 'Ages'],
  ['plan', 'Plan'],
] as const satisfies ReadonlyArray<readonly [keyof ChurchSetup, string]>;

type Screen = 'home' | 'sunday' | 'draft' | 'after' | 'settings';

export default function LeaderPage() {
  const store = useReadyStore();
  const visit = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { dispatch } = store;
  const brief = checkInBrief(visit);
  const name = childPreferredName(visit);
  const age = childAgeYears(visit);
  const [screen, setScreen] = useState<Screen>('home');
  const [saved, setSaved] = useState(false);
  const [lessonText, setLessonText] = useState(visit.lessonSource);
  const [church, setChurch] = useState(visit.church);
  useScrollWhen(visit.update.phase === 'writing', 'update-status');
  useScrollWhen(visit.update.phase === 'ready', 'update-draft');
  useScrollWhen(visit.lesson.phase === 'writing', 'lesson-status');
  useScrollWhen(visit.lesson.phase === 'ready', 'lesson-draft');

  function showHome(): void {
    setScreen('home');
  }

  function openSettings(): void {
    setChurch(visit.church);
    setSaved(false);
    setScreen('settings');
  }

  function openLesson(): void {
    if (brief.status !== 'approved') return;
    setSaved(false);
    if (visit.lesson.phase === 'ready' || visit.lesson.phase === 'approved') {
      setScreen('draft');
      return;
    }
    setLessonText(visit.lessonSource);
    setScreen('sunday');
  }

  function openAfter(): void {
    if (visit.notes.trim() === '') return;
    setSaved(false);
    setScreen('after');
  }

  function onSaveChurch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    dispatch({ type: 'saveChurch', church });
    setSaved(true);
    setScreen('home');
  }

  async function onAdapt(): Promise<void> {
    if (brief.status !== 'approved' || visit.lesson.phase === 'writing') return;
    const source = lessonText.trim();
    if (source.length === 0) return;
    const lines = brief.lines;
    dispatch({ type: 'writeLesson', source });
    const result = await postLesson(source, lines, name);
    if (result.ok) {
      dispatch({ type: 'lessonReady', value: result.value });
      setScreen((current) => (current === 'sunday' ? 'draft' : current));
      return;
    }
    dispatch({ type: 'lessonFailed', message: result.message });
  }

  async function onWriteNote(): Promise<void> {
    if (visit.role !== 'leader' || visit.notes.trim() === '' || visit.update.phase === 'writing') return;
    dispatch({ type: 'writeUpdate' });
    const result = await postSundayUpdate(visit.notes, name);
    if (result.ok) dispatch({ type: 'updateReady', value: result.value });
    else dispatch({ type: 'updateFailed', message: result.message });
  }

  function onApproveNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('parentNote');
    dispatch({ type: 'approveUpdate', body: typeof value === 'string' ? value : '' });
  }

  function onApproveLesson(value: LessonAdaptation): void {
    dispatch({ type: 'approveLesson', value });
    setScreen('home');
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        church={church}
        onChange={setChurch}
        onSave={onSaveChurch}
        onHome={showHome}
      />
    );
  }
  if (screen === 'sunday' && brief.status === 'approved') {
    return (
      <LessonScreen
        name={name}
        lines={brief.lines}
        lessonText={lessonText}
        phase={visit.lesson.phase}
        failure={visit.lesson.phase === 'failed' ? visit.lesson.message : null}
        onChange={setLessonText}
        onAdapt={() => void onAdapt()}
        onHome={showHome}
      />
    );
  }
  const lesson = visit.lesson;
  if (screen === 'draft' && (lesson.phase === 'ready' || lesson.phase === 'approved')) {
    return (
      <DraftScreen
        name={name}
        value={lesson.value}
        viewing={lesson.phase === 'approved'}
        onApprove={onApproveLesson}
        onHome={showHome}
      />
    );
  }
  if (screen === 'after' && visit.notes.trim() !== '') {
    return (
      <AfterScreen
        visit={visit}
        name={name}
        onWrite={() => void onWriteNote()}
        onApprove={onApproveNote}
        onHome={showHome}
      />
    );
  }

  return (
    <main>
      {saved ? <p role="status">Saved</p> : null}
      <div className="top-bar">
        <p className="eyebrow">
          {visit.church.room} · {visit.church.service}
        </p>
        <button type="button" className="text" onClick={openSettings}>
          Church settings
        </button>
      </div>
      <h1>Good morning, {visit.church.leader}</h1>
      <p>
        {name} is at {visit.church.name}. This Sunday comes first, then After Sunday.
      </p>
      <SundayCard
        name={name}
        age={age}
        waiting={brief.status !== 'approved'}
        approved={visit.lesson.phase === 'approved'}
        onOpen={openLesson}
      />
      <AfterCard
        name={name}
        notes={visit.notes}
        sent={visit.update.phase === 'approved'}
        onOpen={openAfter}
      />
    </main>
  );
}

function SundayCard({
  name,
  age,
  waiting,
  approved,
  onOpen,
}: {
  name: string;
  age: number;
  waiting: boolean;
  approved: boolean;
  onOpen: () => void;
}) {
  const tag = waiting ? 'waiting' : approved ? 'approved' : 'ready';
  const label = waiting ? "Waiting on parent's brief" : approved ? 'Approved' : 'Ready to adapt';
  const body = (
    <>
      <p className="eyebrow">
        THIS SUNDAY · {name.toUpperCase()}, {age}
      </p>
      <h2>Lesson for {name}</h2>
      {waiting ? (
        <p>
          Waiting on {name}&apos;s parent to approve the brief. Once they do, you can paste the lesson and adapt it
          here.
        </p>
      ) : null}
      <span className={tagClass(tag)}>{label}</span>
    </>
  );
  if (waiting) return <article className="home-card">{body}</article>;
  return (
    <button type="button" className="home-card" onClick={onOpen}>
      {body}
    </button>
  );
}

function AfterCard({
  name,
  notes,
  sent,
  onOpen,
}: {
  name: string;
  notes: string;
  sent: boolean;
  onOpen: () => void;
}) {
  const empty = notes.trim() === '';
  const tag = empty ? 'plain' : sent ? 'approved' : 'ready';
  const label = empty ? 'No notes yet' : sent ? 'Sent to parent' : 'Notes from Theo';
  const body = (
    <>
      <h2>Notes from Theo Park</h2>
      {empty ? (
        <p>No notes yet. Theo adds them after class, then you can draft a note for {name}&apos;s parent.</p>
      ) : null}
      <span className={tagClass(tag)}>{label}</span>
    </>
  );
  if (empty) return <article className="home-card">{body}</article>;
  return (
    <button type="button" className="home-card" onClick={onOpen}>
      {body}
    </button>
  );
}

function LessonScreen({
  name,
  lines,
  lessonText,
  phase,
  failure,
  onChange,
  onAdapt,
  onHome,
}: {
  name: string;
  lines: readonly BriefLine[];
  lessonText: string;
  phase: Visit['lesson']['phase'];
  failure: string | null;
  onChange: (value: string) => void;
  onAdapt: () => void;
  onHome: () => void;
}) {
  const writing = phase === 'writing';
  return (
    <main>
      <Back onHome={onHome} />
      <span className={tagClass('approved')}>Brief approved</span>
      <p>{name}&apos;s parent approved the brief.</p>
      <article className="brief-card">
        <h2>From {name}&apos;s approved brief</h2>
        <ul>
          {lines.map((line) => (
            <li key={line.field}>{line.text}</li>
          ))}
        </ul>
      </article>
      <label htmlFor="fictional-lesson">Lesson (fictional)</label>
      <textarea
        id="fictional-lesson"
        rows={5}
        value={lessonText}
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      <button type="button" className="primary" disabled={writing || lessonText.trim() === ''} onClick={onAdapt}>
        Adapt for {name}
      </button>
      {writing ? (
        <p id="lesson-status" className="draft-status" role="status">
          Writing the draft.
        </p>
      ) : null}
      {failure === null ? null : <p role="alert">{failure}</p>}
      <p className="hint">Ready writes a draft. Volunteers see nothing until you approve it.</p>
    </main>
  );
}

function DraftScreen({
  name,
  value,
  viewing,
  onApprove,
  onHome,
}: {
  name: string;
  value: LessonAdaptation;
  viewing: boolean;
  onApprove: (value: LessonAdaptation) => void;
  onHome: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [summary, setSummary] = useState(value.summary);
  const [steps, setSteps] = useState<string[]>([...value.steps]);
  const cleaned = steps.map((step) => step.trim()).filter((step) => step.length > 0);
  const showEditor = editing && !viewing;

  function approve(): void {
    if (summary.trim().length === 0 || cleaned.length === 0) return;
    onApprove({ summary: summary.trim(), steps: cleaned });
  }

  return (
    <main>
      <Back onHome={onHome} />
      <section id="lesson-draft" aria-label="Lesson adaptation">
        <span className={tagClass(viewing ? 'approved' : 'ready')}>
          {viewing ? 'Approved' : 'AI draft · needs your OK'}
        </span>
        <h1>Lesson for {name}</h1>
        <article className="lesson-card">
          <p className="eyebrow">Summary</p>
          {showEditor ? (
            <>
              <label className="sr-only" htmlFor="lesson-summary">
                Summary
              </label>
              <textarea
                id="lesson-summary"
                rows={3}
                value={summary}
                autoComplete="off"
                onChange={(event) => setSummary(event.target.value)}
              />
            </>
          ) : (
            <p>{summary}</p>
          )}
        </article>
        <article className="lesson-card">
          <p className="eyebrow">Steps</p>
          <ol>
            {steps.map((step, index) => (
              <li key={`${index}-${showEditor ? 'edit' : step}`}>
                {showEditor ? (
                  <>
                    <label className="sr-only" htmlFor={`lesson-step-${index}`}>
                      Step {index + 1}
                    </label>
                    <input
                      id={`lesson-step-${index}`}
                      value={step}
                      autoComplete="off"
                      onChange={(event) =>
                        setSteps((current) => current.map((item, itemIndex) => (itemIndex === index ? event.target.value : item)))
                      }
                    />
                  </>
                ) : (
                  step
                )}
              </li>
            ))}
          </ol>
        </article>
        {viewing ? null : <p className="notice">Volunteers see this lesson only after you approve it.</p>}
        {viewing ? null : (
          <button type="button" className="approve" disabled={summary.trim().length === 0 || cleaned.length === 0} onClick={approve}>
            Approve lesson
          </button>
        )}
        {viewing ? null : (
          <button type="button" className="secondary" aria-pressed={editing} onClick={() => setEditing((open) => !open)}>
            {editing ? 'Done' : 'Edit'}
          </button>
        )}
      </section>
    </main>
  );
}

function AfterScreen({
  visit,
  name,
  onWrite,
  onApprove,
  onHome,
}: {
  visit: Visit;
  name: string;
  onWrite: () => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
  onHome: () => void;
}) {
  const writing = visit.update.phase === 'writing';
  return (
    <main>
      <Back onHome={onHome} />
      <span className={tagClass('plain')}>After Sunday</span>
      <h1>After Sunday for {name}</h1>
      <section aria-label="Internal notes">
        <h2>Internal notes</h2>
        <p>{visit.notes}</p>
        <p>Only Theo Park and {visit.church.leader} see this.</p>
      </section>
      {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
      {visit.update.phase === 'idle' || visit.update.phase === 'failed' || visit.update.phase === 'writing' ? (
        <button type="button" className="primary" disabled={writing || visit.notes.trim() === ''} onClick={onWrite}>
          Draft a note for {name}&apos;s parent
        </button>
      ) : null}
      {writing ? (
        <p id="update-status" className="draft-status" role="status">
          Writing the draft.
        </p>
      ) : null}
      {visit.update.phase === 'ready' ? (
        <form id="update-draft" onSubmit={onApprove}>
          <label htmlFor="parent-note">Parent note</label>
          <textarea id="parent-note" name="parentNote" rows={5} defaultValue={visit.update.value.body} autoComplete="off" />
          <button type="submit" className="approve">
            Approve and send to parent
          </button>
        </form>
      ) : null}
      {visit.update.phase === 'approved' ? (
        <>
          <p className="draft-text">{visit.update.value.body}</p>
          <p>The parent sees only this note, never Theo&apos;s internal notes.</p>
        </>
      ) : null}
    </main>
  );
}

function SettingsScreen({
  church,
  onChange,
  onSave,
  onHome,
}: {
  church: ChurchSetup;
  onChange: Dispatch<SetStateAction<ChurchSetup>>;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onHome: () => void;
}) {
  return (
    <main>
      <Back onHome={onHome} />
      <h1>Church settings</h1>
      <form onSubmit={onSave}>
        {CHURCH_FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`church-${key}`}>{label}</label>
            {key === 'plan' ? (
              <textarea
                id={`church-${key}`}
                name={key}
                rows={3}
                value={church[key]}
                autoComplete="off"
                onChange={(event) => onChange((current) => ({ ...current, [key]: event.target.value }))}
              />
            ) : (
              <input
                id={`church-${key}`}
                name={key}
                value={church[key]}
                autoComplete="off"
                onChange={(event) => onChange((current) => ({ ...current, [key]: event.target.value }))}
              />
            )}
          </div>
        ))}
        <button type="submit" className="primary">
          Save
        </button>
      </form>
    </main>
  );
}

function Back({ onHome }: { onHome: () => void }) {
  return (
    <div className="top-bar">
      <button type="button" className="back" onClick={onHome}>
        ← Leader home
      </button>
    </div>
  );
}

function tagClass(kind: 'waiting' | 'ready' | 'approved' | 'plain'): string {
  switch (kind) {
    case 'waiting':
      return 'tag waiting';
    case 'ready':
      return 'tag ready';
    case 'approved':
      return 'tag approved';
    case 'plain':
      return 'tag';
    default: {
      const leftover: never = kind;
      return leftover;
    }
  }
}
