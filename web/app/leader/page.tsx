'use client';

import { useLayoutEffect, useRef, useState, useSyncExternalStore, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { isChurchPhotoFile } from '../../lib/church-photo-file';
import { draftSundayNote, leaderStep, leaderTagKind } from '../../lib/demo-visits';
import type { ChurchPhotoSlot } from '../../lib/ready-store';
import { STORY_SAMPLES } from '../../lib/sunday-story';
import { behaviorAsked } from '../../lib/intake-tree';
import { volunteerCheckInPrivacy } from '../../lib/privacy-note';
import { checkInBrief, childAgeYears, childPreferredName, initialVisit, type ChurchSetup, type Visit } from '../../lib/visit';
import { visitWhatHelps } from '../../lib/what-helps';
import { PrivacyNote } from '../privacy-note';
import { useChurchPhotos, useReadyStore, useScrollWhen } from '../visit-shell';
import { DraftStatus } from '../draft-status';
import { WhatHelpsCard } from '../what-helps';
import { readChurchPhoto } from './read-church-photo';
import { ResumeCard, SettingsCard, SetupScreens, setupReplacesHome } from './setup';
import { useOnboarding } from './use-onboarding';

const CHURCH_FIELDS = [
  ['name', 'Church name'],
  ['service', 'Service'],
  ['room', 'Room'],
  ['leader', 'Leader'],
  ['ages', 'Ages'],
  ['plan', 'Plan'],
] as const satisfies ReadonlyArray<readonly [keyof ChurchSetup, string]>;

const PHOTO_SLOTS = [
  ['outside', 'Outside / arriving'],
  ['doors', 'Front doors'],
  ['desk', 'Welcome desk'],
  ['classroom', 'Classroom'],
  ['quiet', 'Quiet spot'],
  ['pickup', 'Pickup area'],
] as const satisfies ReadonlyArray<readonly [ChurchPhotoSlot, string]>;

type Screen = 'home' | 'after' | 'brief' | 'settings';

export default function LeaderPage() {
  const store = useReadyStore();
  const records = useSyncExternalStore(store.subscribe, store.listVisits, store.listVisits);
  const selectedVisit = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const selected = records.find((record) => record.visit === selectedVisit) ?? records[0];
  const live = records.find((record) => !record.sample) ?? records[0];
  const { dispatch } = store;
  const visit = selected?.visit;
  const liveVisit = live?.visit;
  const [screen, setScreen] = useState<Screen>('home');
  const [saved, setSaved] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const onboarding = useOnboarding();
  const [church, setChurch] = useState<ChurchSetup>(liveVisit?.church ?? initialVisit().church);
  const setup = !browsing && setupReplacesHome(onboarding.state);
  useLayoutEffect(() => {
    if (setup) setScreen('home');
  }, [setup]);
  useScrollWhen(visit?.update.phase === 'writing', 'update-status');
  useScrollWhen(visit?.update.phase === 'ready', 'update-draft');
  if (selected === undefined || live === undefined || visit === undefined || liveVisit === undefined) return null;
  const active = selected;
  const activeVisit = visit;
  const home = live;
  const homeVisit = liveVisit;
  const name = childPreferredName(activeVisit);
  const liveName = childPreferredName(homeVisit);

  function showHome(): void {
    store.select(home.id);
    store.dispatch({ type: 'role', role: 'leader' });
    setScreen('home');
  }

  function openSettings(): void {
    store.select(home.id);
    store.dispatch({ type: 'role', role: 'leader' });
    setChurch(homeVisit.church);
    setSaved(false);
    setScreen('settings');
  }

  function openChild(id: string): void {
    store.select(id);
    store.dispatch({ type: 'role', role: 'leader' });
    setSaved(false);
    setScreen('after');
  }

  function openAfter(): void {
    openChild(home.id);
  }

  function onSaveChurch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    store.select(home.id);
    dispatch({ type: 'saveChurch', church });
    setSaved(true);
    setScreen('home');
  }

  function onSaveClassroom(next: ChurchSetup): void {
    store.select(home.id);
    dispatch({ type: 'saveChurch', church: next });
  }

  function explore(): void {
    setBrowsing(true);
    setScreen('home');
  }

  function replayWelcome(): void {
    setBrowsing(false);
    onboarding.dispatch({ type: 'replay' });
  }

  async function onWriteNote(): Promise<void> {
    if (activeVisit.role !== 'leader' || activeVisit.notes.trim() === '' || activeVisit.update.phase === 'writing') return;
    dispatch({ type: 'writeUpdate' });
    const result = await draftSundayNote(active, {
      notes: activeVisit.notes,
      childName: name,
      leader: activeVisit.church.leader,
      church: activeVisit.church.name,
    });
    if (result.ok) dispatch({ type: 'updateReady', value: result.value });
    else dispatch({ type: 'updateFailed', message: result.message });
  }

  function onApproveNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('parentNote');
    dispatch({ type: 'approveUpdate', body: typeof value === 'string' ? value : '' });
  }

  if (setup) {
    return (
      <SetupScreens
        state={onboarding.state}
        dispatch={onboarding.dispatch}
        church={homeVisit.church}
        onSaveChurch={onSaveClassroom}
        onExplore={explore}
      />
    );
  }
  if (screen === 'settings') {
    return (
      <SettingsScreen
        church={church}
        onChange={setChurch}
        onSave={onSaveChurch}
        onHome={showHome}
        onReplay={replayWelcome}
        onExplore={explore}
      />
    );
  }
  if (screen === 'brief') {
    return (
      <LeaderBrief
        visit={activeVisit}
        name={name}
        sample={active.sample}
        onBack={() => setScreen('after')}
      />
    );
  }
  if (screen === 'after') {
    return (
      <AfterScreen
        visit={activeVisit}
        name={name}
        sample={active.sample}
        onWrite={() => void onWriteNote()}
        onApprove={onApproveNote}
        onHome={showHome}
        onOpenBrief={() => setScreen('brief')}
      />
    );
  }

  return (
    <main>
      {saved ? <p role="status">Saved</p> : null}
      <div className="top-bar">
        <p className="eyebrow">
          {homeVisit.church.room} · {homeVisit.church.service}
        </p>
        <button type="button" className="text" onClick={openSettings}>
          Church settings
        </button>
      </div>
      <h1>Good morning, {homeVisit.church.leader}</h1>
      <p>You&apos;re {homeVisit.church.leader}, the room leader.</p>
      <p>
        {records.length === 1 ? '1 child is' : `${records.length} children are`} in the room today.
      </p>
      {onboarding.state.status === 'skipped' ? (
        <ResumeCard
          step={onboarding.state.step}
          onResume={() => onboarding.dispatch({ type: 'resume' })}
          onDismiss={() => onboarding.dispatch({ type: 'finish' })}
        />
      ) : null}
      <AfterCard
        name={liveName}
        age={childAgeYears(homeVisit)}
        visit={homeVisit}
        onOpen={openAfter}
      />
      {records.some((record) => record.sample) ? (
        <section aria-label="Other children today" data-tour="children">
          <h2>Other children today</h2>
          <p className="sample-caption">Sample children. Tap one to try any leader step.</p>
          <ul className="other-children">
            {records.filter((record) => record.sample).map((record) => {
              const step = leaderStep(record.visit);
              const childName = childPreferredName(record.visit);
              const age = childAgeYears(record.visit);
              return (
                <li key={record.id}>
                  <button
                    type="button"
                    className="child-row"
                    aria-label={`Open ${childName}, ${age}, ${step}`}
                    onClick={() => openChild(record.id)}
                  >
                    <span className="who">
                      {childName}, {age}
                    </span>
                    <span className="row-end">
                      <span className={tagClass(leaderTagKind(step))}>{step}</span>
                      <span className="chevron" aria-hidden="true">
                        ›
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function AfterCard({
  name,
  age,
  visit,
  onOpen,
}: {
  name: string;
  age: number;
  visit: Visit;
  onOpen: () => void;
}) {
  const step = leaderStep(visit);
  return (
    <button type="button" className="home-card" onClick={onOpen}>
      <h2>
        {name}, {age}
      </h2>
      {step === 'No notes yet' ? (
        <p>
          Brief approved by his parent. Jordan adds notes after class, then you can draft a note for {name}&apos;s
          parent.
        </p>
      ) : null}
      {step === 'No brief yet' ? (
        <p>No notes yet. Jordan adds them after class, then you can draft a note for {name}&apos;s parent.</p>
      ) : null}
      <span className={tagClass(leaderTagKind(step))}>{step}</span>
    </button>
  );
}

function AfterScreen({
  visit,
  name,
  sample,
  onWrite,
  onApprove,
  onHome,
  onOpenBrief,
}: {
  visit: Visit;
  name: string;
  sample: boolean;
  onWrite: () => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
  onHome: () => void;
  onOpenBrief: () => void;
}) {
  const writing = visit.update.phase === 'writing';
  return (
    <main>
      <Back label="← Today's list" onHome={onHome} />
      <span className={tagClass('plain')}>After Sunday</span>
      <h1>After Sunday for {name}</h1>
      {sample ? <p className="sample-tag">Sample child · resets on reload</p> : null}
      {visit.brief.phase === 'approved' ? (
        <>
          <div data-tour="summary">
            <WhatHelpsCard name={name} bullets={visitWhatHelps(visit)} audience={sample ? 'sample' : 'team'} />
          </div>
          <button type="button" className="text" onClick={onOpenBrief}>
            View {name}&apos;s full brief (parent&apos;s own words) ›
          </button>
        </>
      ) : null}
      {visit.brief.phase === 'open' ? (
        <section aria-label="Sunday brief">
          <h2>Sunday brief</h2>
          <p>
            No Sunday brief yet. {name}&apos;s parent hasn&apos;t approved one, so there&apos;s nothing to prepare or
            send.
          </p>
          <p>Once a parent approves a brief, it shows up here and for the volunteer.</p>
          {sample ? <p>To see how a parent makes a brief, switch to Parent.</p> : null}
        </section>
      ) : null}
      {visit.brief.phase === 'approved' && visit.notes.trim() === '' ? (
        <section aria-label="Internal notes">
          <h2>Internal notes</h2>
          <p>No notes yet. Jordan adds them after class, then you can draft a note for {name}&apos;s parent.</p>
          <p>{name}&apos;s Sunday brief is ready for the volunteer.</p>
          {sample ? (
            <p>Want to try the next steps? Open Ezra (notes in) or Hazel (draft to approve) from today&apos;s list.</p>
          ) : null}
        </section>
      ) : null}
      {visit.brief.phase === 'approved' && visit.notes.trim() !== '' ? (
        <>
          <section aria-label="Internal notes">
            <h2>Internal notes</h2>
            <p>{visit.notes}</p>
            <p>Only Jordan Ellis and {visit.church.leader} see this.</p>
          </section>
          {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
          {visit.update.phase === 'idle' || visit.update.phase === 'failed' || visit.update.phase === 'writing' ? (
            <>
              <button type="button" className="primary" disabled={writing} onClick={onWrite}>
                Draft a note for {name}&apos;s parent
              </button>
              {sample && !writing ? (
                <p>Tap Draft to see Ready write a note for {name}&apos;s parent. You can edit it before anything is sent.</p>
              ) : null}
            </>
          ) : null}
          {writing ? <DraftStatus id="update-status" copy="Writing the draft." /> : null}
          {visit.update.phase === 'ready' ? (
            <form id="update-draft" data-tour="approve" onSubmit={onApprove}>
              <p className="drafted">
                <Spark /> Drafted by Ready from Jordan&apos;s notes · edit before sending
              </p>
              <label htmlFor="parent-note">Parent note</label>
              <textarea id="parent-note" name="parentNote" rows={8} defaultValue={visit.update.value.body} autoComplete="off" />
              <button type="submit" className="approve">
                Approve and send to parent
              </button>
              {sample ? (
                <p>
                  {name}&apos;s parent sees this note only after you approve it. They never see Jordan&apos;s internal
                  notes.
                </p>
              ) : null}
            </form>
          ) : null}
          {visit.update.phase === 'approved' ? (
            <>
              <article className="brief-card">
                <h2>Note sent to {name}&apos;s parent</h2>
                <p>{visit.update.value.body}</p>
              </article>
              {sample ? (
                <>
                  <p className="tag approved">Sent to {name}&apos;s parent · Sunday 12:05 PM</p>
                  <p>{name}&apos;s parent can read this note now. They never see Jordan&apos;s internal notes.</p>
                </>
              ) : (
                <p>The parent sees only this note, never Jordan&apos;s internal notes.</p>
              )}
            </>
          ) : null}
        </>
      ) : null}
    </main>
  );
}

function LeaderBrief({
  visit,
  name,
  sample,
  onBack,
}: {
  visit: Visit;
  name: string;
  sample: boolean;
  onBack: () => void;
}) {
  const brief = checkInBrief(visit);
  return (
    <main>
      <div className="top-bar">
        <button type="button" className="back" onClick={onBack}>
          ← After Sunday
        </button>
      </div>
      <h1>{name}&apos;s brief</h1>
      <section aria-label="Sunday brief">
        <h2>Sunday brief</h2>
        <WhatHelpsCard name={name} bullets={visitWhatHelps(visit)} audience={sample ? 'sample' : 'team'} />
        <PrivacyNote variant="line" text={volunteerCheckInPrivacy(name)} />
        {brief.status === 'approved'
          ? brief.lines.map((line) => (
              <article key={line.field} className="line" data-field={line.field}>
                <h3>{line.label}</h3>
                {line.field === 'calming' ? <p>{behaviorAsked(name)}</p> : null}
                <p>{line.text}</p>
              </article>
            ))
          : null}
      </section>
    </main>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path fill="currentColor" d="M8 1.2 9.1 6 13.8 8 9.1 10 8 14.8 6.9 10 2.2 8 6.9 6 8 1.2Z" />
    </svg>
  );
}

function SettingsScreen({
  church,
  onChange,
  onSave,
  onHome,
  onReplay,
  onExplore,
}: {
  church: ChurchSetup;
  onChange: Dispatch<SetStateAction<ChurchSetup>>;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onHome: () => void;
  onReplay: () => void;
  onExplore: () => void;
}) {
  return (
    <main>
      <Back label="← Leader home" onHome={onHome} />
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
        <ChurchPhotos />
        <button type="submit" className="primary">
          Save
        </button>
      </form>
      <SettingsCard onReplay={onReplay} onExplore={onExplore} />
    </main>
  );
}

function ChurchPhotos() {
  const store = useReadyStore();
  const photos = useChurchPhotos();
  return (
    <div className="photo-settings">
      <p className="photo-guidance">Photos of spaces only, no people. Sample images, not a real church.</p>
      <div className="photo-grid">
        {PHOTO_SLOTS.map(([slot, label]) => (
          <ChurchPhotoField
            key={slot}
            label={label}
            src={photos[slot] ?? STORY_SAMPLES[slot].src}
            alt={STORY_SAMPLES[slot].alt}
            uploaded={photos[slot] !== null}
            onReplace={(url) => store.setChurchPhoto(slot, url)}
            onClear={() => store.clearChurchPhoto(slot)}
          />
        ))}
      </div>
      <p className="photo-guidance">
        Photos you add stay in this browser tab only and clear when you refresh. They are never uploaded.
      </p>
    </div>
  );
}

function ChurchPhotoField({
  label,
  src,
  alt,
  uploaded,
  onReplace,
  onClear,
}: {
  label: string;
  src: string;
  alt: string;
  uploaded: boolean;
  onReplace: (url: string) => void;
  onClear: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  function onPick(file: File | undefined): void {
    if (file === undefined) return;
    if (!isChurchPhotoFile(file)) {
      setError('Use a JPEG, PNG, or WebP photo.');
      return;
    }
    void readChurchPhoto(file).then(
      (url) => {
        onReplace(url);
        setError(null);
      },
      () => setError('Use a JPEG, PNG, or WebP photo.'),
    );
  }

  return (
    <section className="photo-slot" aria-label={label}>
      <img src={src} alt={alt} />
      <p>{label}</p>
      <div className="photo-actions">
        <button type="button" className="text" onClick={() => input.current?.click()}>
          Replace
        </button>
        {uploaded ? (
          <button
            type="button"
            className="text"
            onClick={() => {
              onClear();
              setError(null);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        className="photo-file"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        aria-label={`${label} photo`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          onPick(file);
        }}
      />
      {error === null ? null : <p role="alert">{error}</p>}
    </section>
  );
}

function Back({ label, onHome }: { label: string; onHome: () => void }) {
  return (
    <div className="top-bar">
      <button type="button" className="back" onClick={onHome}>
        {label}
      </button>
    </div>
  );
}

function tagClass(kind: 'ready' | 'approved' | 'plain'): string {
  switch (kind) {
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
