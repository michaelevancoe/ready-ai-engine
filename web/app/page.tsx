'use client';

import { useEffect, useRef, useState, type Dispatch, type FormEvent, type MouseEvent } from 'react';
import { postSocialStory } from '../lib/drafts';
import { presentAsk, project, type AskView, type Conversation, type ProjectRow } from '../lib/conversation';
import { approveProfile, submitIntake, type IntakeGate, type ShownProfile } from '../lib/desk';
import { intakeTree } from '../lib/intake-tree';
import { listen, speechSupport } from '../lib/speech';
import {
  BRIEF_FIELDS,
  BRIEF_LABELS,
  approvedValue,
  briefLines,
  childHeading,
  childPreferredName,
  reviewValue,
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

const SPEECH_FOOTER = "Talk or type. Voice uses your browser's speech-to-text. No audio is saved.";

const MEDICAL_HELP = 'Skipping is the default. You can add it later in Who sees what.';

type StepId = (typeof STEPS)[number][0];

export default function Page() {
  const { visit, dispatch } = useVisit();
  const gate = visit.intake;
  const conversation = visit.conversation;
  const ask = presentAsk(intakeTree, conversation);
  const projected = project(intakeTree, conversation);
  const profile = profileOf(gate);
  const [showProfile, setShowProfile] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const posted = useRef<Conversation['answers'] | null>(null);
  const openOnDraft = useRef(false);
  const nonce = useRef(0);
  const reviewing = showProfile && profile !== null && (gate.status === 'draft' || gate.status === 'approving' || (gate.status === 'error' && gate.retry === 'approve'));
  const drafting = conversation.talk.mode === 'reviewWait' && !reviewing && gate.status !== 'approved';
  const heading = childHeading(childPreferredName(visit));
  useScrollWhen(drafting, 'drafting');
  useScrollWhen(reviewing, 'profile');
  useScrollWhen(gate.status === 'approved', 'edit-profile');

  useEffect(() => {
    if (conversation.talk.mode === 'reviewWait') return;
    setShowProfile(false);
    setFixOpen(false);
  }, [conversation.talk.mode]);

  useEffect(() => {
    if (conversation.talk.mode !== 'reviewWait' || gate.status !== 'idle') return;
    if (posted.current === conversation.answers) return;
    posted.current = conversation.answers;
    void sendIntake(conversation);
  }, [conversation, gate.status]);

  useEffect(() => {
    if (gate.status !== 'draft' || !openOnDraft.current) return;
    openOnDraft.current = false;
    setShowProfile(true);
  }, [gate.status]);

  async function sendIntake(current: Conversation): Promise<void> {
    const id = nonce.current + 1;
    nonce.current = id;
    const post = project(intakeTree, current).post;
    dispatch({ type: 'intake', event: { type: 'submit', nonce: id } });
    const result = await submitIntake(post);
    switch (result.type) {
      case 'draft':
        dispatch({ type: 'intake', event: { type: 'draft', profile: result.profile, nonce: id } });
        return;
      case 'fail':
        dispatch({ type: 'intake', event: { type: 'fail', message: result.message, nonce: id } });
        return;
      default: {
        const leftover: never = result;
        return leftover;
      }
    }
  }

  async function onApprove(): Promise<void> {
    if (gate.status !== 'draft') return;
    const current = gate.profile;
    dispatch({ type: 'intake', event: { type: 'approve' } });
    dispatch({ type: 'intake', event: await approveProfile(current) });
  }

  function onSeeAgain(): void {
    openOnDraft.current = true;
    posted.current = conversation.answers;
    dispatch({ type: 'conversation', event: { type: 'finishFix' } });
    void sendIntake(conversation);
  }

  function onFix(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const sectionId = data.get('section');
    const reason = data.get('reason');
    if (typeof sectionId !== 'string' || typeof reason !== 'string' || reason.trim() === '') return;
    setFixOpen(false);
    dispatch({ type: 'conversation', event: { type: 'fix', sectionId, reason } });
  }

  function onLeave(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return (
    <main>
      <ol className="steps" aria-label="Sunday steps">
        {STEPS.map(([id, label]) => {
          const target = stepTarget(id, gate, visit.brief.phase, reviewing, drafting);
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
      {ask.kind === 'review' ? null : (
        <QuestionScreen
          ask={ask}
          onLeave={onLeave}
          onSeeAgain={onSeeAgain}
          dispatch={dispatch}
        />
      )}
      {drafting ? (
        <Drafting
          rows={projected.rows}
          gate={gate}
          onBack={() => {
            onLeave();
            dispatch({ type: 'conversation', event: { type: 'reopen' } });
          }}
          onReview={() => setShowProfile(true)}
          onRetry={() => void sendIntake(conversation)}
        />
      ) : null}
      {profile !== null && (gate.status === 'approved' || reviewing) ? (
        <div id="profile">
          {gate.status === 'approved' ? <h2>Approved</h2> : null}
          {profile.sections.map((section) => (
            <section key={section.heading} aria-label={section.heading}>
              <h3>{section.heading}</h3>
              {section.lines.map((line, index) => (
                <p key={`${section.heading}-${index}`}>{line}</p>
              ))}
            </section>
          ))}
          {gate.status === 'draft' ? (
            <>
              <button type="button" className="approve" onClick={() => void onApprove()}>
                Approve
              </button>
              {fixOpen ? (
                <form onSubmit={onFix}>
                  <fieldset>
                    <legend>Which section should change?</legend>
                    {intakeTree.sections.map((section) => (
                      <label className="choice" key={section.id}>
                        <input type="radio" name="section" value={section.id} required />
                        {section.reviewLabel}
                      </label>
                    ))}
                  </fieldset>
                  <label htmlFor="fix-reason">Reason</label>
                  <input id="fix-reason" name="reason" required autoComplete="off" />
                  <button type="submit">No, fix this</button>
                </form>
              ) : (
                <button type="button" onClick={() => setFixOpen(true)}>
                  No, fix this
                </button>
              )}
            </>
          ) : null}
          {gate.status === 'approving' ? (
            <p className="draft-status" role="status">
              Approving the profile.
            </p>
          ) : null}
          {gate.status === 'error' && gate.retry === 'approve' ? (
            <>
              <p role="alert">{gate.message}</p>
              <button type="button" onClick={() => dispatch({ type: 'intake', event: { type: 'dismiss' } })}>
                Back
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {gate.status === 'approved' ? <ApprovedJourney visit={visit} dispatch={dispatch} heading={heading} /> : null}
    </main>
  );
}

function QuestionScreen({
  ask,
  onLeave,
  onSeeAgain,
  dispatch,
}: {
  ask: Exclude<AskView, { kind: 'review' }>;
  onLeave: () => void;
  onSeeAgain: () => void;
  dispatch: Dispatch<VisitEvent>;
}) {
  const [draft, setDraft] = useState('');
  const [listening, setListening] = useState(false);
  const [speech, setSpeech] = useState<'ready' | 'missing'>('missing');
  const session = useRef<{ stop(): void } | null>(null);
  const questionKey = ask.kind === 'offer' ? 'offer' : `${ask.progress}:${ask.placeholder}:${ask.fixing?.done ?? false}`;
  const focusAnswer = ask.kind === 'question' && ask.fixing !== null && !ask.fixing.done;
  useEffect(() => {
    setSpeech(speechSupport());
  }, []);
  useEffect(() => {
    setDraft('');
    setListening(false);
    session.current?.stop();
    session.current = null;
    if (focusAnswer) document.getElementById('answer')?.focus();
  }, [focusAnswer, questionKey]);
  useEffect(() => () => session.current?.stop(), []);

  function commit(text: string): void {
    session.current?.stop();
    session.current = null;
    setListening(false);
    dispatch({ type: 'conversation', event: { type: 'answer', text } });
    setDraft('');
  }

  function onMic(): void {
    session.current?.stop();
    try {
      session.current = listen(
        (text) => setDraft(text),
        undefined,
        () => setListening(false),
      );
      setListening(true);
    } catch {
      session.current = null;
      setListening(false);
    }
  }

  const leave = ask.leave;
  const progress = ask.kind === 'offer' ? 'Optional · Medical' : ask.progress;
  const filled = filledBars(ask);
  const total = ask.countedTotal + 1;
  const fixing = ask.kind === 'question' ? ask.fixing : null;
  const showComposer = ask.kind === 'question' && fixing?.done !== true;

  return (
    <section id="intake" aria-label="Questions">
      <div className="top-bar">
        <button type="button" className="inline" onClick={onLeave}>
          <span aria-hidden="true">← </span>
          {leave}
        </button>
        <span className="guided">{fixing === null ? 'Guided by Ready' : `Fixing: ${fixing.label}`}</span>
      </div>
      <p className="progress-label">
        <span>{progress}</span>
        <span>Medical: optional</span>
      </p>
      <div className="bars" aria-hidden="true">
        {Array.from({ length: total }, (_, index) => (
          <span key={index} className={index < filled ? 'on' : ''} />
        ))}
      </div>
      <p className="placeholder-note">{intakeTree.placeholderNote}</p>
      {ask.lines.map((line, index) => (
        <p key={`${line.from}-${index}`} className={line.from === 'parent' ? 'bubble parent' : 'bubble ready'}>
          {line.text}
        </p>
      ))}
      {ask.kind === 'offer' ? (
        <>
          <button
            type="button"
            className="primary"
            onClick={() => dispatch({ type: 'conversation', event: { type: 'declineMedical' } })}
          >
            Skip for now
          </button>
          <button type="button" onClick={() => dispatch({ type: 'conversation', event: { type: 'acceptMedical' } })}>
            Yes, add medical info
          </button>
          <p className="hint">{MEDICAL_HELP}</p>
        </>
      ) : null}
      {showComposer && ask.kind === 'question' ? (
        <>
          {ask.skip ? (
            <button
              type="button"
              className="inline"
              onClick={() => dispatch({ type: 'conversation', event: { type: 'skip' } })}
            >
              Skip this one
            </button>
          ) : null}
          {ask.chips.length > 0 ? (
            <div className="chips">
              {ask.chips.map((chip) => (
                <button type="button" key={chip} onClick={() => commit(joinAnswer(draft, chip))}>
                  {chip}
                </button>
              ))}
            </div>
          ) : null}
          {ask.closeChip === null ? null : (
            <button
              type="button"
              className="inline"
              onClick={() => {
                if (draft.trim() === '') {
                  session.current?.stop();
                  session.current = null;
                  setListening(false);
                  dispatch({ type: 'conversation', event: { type: 'skip' } });
                  setDraft('');
                  return;
                }
                commit(draft);
              }}
            >
              {ask.closeChip}
            </button>
          )}
          <div className="composer">
            <label className="sr-only" htmlFor="answer">
              Your answer
            </label>
            <textarea
              id="answer"
              rows={3}
              value={draft}
              placeholder={ask.placeholder}
              autoComplete="off"
              onChange={(event) => setDraft(event.target.value)}
            />
            {speech === 'ready' ? (
              <button type="button" className="mic" aria-label="Start voice answer" onClick={onMic}>
                Mic
              </button>
            ) : null}
          </div>
          {listening ? (
            <button type="button" onClick={() => commit(draft)}>
              Tap to finish
            </button>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={() => {
                if (draft.trim() === '') return;
                commit(draft);
              }}
            >
              Send
            </button>
          )}
          {listening ? (
            <p role="status" className="draft-status">
              Listening…
            </p>
          ) : null}
        </>
      ) : null}
      {fixing?.done ? (
        <>
          <button type="button" className="primary" onClick={onSeeAgain}>
            See Rowan&apos;s profile again
          </button>
          <p className="hint">Returns to the profile for approval. Other answers are kept.</p>
        </>
      ) : null}
      <p className="footer-note">{SPEECH_FOOTER}</p>
    </section>
  );
}

function Drafting({
  rows,
  gate,
  onBack,
  onReview,
  onRetry,
}: {
  rows: readonly ProjectRow[];
  gate: IntakeGate;
  onBack: () => void;
  onReview: () => void;
  onRetry: () => void;
}) {
  const last = lastDraftedCounted(rows);
  return (
    <section aria-label="Drafting profile">
      <div className="top-bar">
        <button type="button" className="inline" onClick={onBack}>
          <span aria-hidden="true">← </span>
          Back to questions
        </button>
        <span className="guided">AI drafting</span>
      </div>
      <h2 id="drafting">Ready drafts Rowan&apos;s profile</h2>
      <p>Turning your answers into a short profile. Only your words are used.</p>
      <p className="placeholder-note">{intakeTree.placeholderNote}</p>
      <ul className="draft-rows">
        {rows.map((row) => (
          <li key={row.sectionId}>
            <span>{row.label}</span>
            <span>{rowStatus(row, gate.status, last)}</span>
          </li>
        ))}
      </ul>
      <button type="button" className="primary" disabled={gate.status !== 'draft'} onClick={onReview}>
        Review Rowan&apos;s profile
      </button>
      <p className="hint">Next: approve it, or tap &quot;No, fix this&quot; to go back to the right question.</p>
      {gate.status === 'error' && gate.retry === 'submit' ? (
        <>
          <p role="alert">{gate.message}</p>
          <button type="button" onClick={onRetry}>
            Write the draft again
          </button>
        </>
      ) : null}
    </section>
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
  const story = reviewValue(visit.story);
  const update = approvedValue(visit.update);
  const shared = visit.brief.phase === 'approved' ? visit.brief.lines : lines;
  const medicalShared = shared.some((line) => line.field === 'medical');
  const name = childPreferredName(visit);
  useScrollWhen(visit.story.phase === 'writing', 'story-status');
  useScrollWhen(visit.story.phase === 'ready', 'story-draft');
  useScrollWhen(visit.story.phase === 'approved', 'sunday-brief');
  useScrollWhen(visit.brief.phase === 'approved', 'sunday-update');

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
        <h2>This Sunday&apos;s story</h2>
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
          {update === null ? (
            <p>Waiting for an approved Sunday update.</p>
          ) : (
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
  gate: IntakeGate,
  brief: Visit['brief']['phase'],
  reviewing: boolean,
  drafting: boolean,
): string | null {
  switch (id) {
    case 'intake':
      return 'intake';
    case 'profile':
      if (gate.status === 'approved') return 'edit-profile';
      if (reviewing) return 'profile';
      if (drafting) return 'drafting';
      return null;
    case 'sunday-story':
    case 'sunday-brief':
      return gate.status === 'approved' ? id : null;
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

function stringField(form: FormData, name: BriefField): string {
  const value = form.get(name);
  return typeof value === 'string' ? value : '';
}

function profileOf(gate: IntakeGate): ShownProfile | null {
  switch (gate.status) {
    case 'idle':
    case 'submitting':
      return null;
    case 'error':
      return gate.profile;
    case 'draft':
    case 'approving':
    case 'approved':
      return gate.profile;
    default: {
      const leftover: never = gate;
      return leftover;
    }
  }
}

function filledBars(ask: Exclude<AskView, { kind: 'review' }>): number {
  switch (ask.kind) {
    case 'offer':
      return ask.countedTotal + 1;
    case 'question':
      return ask.onMedical ? ask.countedTotal + 1 : ask.countedIndex;
    default: {
      const leftover: never = ask;
      return leftover;
    }
  }
}

function joinAnswer(draft: string, chip: string): string {
  const typed = draft.trim();
  if (typed.length === 0) return chip;
  return `${typed} ${chip}`;
}

function lastDraftedCounted(rows: readonly ProjectRow[]): string | null {
  let id: string | null = null;
  for (const row of rows) {
    const section = intakeTree.sections.find((item) => item.id === row.sectionId);
    if (section === undefined || section.kind === 'medical' || row.state !== 'drafted') continue;
    id = row.sectionId;
  }
  return id;
}

function rowStatus(row: ProjectRow, status: IntakeGate['status'], last: string | null): string {
  const section = intakeTree.sections.find((item) => item.id === row.sectionId);
  if (section?.kind === 'medical') return row.state === 'drafted' ? 'Drafted · off' : 'Skipped · off';
  if (row.state === 'skipped') return 'Skipped';
  if (status === 'submitting' && row.sectionId === last) return 'Drafting...';
  return 'Drafted';
}
