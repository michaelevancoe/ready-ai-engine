import { whatHelpsNote, type WhatHelpsAudience } from '../lib/what-helps';

export function WhatHelpsCard({
  name,
  bullets,
  audience,
}: {
  name: string;
  bullets: readonly string[];
  audience: WhatHelpsAudience;
}) {
  if (bullets.length < 3) return null;
  return (
    <article className="brief-card what-helps">
      <p className="pill">✦ Summary by Ready</p>
      <h2>What helps {name}</h2>
      <ul>
        {bullets.map((bullet) => (
          <li key={bullet}>{bullet}</li>
        ))}
      </ul>
      <p className="hint">{whatHelpsNote(audience)}</p>
    </article>
  );
}
