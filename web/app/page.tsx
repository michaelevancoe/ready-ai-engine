'use client';

import { Fragment, useEffect, useLayoutEffect, useRef, useState, type Dispatch } from 'react';
import { decideAck, type AckResult } from '../lib/acknowledgement';
import { pendingApprovalCopy } from '../lib/approve-copy';
import {
  answerNeedsAck,
  joinSpoken,
  presentAsk,
  project,
  reduceConversation,
  type AskView,
  type Conversation,
} from '../lib/conversation';
import { postAcknowledgement, postSocialStory, type AckPost } from '../lib/drafts';
import { approveProfile, submitIntake, type ShownProfile } from '../lib/desk';
import { behaviorAsked, intakeTree, type SectionId } from '../lib/intake-tree';
import { listen, speechSupport } from '../lib/speech';
import { parentReviewPrivacy, parentStartPrivacy, storyPrivacy } from '../lib/privacy-note';
import { initialReader, reduceReader, type Reader } from '../lib/story-reader';
import {
  approvedValue,
  briefAlreadyApproved,
  checkInBrief,
  childPreferredName,
  type SocialStory,
  type Visit,
  type VisitEvent,
} from '../lib/visit';
import { DraftStatus } from './draft-status';
import { PrivacyNote } from './privacy-note';
import { WhatHelpsCard } from './what-helps';
import { StoryPagePicture, SundayPrint } from './sunday-print';
import { SundayScheduleCard } from './sunday-schedule';
import { useAccountChurch, useChurchPhotos, useVisit } from './visit-shell';

const BEAT_MS = 1200;
const ACK_LIMIT_MS = 4000;
const readerSlots = ['outside', 'doors', 'desk', 'classroom', 'helper', 'quiet', 'pickup'] as const;

type Reading =
  | { readonly phase: 'idle' }
  | { readonly phase: 'reading'; readonly token: number }
  | { readonly phase: 'shown'; readonly token: number; readonly line: string };

type Mic = { readonly phase: 'off' } | { readonly phase: 'live'; readonly startedAt: number };

