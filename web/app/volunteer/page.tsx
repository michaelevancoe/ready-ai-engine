'use client';

import { useState, useSyncExternalStore, type FormEvent } from 'react';
import { volunteerCheckInPrivacy } from '../../lib/privacy-note';
import { approvedValue, checkInBrief, childHeading, childPreferredName } from '../../lib/visit';
import { PrivacyNote } from '../privacy-note';
import { useReadyStore } from '../visit-shell';

export default function VolunteerPage() {
  const store = useReadyStore();
  const visit = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const { dispatch } = store;
  const brief = checkInBrief(visit);
  const lesson = approvedValue(visit.lesson);
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
      <p>Theo Park</p>
      <ul className="roster">
        <li>
          <span className="portrait">Placeholder photo</span>
          <div>
            <h2>{childHeading(childPreferredName(visit))}</h2>
            <p className="muted">{brief.status === 'approved' ? 'Brief ready' : 'No brief yet'}</p>
          </div>
        </li>
        <li>
          <span className="portrait">Placeholder photo</span>
          <div>
            <h2>Quinn Placeholder</h2>
            <p className="muted">No brief</p>
          </div>
        </li>
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
          {lesson === null ? null : (
            <section aria-label="Sunday lesson">
              <h2>Sunday lesson</h2>
              <p>{lesson.summary}</p>
              <ol>
                {lesson.steps.map((step, index) => (
                  <li key={`${index}-${step}`}>{step}</li>
                ))}
              </ol>
            </section>
          )}
        </section>
      ) : (
        <p>The parent has not approved a Sunday brief.</p>
      )}
    </main>
  );
}
