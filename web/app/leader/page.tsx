'use client';

import { useRef, useState, useSyncExternalStore, type Dispatch, type FormEvent, type SetStateAction } from 'react';
import { isChurchPhotoFile } from '../../lib/church-photo-file';
import { draftSundayNote, leaderStep, leaderTagKind } from '../../lib/demo-visits';
import type { ChurchPhotoSlot } from '../../lib/ready-store';
import { STORY_SAMPLES } from '../../lib/sunday-story';
import { childAgeYears, childPreferredName, initialVisit, type ChurchSetup, type Visit } from '../../lib/visit';
import { useChurchPhotos, useReadyStore, useScrollWhen } from '../visit-shell';
import { readChurchPhoto } from './read-church-photo';

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

type Screen = 'home' | 'after' | 'settings';

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
  const [church, setChurch] = useState<ChurchSetup>(liveVisit?.church ?? initialVisit().church);
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
    if (homeVisit.notes.trim() === '') return;
    openChild(home.id);
  }

  function onSaveChurch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    store.select(home.id);
    dispatch({ type: 'saveChurch', church });
    setSaved(true);
    setScreen('home');
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
  if (screen === 'after') {
    return (
      <AfterScreen
        visit={activeVisit}
        name={name}
        sample={active.sample}
        cannedDraft={active.cannedDraft !== null}
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
          {homeVisit.church.room} · {homeVisit.church.service}
        </p>
        <button type="button" className="text" onClick={openSettings}>
          Church settings
        </button>
      </div>
      <h1>Good morning, {homeVisit.church.leader}</h1>
      <p>
        {liveName} is at {homeVisit.church.name}.
      </p>
      <AfterCard
        name={liveName}
        notes={homeVisit.notes}
        sent={homeVisit.update.phase === 'approved'}
        onOpen={openAfter}
      />
      {records.some((record) => record.sample) ? (
        <section aria-label="Other children today">
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
  const label = empty ? 'No notes yet' : sent ? 'Sent to parent' : 'Notes from Jordan';
  const body = (
    <>
      <h2>Notes from Jordan Ellis</h2>
      {empty ? (
        <p>No notes yet. Jordan adds them after class, then you can draft a note for {name}&apos;s parent.</p>
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

function AfterScreen({
  visit,
  name,
  sample,
  cannedDraft,
  onWrite,
  onApprove,
  onHome,
}: {
  visit: Visit;
  name: string;
  sample: boolean;
  cannedDraft: boolean;
  onWrite: () => void;
  onApprove: (event: FormEvent<HTMLFormElement>) => void;
  onHome: () => void;
}) {
  const writing = visit.update.phase === 'writing';
  const notesEmpty = visit.notes.trim() === '';
  const sent = visit.update.phase === 'approved';
  const briefApproved = visit.brief.phase === 'approved';
  const canDraft = !sample || cannedDraft;
  return (
    <main>
      <Back label="← Today's list" onHome={onHome} />
      <span className={tagClass('plain')}>After Sunday</span>
      <h1>After Sunday for {name}</h1>
      {sample ? <p className="sample-tag">Sample child · resets on reload</p> : null}
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
      {briefApproved && visit.update.phase === 'approved' ? (
        <>
          {notesEmpty ? null : (
            <section aria-label="Internal notes">
              <h2>Internal notes</h2>
              <p>{visit.notes}</p>
              <p>Only Jordan Ellis and {visit.church.leader} see this.</p>
            </section>
          )}
          <p className="draft-text">{visit.update.value.body}</p>
          {sample ? (
            <>
              <p className="tag approved">Sent to {name}&apos;s parent · Sunday 12:05 PM</p>
              <p>{name}&apos;s parent can read this note now. They never see Jordan&apos;s internal notes.</p>
            </>
          ) : (
            <>
              <p>The parent sees only this note, never Jordan&apos;s internal notes.</p>
              <button type="button" className="primary" onClick={onWrite}>
                Draft a note for {name}&apos;s parent
              </button>
            </>
          )}
        </>
      ) : null}
      {briefApproved && !sent && notesEmpty ? (
        <section aria-label="Internal notes">
          <h2>Internal notes</h2>
          <p>No notes yet. Jordan adds them after class, then you can draft a note for {name}&apos;s parent.</p>
          <p>{name}&apos;s Sunday brief is ready for the volunteer.</p>
          {sample ? (
            <p>Want to try the next steps? Open Ezra (notes in) or Hazel (draft to approve) from today&apos;s list.</p>
          ) : null}
        </section>
      ) : null}
      {briefApproved && !sent && !notesEmpty ? (
        <>
          <section aria-label="Internal notes">
            <h2>Internal notes</h2>
            <p>{visit.notes}</p>
            <p>Only Jordan Ellis and {visit.church.leader} see this.</p>
          </section>
          {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
          {canDraft && (visit.update.phase === 'idle' || visit.update.phase === 'failed' || visit.update.phase === 'writing') ? (
            <>
              <button type="button" className="primary" disabled={writing} onClick={onWrite}>
                Draft a note for {name}&apos;s parent
              </button>
              {sample && !writing ? (
                <p>Tap Draft to see Ready write a note for {name}&apos;s parent. You can edit it before anything is sent.</p>
              ) : null}
            </>
          ) : null}
          {sample && !canDraft ? (
            <p>This sample has no parent-note draft. Open Ezra (notes in) or Hazel (draft to approve) from today&apos;s list.</p>
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
              {sample ? (
                <p>
                  {name}&apos;s parent sees this note only after you approve it. They never see Jordan&apos;s internal
                  notes.
                </p>
              ) : null}
            </form>
          ) : null}
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