export default function Page() {
  const { visit, dispatch } = useVisit();
  const view = presentAsk(intakeTree, visit.conversation);
  const [reading, setReading] = useState<Reading>({ phase: 'idle' });
  const [spoken, setSpoken] = useState<string | null>(null);
  const [savedTitle, setSavedTitle] = useState<string | null>(null);
  const [reask, setReask] = useState<{ nodeId: string; prompt: string; epoch: number } | null>(null);
  const token = useRef(0);
  const nonce = useRef(0);
  const summaryKey = useRef('');
  const summaryRequest = useRef(0);
  const shownAcks = useRef<string[]>([]);
  const [summary, setSummary] = useState<ShownProfile | null>(null);
  const [summaryWait, setSummaryWait] = useState(false);
  const busy = useRef(false);
  const settling = useRef(false);
  const attempts = useRef<Record<string, number>>({});
  const readyLine = reading.phase === 'shown' && view.kind === 'question' && !view.fixing ? reading.line : null;
  const locked = reading.phase === 'reading' && view.kind === 'question';
  const pending = visit.intake.status === 'submitting' || visit.intake.status === 'approving';

  function onAnswer(text: string): void {
    if (settling.current) return;
    const current = visit.conversation;
    if (current.talk.mode !== 'ask' && current.talk.mode !== 'fix') return;
    const answer = text.trim();
    const nodeId = current.talk.nodeId;
    if (answer.length === 0 && answerNeedsAck(intakeTree, nodeId)) return;
    const fixing = current.talk.mode === 'fix';
    if (!answerNeedsAck(intakeTree, nodeId)) {
      const next = reduceConversation(intakeTree, current, { type: 'answer', text: answer });
      const stayed = sameQuestion(current, next);
      if (!fixing && !stayed && answer.length > 0) setSpoken(answer);
      dispatch({ type: 'conversation', event: { type: 'answer', text: answer } });
      return;
    }
    if (!fixing) setSpoken(answer);
    settling.current = true;
    const tokenId = token.current + 1;
    token.current = tokenId;
    setReading({ phase: 'reading', token: tokenId });
    void settleAnswer(tokenId, current, answer, nodeId, fixing);
  }

  async function settleAnswer(
    tokenId: number,
    current: Conversation,
    answer: string,
    nodeId: string,
    fixing: boolean,
  ): Promise<void> {
    const attempt = attempts.current[nodeId] ?? 0;
    try {
      const raced = await Promise.all([
        Promise.race([postAcknowledgement(answer, nodeId, shownAcks.current), delayResult(ACK_LIMIT_MS)]),
        delay(BEAT_MS),
      ]);
      if (token.current !== tokenId) return;
      const decision = decideAck(attempt, ackResult(raced[0]));
      if (decision.action === 'accept') {
        shownAcks.current = [...shownAcks.current, decision.line].slice(-3);
      }
      if (decision.action === 'reask') {
        attempts.current[nodeId] = attempt + 1;
        setReask((previous) => ({ nodeId, prompt: decision.prompt, epoch: (previous?.epoch ?? 0) + 1 }));
        setReading({ phase: 'idle' });
        return;
      }
      const next = reduceConversation(intakeTree, current, { type: 'answer', text: answer });
      if (next === current) {
        setReading({ phase: 'idle' });
        return;
      }
      delete attempts.current[nodeId];
      setReask(null);
      const title = sectionTitle(current);
      if (fixing && next.talk.mode === 'brief' && title !== null) setSavedTitle(title);
      dispatch({ type: 'conversation', event: { type: 'answer', text: answer } });
      if (fixing || next.talk.mode !== 'ask') {
        setReading({ phase: 'idle' });
        return;
      }
      setReading({ phase: 'shown', token: tokenId, line: decision.line });
    } finally {
      if (token.current === tokenId) settling.current = false;
    }
  }

  useLayoutEffect(() => {
    if (view.kind !== 'brief' || view.actions !== 'draft' || briefAlreadyApproved(visit)) return;
    const answers = project(intakeTree, visit.conversation).post;
    const key = JSON.stringify(answers);
    if (summaryKey.current === key) return;
    summaryKey.current = key;
    setSummary(null);
    setSummaryWait(true);
    const requestId = summaryRequest.current + 1;
    summaryRequest.current = requestId;
    void submitIntake(answers).then((result) => {
      if (summaryRequest.current !== requestId) return;
      if (result.type === 'draft') setSummary(result.profile);
      setSummaryWait(false);
    });
  }, [view, visit]);

  async function onApprove(): Promise<void> {
    if (view.kind !== 'brief' || view.actions !== 'draft' || busy.current) return;
    if (briefAlreadyApproved(visit)) {
      dispatch({ type: 'approveBrief' });
      dispatch({ type: 'conversation', event: { type: 'approve' } });
      return;
    }
    busy.current = true;
    const id = nonce.current + 1;
    nonce.current = id;
    const ready = summary;
    try {
      if (ready !== null) {
        dispatch({ type: 'intake', event: { type: 'submit', nonce: id } });
        dispatch({ type: 'intake', event: { type: 'draft', profile: ready, nonce: id } });
        dispatch({ type: 'intake', event: { type: 'approve' } });
        const approved = await approveProfile(ready);
        dispatch({ type: 'intake', event: approved });
        if (approved.type !== 'approved') return;
        dispatch({ type: 'approveBrief' });
        dispatch({ type: 'conversation', event: { type: 'approve' } });
        return;
      }
      dispatch({ type: 'intake', event: { type: 'submit', nonce: id } });
      const result = await submitIntake(project(intakeTree, visit.conversation).post);
      switch (result.type) {
        case 'fail':
          dispatch({ type: 'intake', event: { type: 'fail', message: result.message, nonce: id } });
          return;
        case 'draft': {
          dispatch({ type: 'intake', event: { type: 'draft', profile: result.profile, nonce: id } });
          dispatch({ type: 'intake', event: { type: 'approve' } });
          const approved = await approveProfile(result.profile);
          dispatch({ type: 'intake', event: approved });
          if (approved.type !== 'approved') return;
          dispatch({ type: 'approveBrief' });
          dispatch({ type: 'conversation', event: { type: 'approve' } });
          return;
        }
        default: {
          const leftover: never = result;
          return leftover;
        }
      }
    } finally {
      busy.current = false;
    }
  }

  return (
    <main>
      {view.kind === 'start' ? (
        <StartScreen
          view={view}
          churchName={visit.church.name}
          onBegin={() => dispatch({ type: 'conversation', event: { type: 'beginIntake' } })}
          onExample={(id) => dispatch({ type: 'conversation', event: { type: 'openExample', id } })}
        />
      ) : null}
      {view.kind === 'question' ? (
        <QuestionScreen
          key={view.nodeId}
          ask={view}
          locked={locked}
          readyLine={readyLine}
          reaskPrompt={reask !== null && reask.nodeId === view.nodeId ? reask.prompt : null}
          clearEpoch={reask?.epoch ?? 0}
          spoken={spoken}
          onAnswer={onAnswer}
          dispatch={dispatch}
        />
      ) : null}
      {view.kind === 'brief' ? (
        <BriefScreen
          view={view}
          churchName={visit.church.name}
          leader={visit.church.leader}
          savedTitle={view.actions === 'draft' ? savedTitle : null}
          pending={pending}
          error={visit.intake.status === 'error' ? visit.intake.message : null}
          fixed={visit.conversation.updated.length > 0}
          helps={summary?.whatHelps ?? []}
          summaryWait={summaryWait}
          onApprove={() => void onApprove()}
          dispatch={dispatch}
        />
      ) : null}
      {view.kind === 'approved' ? <ApprovedScreen view={view} visit={visit} dispatch={dispatch} /> : null}
    </main>
  );
}

