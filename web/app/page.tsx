'use client';

import { Label } from '@radix-ui/react-label';
import { useState, type Dispatch, type FormEvent } from 'react';
import { postSocialStory, postSundayUpdate } from '../lib/drafts';
import {
  approveProfile,
  readAnswers,
  reducePage,
  submitIntake,
  viewOf,
  type AnswerDraft,
  type AnswerField,
} from '../lib/desk';
import {
  BRIEF_FIELDS,
  BRIEF_LABELS,
  briefLines,
  readyValue,
  storyValue,
  type BriefField,
  type ProfileCard,
  type Visit,
  type VisitEvent,
} from '../lib/visit';
import { useVisit } from './visit-shell';

export default function Page() {
  const { visit, dispatch } = useVisit();
  const phase = visit.intake;
  const view = viewOf(phase);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const answers = answersFrom(new FormData(event.currentTarget));
    const parsed = readAnswers(answers);
    if (!parsed.ok) {
      dispatch({ type: 'intake', event: { type: 'invalid', answers: parsed.draft, fieldErrors: parsed.fieldErrors } });
      return;
    }
    if (reducePage(phase, { type: 'submit', answers: parsed.draft }) === phase) return;
    dispatch({ type: 'intake', event: { type: 'submit', answers: parsed.draft } });
    dispatch({ type: 'intake', event: await submitIntake(parsed.answers) });
  }

  async function onApprove(): Promise<void> {
    if (phase.status !== 'draft') return;
    const profile = phase.profile;
    dispatch({ type: 'intake', event: { type: 'approve' } });
    dispatch({ type: 'intake', event: await approveProfile(profile) });
  }

  return (
    <main>
      <h1>
        Feel prepared.
        <br />
        Feel known.
        <br />
        Feel welcome.
      </h1>
      <p>
        Avery Sampleton reviews a Sunday brief for Rowan Sampleton before Theo Park or Devon Placeholder can see it.
      </p>
      <p className="church-card">
        <span className="portrait">Placeholder photo</span>
        <span>
          <strong>{visit.church.name}</strong>
          <span className="muted">{visit.church.service}</span>
        </span>
      </p>
      <form onSubmit={(event) => void onSubmit(event)}>
        {view.fields.map((field) => (
          <div className="field" key={field.key}>
            <Label htmlFor={field.key}>{field.label}</Label>
            {field.multiline ? (
              <textarea id={field.key} name={field.key} rows={3} defaultValue={field.value} autoComplete="off" />
            ) : (
              <input id={field.key} name={field.key} defaultValue={field.value} autoComplete="off" />
            )}
            {field.error === null ? null : <p role="alert">{field.error}</p>}
          </div>
        ))}
        {view.primary === 'submit' ? (
          <button type="submit" className="primary">
            Submit
          </button>
        ) : null}
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
        <button type="button" className="approve" onClick={() => void onApprove()}>
          Approve
        </button>
      ) : null}
      {view.dismiss ? (
        <button type="button" onClick={() => dispatch({ type: 'intake', event: { type: 'dismiss' } })}>
          Back
        </button>
      ) : null}
      {phase.status === 'approved' ? <ApprovedJourney visit={visit} dispatch={dispatch} /> : null}
    </main>
  );
}

