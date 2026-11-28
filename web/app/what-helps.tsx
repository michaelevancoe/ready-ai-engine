import { whatHelpsNote, type WhatHelpsAudience } from '../lib/what-helps';
import { DraftStatus } from './draft-status';

export function WhatHelpsCard({
  name,
  bullets,
  audience,
  waiting = false,
}: {
  name: string;
  bullets: readonly string[];
  audience: WhatHelpsAudience;
  waiting?: boolean;
}) {
  if (!waiting && bullets.length < 3) return null;
  return (
    <article className="story-card brief-card what-helps" aria-busy={waiting}>
      <p className="pill">✦ Summary by Ready</p>
      <h2>What helps {name}</h2>
      {waiting ? (
        <DraftStatus copy={`Writing ${name}'s summary…`} />
      ) : (
        <ul>
          {bullets.map((bullet) => (
            <li key={bullet}>{bullet}</li>
          ))}
        </ul>
      )}
      {waiting ? null : <p className="hint">{whatHelpsNote(audience)}</p>}
    </article>
  );
}
