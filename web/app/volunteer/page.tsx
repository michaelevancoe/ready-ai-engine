'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { volunteerStep, type VisitRecord } from '../../lib/demo-visits';
import { behaviorAsked } from '../../lib/intake-tree';
import { volunteerCheckInPrivacy } from '../../lib/privacy-note';
import { checkInBrief, childAgeYears, childPreferredName, type Visit } from '../../lib/visit';
import { visitWhatHelps } from '../../lib/what-helps';
import { PrivacyNote } from '../privacy-note';
import { WhatHelpsCard } from '../what-helps';
import { useReadyStore } from '../visit-shell';

export default function VolunteerPage() {
  const store = useReadyStore();
  const records = useSyncExternalStore(store.subscribe, store.listVisits, store.listVisits);
  const selectedVisit = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const selected = records.find((record) => record.visit === selectedVisit) ?? records[0];
  const live = records.find((record) => !record.sample) ?? records[0];
  const [opened, setOpened] = useState<string | null>(null);
  if (selected === undefined || live === undefined) return null;
  const home = live;
  const openedRecord = opened === null ? null : (records.find((record) => record.id === opened) ?? null);

  function focus(id: string): void {
    store.select(id);
    store.dispatch({ type: 'role', role: 'volunteer' });
  }

  function openChild(id: string): void {
    focus(id);
    setOpened(id);
  }

  function showList(): void {
    focus(home.id);
    setOpened(null);
  }

  if (openedRecord !== null) {
    return <ChildDetail record={openedRecord} onBack={showList} onSave={(notes) => {
      focus(openedRecord.id);
      store.dispatch({ type: 'saveNotes', notes });
    }} />;
  }

  const samples = records.some((record) => record.sample);
  return (
    <main>
      <h1>Sunday check-in</h1>
      <p>You&apos;re Jordan Ellis, a volunteer in the {home.visit.church.room}.</p>
      {samples ? (
        <p className="sample-caption">
          Tap a child to open their brief. Owen, Nora, Ezra, Hazel and Lucy are sample children.
        </p>
      ) : null}
      <ul className="roster">
        {records.map((record) => (
          <RosterButton key={record.id} record={record} onOpen={() => openChild(record.id)} />
        ))}
      </ul>
    </main>
  );
}

function ChildDetail({
  record,
  onBack,
  onSave,
}: {
  record: VisitRecord;
  onBack: () => void;
  onSave: (notes: string) => void;
}) {
  const name = childPreferredName(record.visit);
  const age = childAgeYears(record.visit);
  const step = volunteerStep(record.visit);
  return (
    <main>
      <div className="top-bar">
        <button type="button" className="back" onClick={onBack}>
          ← All children
        </button>
      </div>
      <h1>Sunday check-in</h1>
      <p>You&apos;re Jordan Ellis, a volunteer in the {record.visit.church.room}.</p>
      <div className="roster-card">
        <span className="portrait" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span>
          <h2>
            {name}, {age}
          </h2>
          <p className="muted">{step}</p>
        </span>
      </div>
      {record.sample ? <p className="sample-tag">Sample child · resets on reload</p> : null}
      <BriefBody visit={record.visit} sample={record.sample} onSave={onSave} />
    </main>
  );
}

function RosterButton({ record, onOpen }: { record: VisitRecord; onOpen: () => void }) {
  const name = childPreferredName(record.visit);
  const age = childAgeYears(record.visit);
  const step = volunteerStep(record.visit);
  return (
    <li>
      <button type="button" className="child-row roster-row" aria-label={`Open ${name}, ${age}, ${step}`} onClick={onOpen}>
        <span className="portrait" aria-hidden="true">
          {name.slice(0, 1)}
        </span>
        <span>
          <h2>
            {name}, {age}
          </h2>
          <p className="muted">{step}</p>
        </span>
        <span className="chevron" aria-hidden="true">
          ›
        </span>
      </button>
    </li>
  );
}

function BriefBody({
  visit,
  sample,
  onSave,
}: {
  visit: Visit;
  sample: boolean;
  onSave: (notes: string) => void;
}) {
  const name = childPreferredName(visit);
  const brief = checkInBrief(visit);
  const [initialNotes] = useState(visit.notes);
  const [dirty, setDirty] = useState(false);

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('notes');
    onSave(typeof value === 'string' ? value : '');
    setDirty(false);
  }

  if (brief.status !== 'approved') {
    return (
      <p>
        {sample
          ? `${name}'s parent hasn't shared a Sunday brief yet. His brief shows up here once his parent approves it. Volunteers can't make one. To see how a parent does, switch to Parent.`
          : `${name}'s parent has not approved a Sunday brief.`}
      </p>
    );
  }

  const saved = visit.notes.trim() !== '' && !dirty;
  return (
    <section aria-label="Sunday brief">
      <h2>Sunday brief</h2>
      <WhatHelpsCard name={name} bullets={visitWhatHelps(visit)} audience={sample ? 'sample' : 'team'} />
      <PrivacyNote variant="line" text={volunteerCheckInPrivacy(name)} />
      {brief.lines.length === 0 ? <p>No shared lines.</p> : null}
      {brief.lines.map((line) => (
        <article key={line.field} className="line" data-field={line.field}>
          <h3>{line.label}</h3>
          {line.field === 'calming' ? <p>{behaviorAsked(name)}</p> : null}
          <p>{line.text}</p>
        </article>
      ))}
      <form onSubmit={submit}>
        <label htmlFor="sunday-notes">Notes after Sunday</label>
        <textarea
          id="sunday-notes"
          name="notes"
          rows={4}
          defaultValue={initialNotes}
          autoComplete="off"
          onInput={() => setDirty(true)}
        />
        {saved ? <p role="status">Notes saved · {visit.church.leader} can see them</p> : null}
        <button type="submit" className="primary">
          {visit.notes.trim() === '' ? 'Save notes' : 'Update notes'}
        </button>
      </form>
    </section>
  );
}