function ApprovedJourney({ visit, dispatch }: { visit: Visit; dispatch: Dispatch<VisitEvent> }) {
  const [cardSaved, setCardSaved] = useState(false);
  const lines = briefLines(visit.card, visit.visibility);
  const story = storyValue(visit.story);
  const update = readyValue(visit.update);
  const shared = visit.brief.phase === 'approved' ? visit.brief.lines : lines;
  const medicalShared = shared.some((line) => line.field === 'medical');

  function onSaveCard(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    dispatch({ type: 'saveCard', card: cardFrom(new FormData(event.currentTarget)) });
    setCardSaved(true);
  }

  async function onWriteStory(): Promise<void> {
    if (lines.length === 0 || visit.story.phase === 'writing') return;
    dispatch({ type: 'writeStory' });
    const result = await postSocialStory(lines);
    if (result.ok) dispatch({ type: 'storyReady', value: result.value });
    else dispatch({ type: 'storyFailed', message: result.message });
  }

  async function onWriteUpdate(): Promise<void> {
    if (visit.notes.trim() === '' || visit.update.phase === 'writing') return;
    dispatch({ type: 'writeUpdate' });
    const result = await postSundayUpdate(visit.notes);
    if (result.ok) dispatch({ type: 'updateReady', value: result.value });
    else dispatch({ type: 'updateFailed', message: result.message });
  }

  return (
    <>
      <section aria-label="Edit profile">
        <h2>Edit profile</h2>
        <p>Change anything that is not quite right. Saving keeps your words.</p>
        <form
          onSubmit={onSaveCard}
          onInput={() => setCardSaved(false)}
        >
          {BRIEF_FIELDS.map((field) => (
            <div className="field" key={field}>
              <label htmlFor={`card-${field}`}>{BRIEF_LABELS[field]}</label>
              <textarea
                id={`card-${field}`}
                name={field}
                rows={3}
                defaultValue={visit.card[field]}
                autoComplete="off"
              />
            </div>
          ))}
          <button type="submit" className="primary">
            Save changes
          </button>
        </form>
        {cardSaved ? <p role="status">Profile saved.</p> : null}
      </section>
      <section aria-label="Who sees what">
        <h2>Who sees what</h2>
        <p>Choose what Theo Park can see about Rowan. You can change this any time.</p>
        {BRIEF_FIELDS.map((field) => (
          <ShareSwitch
            key={field}
            field={field}
            on={visit.visibility[field]}
            text={visit.card[field]}
            onToggle={() => dispatch({ type: 'visibility', field, on: !visit.visibility[field] })}
          />
        ))}
        <button
          type="button"
          className="primary"
          onClick={() => document.getElementById('sunday-story')?.scrollIntoView({ block: 'start' })}
        >
          Continue
        </button>
      </section>
      <section aria-label="Sunday story" id="sunday-story">
        <h2>This Sunday's story</h2>
        <button
          type="button"
          className="primary"
          disabled={lines.length === 0 || visit.story.phase === 'writing'}
          onClick={() => void onWriteStory()}
        >
          Write the Sunday story
        </button>
        {visit.story.phase === 'writing' ? <p role="status">Writing the draft.</p> : null}
        {visit.story.phase === 'failed' ? <p role="alert">{visit.story.message}</p> : null}
        {story === null ? null : (
          <div className="story-card">
            <h3>{story.title}</h3>
            <p className="draft-text">{story.body}</p>
          </div>
        )}
        {visit.story.phase === 'ready' ? (
          <button type="button" className="approve" onClick={() => dispatch({ type: 'approveStory' })}>
            Approve story
          </button>
        ) : null}
        {visit.story.phase === 'approved' ? <p>You approved this story.</p> : null}
      </section>
      <section aria-label="Sunday brief">
        <h2>Sunday brief</h2>
        <p>Theo Park sees only these lines after you approve them.</p>
        {shared.map((line) => (
          <article key={line.field} className="line" data-field={line.field}>
            <h3>{line.label}</h3>
            <p>{line.text}</p>
          </article>
        ))}
        {medicalShared ? null : <p>Medical / health notes are not in this brief.</p>}
        <button type="button" className="approve" onClick={() => dispatch({ type: 'approveBrief' })}>
          Approve for Sunday
        </button>
        {visit.brief.phase === 'approved' ? <p>You approved this brief for Sunday.</p> : null}
      </section>
      {visit.notes.trim() === '' ? null : (
        <section aria-label="Sunday update">
          <h2>Sunday update</h2>
          <button
            type="button"
            className="primary"
            disabled={visit.update.phase === 'writing'}
            onClick={() => void onWriteUpdate()}
          >
            Write the Sunday update
          </button>
          {visit.update.phase === 'writing' ? <p role="status">Writing the draft.</p> : null}
          {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
          {update === null ? null : <p className="draft-text">{update.body}</p>}
        </section>
      )}
    </>
  );
}

function ShareSwitch({
  field,
  on,
  text,
  onToggle,
}: {
  field: BriefField;
  on: boolean;
  text: string;
  onToggle: () => void;
}) {
  const trimmed = text.trim();
  const hint =
    field === 'medical'
      ? 'Off by default. Only a parent turns this on.'
      : trimmed.length > 0
        ? trimmed
        : 'Nothing in this field yet.';
  const labelId = `share-${field}-label`;
  const hintId = `share-${field}-hint`;
  return (
    <button
      type="button"
      className="switch"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      aria-describedby={hintId}
      onClick={onToggle}
    >
      <span>
        <span className="switch-label" id={labelId}>
          {BRIEF_LABELS[field]}
        </span>
        <span className="hint" id={hintId}>
          {hint}
        </span>
      </span>
      <span className={on ? 'track on' : 'track'} aria-hidden="true">
        <span className="knob" />
      </span>
    </button>
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

function cardFrom(form: FormData): ProfileCard {
  return {
    loves: stringField(form, 'loves'),
    overwhelms: stringField(form, 'overwhelms'),
    whatHelps: stringField(form, 'whatHelps'),
    communication: stringField(form, 'communication'),
    sensory: stringField(form, 'sensory'),
    medical: stringField(form, 'medical'),
  };
}

function stringField(form: FormData, name: AnswerField | BriefField): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}
