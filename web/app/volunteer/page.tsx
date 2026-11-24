'use client';

import { useState, type FormEvent } from 'react';
import { checkInBrief } from '../../lib/visit';
import { useVisit } from '../visit-shell';

export default function VolunteerPage() {
  const { visit, dispatch } = useVisit();
  const brief = checkInBrief(visit);
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
            <h2>Rowan Sampleton</h2>
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
