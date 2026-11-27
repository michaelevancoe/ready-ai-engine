'use client';

import Link from 'next/link';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { StoreBoot } from '../lib/select-store';
import {
  CHURCHES,
  INACTIVE_BODY,
  churchById,
  headerTone,
  reduceSignIn,
  type ChurchOption,
  type SignInView,
} from '../lib/sign-in';
import { VisitShell } from './visit-shell';

export function SignInGate({ boot, children }: { boot: StoreBoot; children: ReactNode }) {
  const [view, setView] = useState<SignInView>({ kind: 'email' });
  const [draft, setDraft] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invite = params.get('invite');
    const email = (params.get('email') ?? 'maya.parent@example.com').trim();
    const churchId = params.get('church') === 'riverside' ? 'riverside' : 'harbor';
    if (invite === 'inactive') setView({ kind: 'inactive', email });
    else if (invite === 'link') setView({ kind: 'choose', email, churchId });
    else if (invite === 'signed-in') setView({ kind: 'app', email, churchId, menu: false });
  }, []);

  if (view.kind === 'demo') {
    return <VisitShell boot={{ mode: 'demo' }}>{children}</VisitShell>;
  }
  if (view.kind === 'app') {
    const church = churchById(view.churchId);
    return (
      <VisitShell
        boot={boot}
        churchName={church.name}
        bar={
          <AccountBar
            church={church}
            email={view.email}
            menu={view.menu}
            onMenu={() => setView((current) => reduceSignIn(current, { type: 'menu' }))}
            onSwitch={() => setView((current) => reduceSignIn(current, { type: 'switch' }))}
            onSignOut={() => setView((current) => reduceSignIn(current, { type: 'signOut' }))}
          />
        }
      >
        {children}
      </VisitShell>
    );
  }

  return (
    <div className="frame sign-in">
      {view.kind === 'email' ? (
        <EmailStep
          draft={draft}
          onDraft={setDraft}
          onSubmit={(email) => setView((current) => reduceSignIn(current, { type: 'send', email }))}
          onDemo={() => setView({ kind: 'demo' })}
        />
      ) : null}
      {view.kind === 'check' ? (
        <CheckStep
          email={view.email}
          onBack={() => setView({ kind: 'email' })}
          onDifferent={() => setView({ kind: 'email' })}
        />
      ) : null}
      {view.kind === 'choose' ? (
        <ChooseStep
          email={view.email}
          churchId={view.churchId}
          onChoose={(churchId) => setView((current) => reduceSignIn(current, { type: 'choose', churchId }))}
          onContinue={() => setView((current) => reduceSignIn(current, { type: 'continue' }))}
        />
      ) : null}
      {view.kind === 'inactive' ? (
        <InactiveStep
          email={view.email}
          onDifferent={() => setView({ kind: 'email' })}
          onDemo={() => setView({ kind: 'demo' })}
        />
      ) : null}
      <p className="sample-pill">Sample data · fictional</p>
    </div>
  );
}

function EmailStep({
  draft,
  onDraft,
  onSubmit,
  onDemo,
}: {
  draft: string;
  onDraft: (value: string) => void;
  onSubmit: (email: string) => void;
  onDemo: () => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    onSubmit(draft);
  }
  return (
    <>
      <SignMark invite />
      <h1>Sign in to Ready</h1>
      <p>Ready helps your family and church get each child ready for Sunday.</p>
      <form onSubmit={submit}>
        <label>
          Email
          <input
            type="email"
            autoComplete="email"
            placeholder="maya.parent@example.com"
            value={draft}
            onChange={(event) => onDraft(event.target.value)}
          />
        </label>
        <button className="primary" type="submit" disabled={draft.trim().length === 0}>
          Send me a sign-in link
        </button>
      </form>
      <p className="hint">We'll email you a one-time link. No password needed.</p>
      <p className="invite-note">
        <LockIcon />
        <span>Only invited families and church leaders can sign in.</span>
      </p>
      <button className="text demo-link" type="button" onClick={onDemo}>
        Just looking? Try the demo
      </button>
    </>
  );
}

function CheckStep({ email, onBack, onDifferent }: { email: string; onBack: () => void; onDifferent: () => void }) {
  return (
    <>
      <div className="sign-tools">
        <button className="text back" type="button" onClick={onBack}>
          <Chevron /> Back
        </button>
        <span className="pill">
          <LockIcon /> Invite only
        </span>
      </div>
      <p className="sign-icon" aria-hidden="true">
        <ArrowUp />
      </p>
      <h1>Check your email</h1>
      <p className="hint">We sent a sign-in link to</p>
      <p className="sent-to">{email}</p>
      <p className="invite-note plain">
        Open the link on this phone to sign in. It works once and expires in 1 hour.
      </p>
      <p className="hint">Nothing after a few minutes? Check your spam folder.</p>
      <button className="text demo-link left" type="button" onClick={onDifferent}>
        Use a different email
      </button>
    </>
  );
}

