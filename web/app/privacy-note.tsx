import type { PrivacyFull } from '../lib/privacy-note';

type PrivacyNoteProps =
  | { readonly variant: 'full'; readonly note: PrivacyFull }
  | { readonly variant: 'line'; readonly text: string };

export function PrivacyNote(props: PrivacyNoteProps) {
  switch (props.variant) {
    case 'full':
      return (
        <section className="privacy-full">
          <Shield />
          <div>
            <h2>{props.note.title}</h2>
            <ul>
              {props.note.bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </div>
        </section>
      );
    case 'line':
      return (
        <p className="privacy-line">
          <Shield />
          <span>{props.text}</span>
        </p>
      );
    default: {
      const leftover: never = props;
      return leftover;
    }
  }
}

function Shield() {
  return (
    <svg className="shield" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        d="M12 3.2 18.5 5.8v5.5c0 3.6-2.4 6.4-6.5 7.8-4.1-1.4-6.5-4.2-6.5-7.8V5.8L12 3.2Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8.3 12.1 10.7 14.5 15.7 9.4"
      />
    </svg>
  );
}
