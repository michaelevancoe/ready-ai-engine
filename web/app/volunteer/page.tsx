'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { seededChildren } from '../../lib/demo-roster';
import { volunteerCheckInPrivacy } from '../../lib/privacy-note';
import { checkInBrief, childPreferredName, volunteerRoster } from '../../lib/visit';
import { PrivacyNote } from '../privacy-note';
import { useDemoMode, useReadyStore } from '../visit-shell';

export default function VolunteerPage() {
  const store = useReadyStore();
  const demo = useDemoMode();
  const visit = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { dispatch } = store;
  const brief = checkInBrief(visit);
  const roster = volunteerRoster(visit);
  const seeded = demo ? seededChildren(childPreferredName(visit)) : [];
  const [initialNotes] = useState(visit.notes);
  const [saved, setSaved] = useState(false);

  function onSave(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('notes');
    dispatch({ type: 'saveNotes', notes: typeof value === 'string' ? value : '' });
    setSaved(true);
  }

  return (
    <main>
      <h1>Sunday check-in</h1>
      <p>Jordan Ellis</p>
      <ul className="roster">
        {roster.map((row) => (
          <li key={row.heading}>
            <span className="portrait">Placeholder photo</span>
            <div>
              <h2>{row.heading}</h2>
              <p className="muted">{row.status}</p>
            </div>
          </li>
        ))}
        {seeded.map((child) => (
          <li key={child.name}>
            <span className="portrait">Placeholder photo</span>
            <div>
              <h2>
                {child.name}, {child.ageYears}
              </h2>
              <p className="muted">{child.volunteer}</p>
            </div>
          </li>
        ))}
      </ul>
      {brief.status === 'approved' ? (
        <section aria-label="Sunday brief">
          <h2>Sunday brief</h2>
          <PrivacyNote variant="line" text={volunteerCheckInPrivacy(childPreferredName(visit))} />
          {brief.lines.length === 0 ? <p>No shared lines.</p> : null}
          {brief.lines.map((line) => (
            <article key={line.field} className="line" data-field={line.field}>
              <h3>{line.label}</h3>
              <p>{line.text}</p>
            </article>
          ))}
          <form onSubmit={onSave}>
            <label htmlFor="sunday-notes">Notes after Sunday</label>
            <textarea
              id="sunday-notes"
              name="notes"
              rows={4}
              defaultValue={initialNotes}
              autoComplete="off"
              onInput={() => setSaved(false)}
            />
            <button type="submit" className="primary">
              Save notes
            </button>
          </form>
          {saved && visit.notes.trim() !== '' ? <p role="status">Notes saved.</p> : null}
        </section>
      ) : (
        <p>The parent has not approved a Sunday brief.</p>
      )}
    </main>
  );
}
