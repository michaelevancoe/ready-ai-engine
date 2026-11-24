'use client';

import { useState, type FormEvent } from 'react';
import { postLesson } from '../../lib/drafts';
import { checkInBrief, childPreferredName, readyValue, type ChurchSetup } from '../../lib/visit';
import { useVisit } from '../visit-shell';

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
  const lesson = readyValue(visit.lesson);
  const blocked = brief.status !== 'approved';
  const [initialLesson] = useState(visit.lessonSource);
  const [churchSaved, setChurchSaved] = useState(false);

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
        </form>
        {visit.lesson.phase === 'writing' ? <p role="status">Writing the draft.</p> : null}
        {visit.lesson.phase === 'failed' ? <p role="alert">{visit.lesson.message}</p> : null}
        {lesson === null ? null : (
          <>
            <p>{lesson.summary}</p>
            <ol>
              {lesson.steps.map((step, index) => (
                <li key={`${index}-${step}`}>{step}</li>
              ))}
            </ol>
          </>
        )}
      </section>
    </main>
  );
}

function text(form: FormData, name: keyof ChurchSetup): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
