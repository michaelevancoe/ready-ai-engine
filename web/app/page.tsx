'use client';

import { Label } from '@radix-ui/react-label';
import { useState, type Dispatch, type FormEvent, type MouseEvent } from 'react';
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
  childHeading,
  childPreferredName,
  readyValue,
  storyValue,
  type BriefField,
  type ProfileCard,
  type Visit,
  type VisitEvent,
} from '../lib/visit';
import { useScrollWhen, useVisit } from './visit-shell';

const STEPS = [
  ['intake', 'Intake'],
  ['profile', 'Profile'],
  ['sunday-story', 'Story'],
  ['sunday-brief', 'Brief'],
  ['sunday-update', 'Update'],
] as const;

type StepId = (typeof STEPS)[number][0];

export default function Page() {
  const { visit, dispatch } = useVisit();
  const phase = visit.intake;
  const view = viewOf(phase);
  const heading = childHeading(childPreferredName(visit));
  useScrollWhen(phase.status === 'approved', 'edit-profile');
  useScrollWhen(view.banner?.text === 'Writing the draft.', 'desk-status', 'nearest');

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
        Avery Sampleton reviews a Sunday brief for {heading} before Theo Park or Devon Placeholder can see it.
      </p>
      <ol className="steps" aria-label="Sunday steps">
        {STEPS.map(([id, label]) => {
          const target = stepTarget(id, phase.status, visit.brief.phase, view.statusLabel !== null);
          return (
            <li key={id}>
              {target === null ? (
                label
              ) : (
                <a href={`#${target}`} onClick={(event) => jumpTo(event, target)}>
                  {label}
                </a>
              )}
            </li>
          );
        })}
      </ol>
      <p className="church-card">
        <span className="portrait">Placeholder photo</span>
        <span>
          <strong>{visit.church.name}</strong>
          <span className="muted">{visit.church.service}</span>
        </span>
      </p>
      <form id="intake" onSubmit={(event) => void onSubmit(event)}>
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
        {view.banner?.tone === 'busy' ? (
          <p id="desk-status" className="draft-status" role="status">
            {view.banner.text}
          </p>
        ) : null}
      </form>
      {view.banner?.tone === 'error' ? <p role="alert">{view.banner.text}</p> : null}
      {view.statusLabel === null ? null : (
        <div id="profile">
          <h2>{view.statusLabel}</h2>
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
        </div>
      )}
      {view.dismiss ? (
        <button type="button" onClick={() => dispatch({ type: 'intake', event: { type: 'dismiss' } })}>
          Back
        </button>
      ) : null}
      {phase.status === 'approved' ? (
        <ApprovedJourney visit={visit} dispatch={dispatch} heading={heading} />
      ) : null}
    </main>
  );
}