function ChooseStep({
  email,
  churchId,
  onChoose,
  onContinue,
}: {
  email: string;
  churchId: ChurchOption['id'];
  onChoose: (churchId: string) => void;
  onContinue: () => void;
}) {
  return (
    <>
      <SignMark invite={false} />
      <h1>Choose your church</h1>
      <p>
        Your email is invited to two churches. Pick the one you're here for today. You can switch any time from the
        account menu.
      </p>
      <p className="sr">Signed in as {email}</p>
      <fieldset>
        <legend className="sr">Churches</legend>
        {CHURCHES.map((church) => (
          <label key={church.id} className={church.id === churchId ? 'church picked' : 'church'}>
            <input
              type="radio"
              name="church"
              checked={church.id === churchId}
              onChange={() => onChoose(church.id)}
            />
            <span>
              <strong>{church.name}</strong>
              <small>
                {church.ministry} · {church.role}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      <button className="primary continue" type="button" onClick={onContinue}>
        Continue
      </button>
    </>
  );
}

function InactiveStep({ email, onDifferent, onDemo }: { email: string; onDifferent: () => void; onDemo: () => void }) {
  const address = email === '' ? 'this email' : email;
  const churchName = CHURCHES.find((item) => item.id === 'harbor')?.name ?? '';
  return (
    <>
      <SignMark invite />
      <p className="sign-icon clock" aria-hidden="true">
        <ClockIcon />
      </p>
      <h1>This invite isn't active</h1>
      <p>{INACTIVE_BODY}</p>
      <section className="contact-card">
        <p className="eyebrow">Who to contact</p>
        <h2>Your children's ministry leader</h2>
        <p>Ask them to invite {address}. At {churchName}, that's Devon in Kids Ministry.</p>
      </section>
      <button className="secondary" type="button" onClick={onDifferent}>
        Try a different email
      </button>
      <button className="text demo-link" type="button" onClick={onDemo}>
        Just looking? Try the demo
      </button>
    </>
  );
}

function SignMark({ invite }: { invite: boolean }) {
  return (
    <div className="sign-tools">
      <p className="wordmark">Ready</p>
      <span className={invite ? 'pill' : 'pill signed'}>
        {invite ? <LockIcon /> : <CheckIcon />}
        {invite ? 'Invite only' : 'Signed in'}
      </span>
    </div>
  );
}

function AccountBar({
  church,
  email,
  menu,
  onMenu,
  onSwitch,
  onSignOut,
}: {
  church: ChurchOption;
  email: string;
  menu: boolean;
  onMenu: () => void;
  onSwitch: () => void;
  onSignOut: () => void;
}) {
  const tone = headerTone(church.role);
  return (
    <>
      <div className="account-bar">
        <Link href="/">
          <Chevron /> Home
        </Link>
        <button className="account-person" type="button" aria-expanded={menu} onClick={onMenu}>
          <span className={`avatar ${tone}`}>{church.initial}</span>
          <span>
            <strong>{church.person}</strong>
            <small>{church.role}</small>
          </span>
        </button>
        <button className="text" type="button" onClick={onSignOut}>
          Sign out
        </button>
      </div>
      {menu ? (
        <section className="account-menu" aria-label="Account">
          <p className="eyebrow">Signed in as</p>
          <p className="menu-value">{email}</p>
          <div className="menu-row">
            <div>
              <p className="eyebrow">Church</p>
              <p className="menu-value">{church.name}</p>
            </div>
            <button className="text" type="button" onClick={onSwitch}>
              Switch
            </button>
          </div>
          <div className="menu-block">
            <p className="eyebrow">Role here</p>
            <p className="menu-value">{church.role}</p>
          </div>
          <button className="text menu-out" type="button" onClick={onSignOut}>
            Sign out
          </button>
        </section>
      ) : null}
    </>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <rect x="5" y="11" width="14" height="9" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M5 12.5 9.5 17 19 7" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M14.5 6 8.5 12l6 6" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}

function ArrowUp() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M12 19V6M6.5 11.5 12 6l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 8v5l3 2" fill="none" stroke="currentColor" strokeWidth="1.8" />
    </svg>
  );
}
