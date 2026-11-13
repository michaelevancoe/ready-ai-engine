'use client';

import { Label } from '@radix-ui/react-label';
import { useReducer, type FormEvent } from 'react';
import {
  approveProfile,
  initialPhase,
  readAnswers,
  reducePage,
  submitIntake,
  viewOf,
  type AnswerDraft,
  type AnswerField,
} from '../lib/desk';

export default function Page() {
  const [phase, dispatch] = useReducer(reducePage, initialPhase());
  const view = viewOf(phase);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const answers = answersFrom(new FormData(event.currentTarget));
    const parsed = readAnswers(answers);
    if (!parsed.ok) {
      dispatch({ type: 'invalid', answers: parsed.draft, fieldErrors: parsed.fieldErrors });
      return;
    }
    if (reducePage(phase, { type: 'submit', answers: parsed.draft }) === phase) return;
    dispatch({ type: 'submit', answers: parsed.draft });
    dispatch(await submitIntake(parsed.answers));
  }

  async function onApprove(): Promise<void> {
    if (phase.status !== 'draft') return;
    const profile = phase.profile;
    dispatch({ type: 'approve' });
    dispatch(await approveProfile(profile));
  }

  return (
    <main>
      <h1>Avery Sampleton, parent of Rowan Sampleton, in Example Harbor Fellowship</h1>
      <form onSubmit={(event) => void onSubmit(event)}>
        {view.fields.map((field) => (
          <div key={field.key}>
            <Label htmlFor={field.key}>{field.label}</Label>
            {field.multiline ? (
              <textarea id={field.key} name={field.key} rows={3} defaultValue={field.value} />
            ) : (
              <input id={field.key} name={field.key} defaultValue={field.value} />
            )}
            {field.error === null ? null : <p role="alert">{field.error}</p>}
          </div>
        ))}
        {view.primary === 'submit' ? <button type="submit">Submit</button> : null}
      </form>
      {view.banner?.tone === 'busy' ? <p role="status">{view.banner.text}</p> : null}
      {view.banner?.tone === 'error' ? <p role="alert">{view.banner.text}</p> : null}
      {view.statusLabel === null ? null : <h2>{view.statusLabel}</h2>}
      {view.sections.map((section) => (
        <section key={section.heading} aria-label={section.heading}>
          <h3>{section.heading}</h3>
          {section.lines.map((line, index) => (
            <p key={`${section.heading}-${index}`}>{line}</p>
          ))}
        </section>
      ))}
      {view.primary === 'approve' ? (
        <button type="button" onClick={() => void onApprove()}>
          Approve
        </button>
      ) : null}
      {view.dismiss ? (
        <button type="button" onClick={() => dispatch({ type: 'dismiss' })}>
          Back
        </button>
      ) : null}
    </main>
  );
}

function answersFrom(form: FormData): AnswerDraft {
  return {
    preferredName: stringField(form, 'preferredName'),
    ageYears: stringField(form, 'ageYears'),
    sensoryNotes: stringField(form, 'sensoryNotes'),
    supportNeeds: stringField(form, 'supportNeeds'),
    whatHelps: stringField(form, 'whatHelps'),
    whatToAvoid: stringField(form, 'whatToAvoid'),
  };
}

function stringField(form: FormData, name: AnswerField): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