function ApprovedJourney({
  visit,
  dispatch,
  heading,
}: {
  visit: Visit;
  dispatch: Dispatch<VisitEvent>;
  heading: string;
}) {
  const [cardSaved, setCardSaved] = useState(false);
  const lines = briefLines(visit.card, visit.visibility);
  const story = storyValue(visit.story);
  const update = readyValue(visit.update);
  const shared = visit.brief.phase === 'approved' ? visit.brief.lines : lines;
  const medicalShared = shared.some((line) => line.field === 'medical');
  const name = childPreferredName(visit);
  useScrollWhen(visit.story.phase === 'writing', 'story-status', 'nearest');
  useScrollWhen(visit.story.phase === 'ready', 'story-draft', 'nearest');
  useScrollWhen(visit.story.phase === 'approved', 'sunday-brief');
  useScrollWhen(visit.brief.phase === 'approved', 'sunday-update');
  useScrollWhen(visit.update.phase === 'writing', 'update-status', 'nearest');
  useScrollWhen(visit.update.phase === 'ready', 'update-draft', 'nearest');

  function readCard(): ProfileCard {
    const form = document.getElementById('profile-card');
    if (!(form instanceof HTMLFormElement)) return visit.card;
    return cardFrom(new FormData(form));
  }

  function cardChanged(card: ProfileCard): boolean {
    return BRIEF_FIELDS.some((field) => card[field] !== visit.card[field]);
  }

  function onSaveCard(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    dispatch({ type: 'saveCard', card: cardFrom(new FormData(event.currentTarget)) });
    setCardSaved(true);
  }

  async function onWriteStory(): Promise<void> {
    if (visit.story.phase === 'writing') return;
    const card = readCard();
    const nextLines = briefLines(card, visit.visibility);
    if (nextLines.length === 0) return;
    if (cardChanged(card)) dispatch({ type: 'saveCard', card });
    dispatch({ type: 'writeStory' });
    const result = await postSocialStory(nextLines, name);
    if (result.ok) dispatch({ type: 'storyReady', value: result.value });
    else dispatch({ type: 'storyFailed', message: result.message });
  }

  function onApproveBrief(): void {
    const card = readCard();
    if (cardChanged(card)) dispatch({ type: 'saveCard', card });
    dispatch({ type: 'approveBrief' });
  }

  async function onWriteUpdate(): Promise<void> {
    if (visit.notes.trim() === '' || visit.update.phase === 'writing') return;
    dispatch({ type: 'writeUpdate' });
    const result = await postSundayUpdate(visit.notes, name);
    if (result.ok) dispatch({ type: 'updateReady', value: result.value });
    else dispatch({ type: 'updateFailed', message: result.message });
  }

  return (
    <>
      <section aria-label="Edit profile" id="edit-profile">
        <h2>Edit profile</h2>
        <p>Change anything that is not quite right. Saving keeps your words.</p>
        <form id="profile-card" onSubmit={onSaveCard} onInput={() => setCardSaved(false)}>
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
        <p>Choose what Theo Park can see about {heading}. You can change this any time.</p>
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
          onClick={() =>
            document.getElementById('sunday-story')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
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
        {visit.story.phase === 'writing' ? (
          <p id="story-status" className="draft-status" role="status">
            Writing the draft.
          </p>
        ) : null}
        {visit.story.phase === 'failed' ? <p role="alert">{visit.story.message}</p> : null}
        {story === null ? null : (
          <div className="story-card" id="story-draft">
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
      <section aria-label="Sunday brief" id="sunday-brief">
        <h2>Sunday brief</h2>
        <p>Theo Park sees only these lines after you approve them.</p>
        {shared.map((line) => (
          <article key={line.field} className="line" data-field={line.field}>
            <h3>{line.label}</h3>
            <p>{line.text}</p>
          </article>
        ))}
        {medicalShared ? null : <p>Medical / health notes are not in this brief.</p>}
        <button type="button" className="approve" onClick={onApproveBrief}>
          Approve for Sunday
        </button>
        {visit.brief.phase === 'approved' ? <p>You approved this brief for Sunday.</p> : null}
      </section>
      {visit.brief.phase === 'approved' ? (
        <section aria-label="Sunday update" id="sunday-update">
          <h2>Sunday update</h2>
          {visit.notes.trim() === '' ? <p>Theo's notes will appear here.</p> : null}
          <button
            type="button"
            className="primary"
            disabled={visit.notes.trim() === '' || visit.update.phase === 'writing'}
            onClick={() => void onWriteUpdate()}
          >
            Write the Sunday update
          </button>
          {visit.update.phase === 'writing' ? (
            <p id="update-status" className="draft-status" role="status">
              Writing the draft.
            </p>
          ) : null}
          {visit.update.phase === 'failed' ? <p role="alert">{visit.update.message}</p> : null}
          {update === null ? null : (
            <p className="draft-text" id="update-draft">
              {update.body}
            </p>
          )}
        </section>
      ) : null}
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

function stepTarget(
  id: StepId,
  intake: Visit['intake']['status'],
  brief: Visit['brief']['phase'],
  profileVisible: boolean,
): string | null {
  switch (id) {
    case 'intake':
      return 'intake';
    case 'profile':
      if (!profileVisible) return null;
      return intake === 'approved' ? 'edit-profile' : 'profile';
    case 'sunday-story':
    case 'sunday-brief':
      return intake === 'approved' ? id : null;
    case 'sunday-update':
      return brief === 'approved' ? id : null;
    default: {
      const leftover: never = id;
      return leftover;
    }
  }
}

function jumpTo(event: MouseEvent<HTMLAnchorElement>, id: string): void {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