function StartScreen({
  view,
  churchName,
  onBegin,
  onExample,
}: {
  view: Extract<AskView, { kind: 'start' }>;
  churchName: string;
  onBegin: () => void;
  onExample: (id: Extract<AskView, { kind: 'start' }>['examples'][number]['id']) => void;
}) {
  const church = useAccountChurch();
  return (
    <section aria-label="Start">
      <h1>Who are we getting ready for?</h1>
      <p>
        You're a parent, getting your child ready for Sunday.
      </p>
      <PrivacyNote variant="full" note={parentStartPrivacy(churchName)} />
      <button type="button" className="primary" onClick={onBegin}>
        Start with a new child
      </button>
      <p className="divider">Or open a finished example</p>
      {view.examples.map((example) => (
        <button type="button" className="example-card" key={example.id} onClick={() => onExample(example.id)}>
          <span>
            <strong>
              {example.name}, {example.ageYears}
            </strong>
            <span className="hint">{example.blurb}</span>
          </span>
          <span className="badge">Complete brief</span>
        </button>
      ))}
      {church === null ? (
        <p className="footer-note">
          Examples are built into the demo with fictional children. Nothing typed here is saved, so they are always
          ready to show.
        </p>
      ) : null}
    </section>
  );
}

function QuestionScreen({
  ask,
  locked,
  readyLine,
  reaskPrompt,
  clearEpoch,
  spoken,
  onAnswer,
  dispatch,
}: {
  ask: Extract<AskView, { kind: 'question' }>;
  locked: boolean;
  readyLine: string | null;
  reaskPrompt: string | null;
  clearEpoch: number;
  spoken: string | null;
  onAnswer: (text: string) => void;
  dispatch: Dispatch<VisitEvent>;
}) {
  const [draft, setDraft] = useState(ask.priorAnswer ?? '');
  const [mic, setMic] = useState<Mic>({ phase: 'off' });
  const [now, setNow] = useState(0);
  const [speech, setSpeech] = useState<'ready' | 'missing'>('missing');
  const session = useRef<{ stop(): void } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const seenEpoch = useRef(0);

  useEffect(() => {
    setSpeech(speechSupport());
  }, []);

  useEffect(() => {
    session.current?.stop();
    session.current = null;
    setMic({ phase: 'off' });
    if (clearEpoch > seenEpoch.current) {
      seenEpoch.current = clearEpoch;
      setDraft('');
      field.current?.focus();
      return;
    }
    setDraft(ask.priorAnswer ?? '');
  }, [ask.fixing, ask.nodeId, ask.priorAnswer, clearEpoch]);

  useEffect(() => {
    if (mic.phase !== 'live') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [mic]);

  useEffect(() => () => session.current?.stop(), []);

  function stopMic(): void {
    session.current?.stop();
    session.current = null;
    setMic({ phase: 'off' });
  }

  function startMic(): void {
    session.current?.stop();
    const startedAt = Date.now();
    try {
      session.current = listen(
        (text) => setDraft(text),
        undefined,
        () => setMic({ phase: 'off' }),
      );
      setMic({ phase: 'live', startedAt });
      setNow(startedAt);
    } catch {
      session.current = null;
      setMic({ phase: 'off' });
    }
  }

  function submit(text: string): void {
    stopMic();
    onAnswer(text);
  }

  return (
    <section id="intake" aria-label="Questions">
      {ask.fixing ? (
        <>
          <p className="eyebrow">Fixing: {ask.sectionTitle}</p>
          <p className="bubble ready">Which part should we fix?</p>
          <div className="chips">
            {ask.sections.map((section) => (
              <button
                type="button"
                key={section.id}
                aria-pressed={section.id === sectionIdOf(ask)}
                disabled={locked}
                onClick={() => dispatch({ type: 'conversation', event: { type: 'chooseSection', sectionId: section.id } })}
              >
                {section.label}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <p className="guided">Guided by Ready</p>
          <p className="progress-label">
            <span>{ask.progress}</span>
            <span>Every question required</span>
          </p>
          <div className="bars" aria-hidden="true">
            {Array.from({ length: ask.total }, (_, index) => (
              <span className={index < ask.index ? 'on' : undefined} key={index} />
            ))}
          </div>
        </>
      )}
      {spoken === null || ask.fixing ? null : <p className="bubble parent">{spoken}</p>}
      {locked || readyLine !== null || reaskPrompt !== null ? (
        <article className="story-card" aria-busy={locked}>
          {locked ? (
            <DraftStatus copy="Ready is reading your answer..." />
          ) : (
            <p>{readyLine ?? reaskPrompt}</p>
          )}
        </article>
      ) : null}
      <div role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation">
        <article className="question-card">
          <p className="eyebrow">{ask.mark}</p>
          <h2 id="current-question">{ask.prompt}</h2>
          {ask.help === null ? null : (
            <p className="hint" id="question-help">
              {ask.help}
            </p>
          )}
          {ask.notice === null ? null : (
            <p className="notice" role="status">
              {ask.notice}
            </p>
          )}
          {ask.followAnswer === null ? null : <p>{ask.followAnswer}</p>}
        </article>
      </div>
      {locked || ask.chips.length === 0 ? null : (
        <div className="chips">
          {ask.chips.map((chip) => (
            <button type="button" key={chip} onClick={() => submit(chipText(ask, draft, chip))}>
              {chip}
            </button>
          ))}
        </div>
      )}
      {locked || ask.closeChip === null ? null : (
        <button
          type="button"
          className="inline"
          onClick={() => submit(draft.trim() === '' ? ask.closeChip ?? '' : draft)}
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
          ref={field}
          rows={3}
          value={draft}
          placeholder={locked ? 'Ready is reading your answer...' : ask.placeholder}
          aria-describedby={locked ? undefined : ask.help === null ? 'current-question' : 'current-question question-help'}
          autoComplete="off"
          disabled={locked}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          className={mic.phase === 'live' ? 'mic live' : 'mic'}
          aria-label={mic.phase === 'live' ? 'Stop recording' : 'Mic is off'}
          disabled={locked}
          onClick={() => {
            if (mic.phase === 'live') {
              stopMic();
              return;
            }
            if (speech !== 'ready') return;
            startMic();
          }}
        >
          {mic.phase === 'live' ? <span className="mic-ring" aria-hidden="true" /> : null}
          {mic.phase === 'live' ? <span className="mic-square" aria-hidden="true" /> : <MicIcon />}
        </button>
      </div>
      {ask.fixing ? null : (
        <p className="hint">
          Tap the mic to talk, or type. Every question needs an answer. You can review and fix anything at the end.
        </p>
      )}
      {mic.phase === 'live' ? (
        <p className="draft-status" role="status">
          Mic is on
          <span className="mic-timer">{clock(now - mic.startedAt)}</span>
        </p>
      ) : null}
      {speech === 'missing' ? <p className="hint">This browser can&apos;t use the mic. Type your answer instead.</p> : null}
      {ask.fixing ? (
        <>
          <button type="button" className="primary" disabled={locked || draft.trim() === ''} onClick={() => submit(draft)}>
            Save fix and see the brief
          </button>
          <p className="hint">
            Only {ask.sectionTitle} is redrafted. Saving takes you straight back to the updated brief, not into the
            questions.
          </p>
        </>
      ) : (
        <button type="button" className="primary" disabled={locked || draft.trim() === ''} onClick={() => submit(draft)}>
          Send
        </button>
      )}
    </section>
  );
}

function BriefScreen({
  view,
  churchName,
  leader,
  savedTitle,
  pending,
  error,
  fixed,
  helps,
  summaryWait,
  onApprove,
  dispatch,
}: {
  view: Extract<AskView, { kind: 'brief' }>;
  churchName: string;
  leader: string;
  savedTitle: string | null;
  pending: boolean;
  error: string | null;
  fixed: boolean;
  helps: readonly string[];
  summaryWait: boolean;
  onApprove: () => void;
  dispatch: Dispatch<VisitEvent>;
}) {
  const [picking, setPicking] = useState(false);
  const brief = view.brief;
  const readonly = view.actions === 'readonly';
  const sharing = pendingApprovalCopy(leader, brief.name);
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);
  return (
    <section aria-label="Brief">
      <div className="top-bar">
        {view.actions === 'draft' ? (
          <button
            type="button"
            className="back"
            onClick={() => dispatch({ type: 'conversation', event: { type: 'reopenQuestions' } })}
          >
            Back to questions
          </button>
        ) : (
          <button
            type="button"
            className="back"
            onClick={() => dispatch({ type: 'conversation', event: { type: 'backToApproved' } })}
          >
            ← {brief.name} is ready for Sunday
          </button>
        )}
        {readonly ? (
          <p className="guided">Approved</p>
        ) : (
          <p className="drafted">
            <Spark /> Built from your answers
          </p>
        )}
      </div>
      <h1>{brief.name}&apos;s brief</h1>
      <p className="lede">
        {readonly
          ? `Approved. This is what ${leader} and this Sunday's volunteers read.`
          : `This is what ${brief.name}'s volunteers will read. Approve it, or tell Ready what to fix.`}
      </p>
      <article className="brief-card identity">
        <span className="portrait" aria-hidden="true">
          {brief.name.slice(0, 1)}
        </span>
        <div>
          <h2>
            {brief.name}, {brief.ageYears}
          </h2>
          <p>{brief.summary}</p>
        </div>
      </article>
      {view.actions === 'draft' ? (
        <WhatHelpsCard name={brief.name} bullets={helps} audience="review" waiting={summaryWait} />
      ) : null}
      <p className="section-label">{brief.name}&apos;s brief</p>
      {savedTitle === null ? null : (
        <p className="banner" role="status">
          Saved. {savedTitle} is updated.
        </p>
      )}
      {brief.cards.map((card) => (
        <article className="brief-card sectioned" key={card.sectionId}>
          <h2>
            {card.label}
            {card.updated ? <span className="badge">Updated</span> : null}
          </h2>
          {card.sectionId === 'behavior' ? <p>{behaviorAsked(brief.name)}</p> : null}
          <ul>
            {spokenLines(card.text).map((line, index) => (
              <li key={`${index}-${line}`}>{line}</li>
            ))}
          </ul>
        </article>
      ))}
      {error === null ? null : <p role="alert">{error}</p>}
      <PrivacyNote
        variant="full"
        note={parentReviewPrivacy({ name: brief.name, leader, churchName, readonly })}
      />
      {pending ? <p role="status">{sharing.status}</p> : null}
      {readonly ? (
        <button
          type="button"
          className="primary"
          onClick={() => dispatch({ type: 'conversation', event: { type: 'backToApproved' } })}
        >
          Back to {brief.name} is ready for Sunday
        </button>
      ) : (
        <button type="button" className="approve" disabled={pending} onClick={onApprove}>
          {pending ? sharing.button : 'Looks right, approve'}
        </button>
      )}
      {readonly && view.canLeave ? (
        <>
          <p className="hint">
            {brief.name} is a built-in example. This brief is already approved, so there is nothing to approve here.
          </p>
          <button
            type="button"
            className="text"
            onClick={() => dispatch({ type: 'conversation', event: { type: 'leaveExample' } })}
          >
            Back to the start
          </button>
        </>
      ) : null}
      {readonly || pending ? null : (
        <>
          <button type="button" onClick={() => setPicking((open) => !open)}>
            {fixed ? 'Fix something else' : 'Fix something'}
          </button>
          {picking ? (
            <div className="chips">
              {intakeTree.sections.flatMap((section) =>
                section.id === 'about' ? [] : (
                  <button
                    type="button"
                    key={section.id}
                    onClick={() =>
                      dispatch({ type: 'conversation', event: { type: 'chooseSection', sectionId: section.id } })
                    }
                  >
                    {section.reviewLabel}
                  </button>
                ),
              )}
            </div>
          ) : null}
        </>
      )}
      {view.actions === 'draft' && !pending ? (
        <p className="hint">Approve or fix is the only choice here. Nothing is shared until you approve.</p>
      ) : null}
    </section>
  );
}

function Spark() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        fill="currentColor"
        d="M8 1.2 9.1 6 13.8 8 9.1 10 8 14.8 6.9 10 2.2 8 6.9 6 8 1.2Z"
      />
    </svg>
  );
}

function ApprovedScreen({
  view,
  visit,
  dispatch,
}: {
  view: Extract<AskView, { kind: 'approved' }>;
  visit: Visit;
  dispatch: Dispatch<VisitEvent>;
}) {
  const photos = useChurchPhotos();
  const update = approvedValue(visit.update);
  const [reader, setReader] = useState<Reader>(initialReader());
  const request = useRef(0);
  const brief = checkInBrief(visit);

  async function requestStory(): Promise<void> {
    if (brief.status !== 'approved') return;
    const id = request.current + 1;
    request.current = id;
    setReader({ phase: 'writing' });
    const church = visit.church;
    const result = await postSocialStory(brief.lines, childPreferredName(visit), {
      name: church.name,
      service: church.service,
      room: church.room,
      leader: church.leader,
      plan: church.plan,
    });
    if (request.current !== id) return;
    if (!result.ok) {
      setReader(reduceReader({ phase: 'writing' }, { type: 'fail' }));
      return;
    }
    dispatch({ type: 'noteStory', value: result.value });
    setReader(reduceReader({ phase: 'writing' }, { type: 'loaded', value: result.value }));
  }

  function onRead(): void {
    if (reader.phase !== 'closed') return;
    const saved = savedStory(visit);
    if (saved !== null) {
      setReader(reduceReader(reader, { type: 'open', saved }));
      return;
    }
    void requestStory();
  }

  function onBack(): void {
    request.current += 1;
    setReader(reduceReader(reader, { type: 'back' }));
  }

  if (reader.phase !== 'closed') {
    return (
      <section aria-label="Sunday story">
        <div className="top-bar">
          <button type="button" className="back" onClick={onBack}>
            ← {view.name} is ready for Sunday
          </button>
        </div>
        {reader.phase === 'writing' ? (
          <>
            <h1>A Sunday story for {view.name}</h1>
            <article className="story-card" aria-busy="true">
              <DraftStatus copy={`Writing ${view.name}'s story…`} />
            </article>
          </>
        ) : null}
        {reader.phase === 'failed' ? (
          <>
            <h1>The story isn&apos;t ready yet</h1>
            <p>
              Ready couldn&apos;t write {view.name}&apos;s story just now. Nothing is lost, and {view.name}&apos;s brief
              is still approved. You can try again in a moment.
            </p>
            <button type="button" className="primary" onClick={() => void requestStory()}>
              Try again
            </button>
          </>
        ) : null}
        {reader.phase === 'shown' ? (
          <>
            <p className="eyebrow">A Sunday story for {view.name}</p>
            <h1>{reader.title}</h1>
            <p className="drafted">
              <Spark /> {storyPrivacy({ name: view.name, room: visit.church.room, source: reader.source }).pill}
            </p>
            <article className="story-card">
              {reader.paragraphs.map((paragraph, index) => {
                const slot = readerSlots[index];
                return (
                  <Fragment key={`${index}-${paragraph}`}>
                    {slot === undefined ? null : <StoryPagePicture slot={slot} photos={photos} />}
                    <p>{paragraph}</p>
                    {index === 3 ? <SundayScheduleCard /> : null}
                  </Fragment>
                );
              })}
            </article>
            <PrivacyNote
              variant="line"
              text={storyPrivacy({ name: view.name, room: visit.church.room, source: reader.source }).line}
            />
            <p className="hint">Read it together before you go.</p>
          </>
        ) : null}
      </section>
    );
  }

  return (
    <section aria-label="Ready">
      <div className="screen-only">
      <div className="identity">
        <span className="portrait" aria-hidden="true">
          {view.name.slice(0, 1)}
        </span>
        <p className="guided">Approved</p>
      </div>
      <h1>{view.headline}</h1>
      <p>
        Thank you. {view.name}&apos;s room leader and volunteers will read the brief before class. Nothing else is
        needed from you.
      </p>
      <ol>
        <li>Your approved brief goes to {view.name}&apos;s room leader</li>
        <li>Volunteers read it before class</li>
        <li>You get a short note after Sunday</li>
      </ol>
      <article className="story-card" id="sunday-story">
        <h2>A Sunday story for {view.name}</h2>
        <p>A short Sunday story about what Sunday will look like.</p>
        <button type="button" className="text" onClick={onRead}>
          Read {view.name}&apos;s story
        </button>
        <button type="button" className="outline" onClick={() => window.print()}>
          <PrinterIcon />
          Print {view.name}&apos;s Sunday story
        </button>
      </article>
      <section aria-label="Sunday update" id="sunday-update">
        <h2>Sunday update</h2>
        {update === null ? (
          <p>Waiting for an approved Sunday update.</p>
        ) : (
          <article className="story-card">
            <p className="draft-text">{update.body}</p>
          </article>
        )}
      </section>
      <button type="button" className="primary" onClick={() => dispatch({ type: 'conversation', event: { type: 'viewBrief' } })}>
        View {view.name}&apos;s brief
      </button>
      {view.canRevise ? (
        <button
          type="button"
          className="text"
          onClick={() => dispatch({ type: 'conversation', event: { type: 'reviseBrief' } })}
        >
          Something changed? Update the brief
        </button>
      ) : null}
      {view.canLeave ? (
        <button
          type="button"
          className="text"
          onClick={() => dispatch({ type: 'conversation', event: { type: 'leaveExample' } })}
        >
          Back to the start
        </button>
      ) : null}
      </div>
      <SundayPrint visit={visit} photos={photos} />
    </section>
  );
}

function PrinterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 8V3h10v5" />
      <path d="M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="13" width="10" height="8" rx="1" />
    </svg>
  );
}

function savedStory(visit: Visit): SocialStory | null {
  switch (visit.story.phase) {
    case 'ready':
    case 'approved':
      return visit.story.value;
    case 'idle':
    case 'writing':
    case 'failed':
      return null;
    default: {
      const leftover: never = visit.story;
      return leftover;
    }
  }
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"
      />
    </svg>
  );
}

