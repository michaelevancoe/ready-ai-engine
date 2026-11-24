'use client';

import { useState, type FormEvent } from 'react';
import { postLesson, postSundayUpdate } from '../../lib/drafts';
import { checkInBrief, childPreferredName, reviewValue, type ChurchSetup } from '../../lib/visit';
import { useScrollWhen, useVisit } from '../visit-shell';

const CHURCH_FIELDS = [
  ['name', 'Church name'],
  ['service', 'Service'],
  ['room', 'Room'],
  ['leader', 'Leader'],
  ['ages', 'Ages'],
  ['plan', 'Plan'],
] as const satisfies ReadonlyArray<readonly [keyof ChurchSetup, string]>;

export default function LeaderPage() {
  const { visit, dispatch } = useVisit();
  const brief = checkInBrief(visit);
  const lesson = reviewValue(visit.lesson);
  const blocked = brief.status !== 'approved';
  const [initialLesson] = useState(visit.lessonSource);
  const [churchSaved, setChurchSaved] = useState(false);
  useScrollWhen(visit.update.phase === 'writing', 'update-status');
  useScrollWhen(visit.update.phase === 'ready', 'update-draft');
  useScrollWhen(visit.lesson.phase === 'writing', 'lesson-status');
  useScrollWhen(visit.lesson.phase === 'ready', 'lesson-draft');

  function onSaveChurch(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    dispatch({
      type: 'saveChurch',
      church: {
        name: text(form, 'name'),
        service: text(form, 'service'),
        room: text(form, 'room'),
        leader: text(form, 'leader'),
        ages: text(form, 'ages'),
        plan: text(form, 'plan'),
      },
    });
    setChurchSaved(true);
  }

  async function onWriteNote(): Promise<void> {
    if (visit.role !== 'leader' || visit.notes.trim() === '' || visit.update.phase === 'writing') return;
    dispatch({ type: 'writeUpdate' });
    const result = await postSundayUpdate(visit.notes, childPreferredName(visit));
    if (result.ok) dispatch({ type: 'updateReady', value: result.value });
    else dispatch({ type: 'updateFailed', message: result.message });
  }

  function onApproveNote(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('parentNote');
    dispatch({ type: 'approveUpdate', body: typeof value === 'string' ? value : '' });
  }

  async function onAdapt(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (brief.status !== 'approved' || visit.lesson.phase === 'writing') return;
    const value = new FormData(event.currentTarget).get('lesson');
    const source = typeof value === 'string' ? value.trim() : '';
    if (source.length === 0) return;
    dispatch({ type: 'writeLesson', source });
    const result = await postLesson(source, brief.lines, childPreferredName(visit));
    if (result.ok) dispatch({ type: 'lessonReady', value: result.value });
    else dispatch({ type: 'lessonFailed', message: result.message });
  }

  return (
    <main>
      <h1>Set up your church</h1>
      <p>Devon Placeholder</p>
      <section className="church-card">
        <span className="portrait">Placeholder photo</span>
        <h2>{visit.church.name}</h2>
      </section>
      <form onSubmit={onSaveChurch} onInput={() => setChurchSaved(false)}>
        {CHURCH_FIELDS.map(([key, label]) => (
          <div className="field" key={key}>
            <label htmlFor={`church-${key}`}>{label}</label>
            {key === 'plan' ? (
              <textarea id={`church-${key}`} name={key} rows={3} defaultValue={visit.church[key]} autoComplete="off" />
            ) : (
              <input id={`church-${key}`} name={key} defaultValue={visit.church[key]} autoComplete="off" />
            )}
          </div>
        ))}
        <button type="submit" className="primary">
          Save church
        </button>
      </form>
      {churchSaved ? <p role="status">Church saved.</p> : null}
      <section aria-label="Internal notes">
        <h2>Internal notes</h2>
        <p>Only Theo Park and Devon Placeholder see this.</p>
        {visit.notes.trim() === '' ? <p>None saved.</p> : <p>{visit.notes}</p>}
      </section>
      <section aria-label="Parent note">
        <h2>Parent note</h2>
        <button
          type="button"
          className="primary"
          disabled={visit.notes.trim() === '' || visit.update.phase === 'writing'}
          onClick={() => void onWriteNote()}
        >
          Write the parent note
        </button>
        {visit.update.phase === 'writing' ? (
          <p id="update-status" className="draft-status" role="status">
            Writing the draft.
          </p>
        ) : null}
        {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
        {visit.update.phase === 'ready' ? (
          <form id="update-draft" onSubmit={onApproveNote}>
            <label htmlFor="parent-note">Parent note</label>
            <textarea
              id="parent-note"
              name="parentNote"
              rows={5}
              defaultValue={visit.update.value.body}
              autoComplete="off"
            />
            <button type="submit" className="approve">
              Approve parent note
            </button>
          </form>
        ) : null}
        {visit.update.phase === 'approved' ? <p className="draft-text">{visit.update.value.body}</p> : null}
      </section>
      <section aria-label="Lesson adaptation">
        <h2>Adapt a lesson</h2>
        <form onSubmit={(event) => void onAdapt(event)}>
          <label htmlFor="fictional-lesson">Fictional lesson</label>
          <textarea
            id="fictional-lesson"
            name="lesson"
            rows={5}
            defaultValue={initialLesson}
            autoComplete="off"
          />
          {blocked ? <p id="lesson-gate">The parent has not approved needs yet.</p> : null}
          <button
            type="submit"
            className="primary"
            disabled={blocked || visit.lesson.phase === 'writing'}
            aria-describedby={blocked ? 'lesson-gate' : undefined}
          >
            Adapt lesson
          </button>
          {visit.lesson.phase === 'writing' ? (
            <p id="lesson-status" className="draft-status" role="status">
              Writing the draft.
            </p>
          ) : null}
        </form>
        {visit.lesson.phase === 'failed' ? <p role="alert">{visit.lesson.message}</p> : null}
        {lesson === null ? null : (
          <div id="lesson-draft">
            <p>{lesson.summary}</p>
            <ol>
              {lesson.steps.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        {visit.lesson.phase === 'ready' ? (
          <button type="button" className="approve" onClick={() => dispatch({ type: 'approveLesson' })}>
            Approve lesson
          </button>
        ) : null}
      </section>
    </main>
  );
}

function text(form: FormData, name: keyof ChurchSetup): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