function sameQuestion(current: Conversation, next: Conversation): boolean {
  const talk = current.talk;
  if (talk.mode !== 'ask' && talk.mode !== 'fix') return false;
  return next.talk.mode === talk.mode && next.talk.nodeId === talk.nodeId;
}

function sectionTitle(conversation: Conversation): string | null {
  const talk = conversation.talk;
  if (talk.mode !== 'ask' && talk.mode !== 'fix') return null;
  const nodeId = talk.nodeId;
  const node = intakeTree.nodes.find((item) => item.id === nodeId);
  if (node === undefined) return null;
  return intakeTree.sections.find((section) => section.id === node.sectionId)?.title ?? null;
}

function sectionIdOf(ask: Extract<AskView, { kind: 'question' }>): SectionId | null {
  const section = intakeTree.sections.find((item) => item.title === ask.sectionTitle);
  return section?.id ?? null;
}

function chipText(ask: Extract<AskView, { kind: 'question' }>, draft: string, chip: string): string {
  if (ask.fixing || ask.chipsAlone || (ask.exactChip !== null && chip === ask.exactChip)) return chip;
  return joinSpoken(draft, chip);
}

function spokenLines(text: string): string[] {
  return text.split(/(?<=[.!?])\s+/u).filter((line) => line.length > 0);
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function delayResult(ms: number): Promise<{ kind: 'timeout' }> {
  return new Promise((resolve) => {
    setTimeout(() => resolve({ kind: 'timeout' }), ms);
  });
}

function ackResult(outcome: AckPost | { kind: 'timeout' }): AckResult {
  switch (outcome.kind) {
    case 'line':
      return {
        kind: 'line',
        relevant: outcome.relevant,
        line: outcome.line,
        clarifyingPrompt: outcome.clarifyingPrompt,
      };
    case 'error':
      return { kind: 'error' };
    case 'timeout':
      return { kind: 'timeout' };
    default: {
      const leftover: never = outcome;
      return leftover;
    }
  }
}
