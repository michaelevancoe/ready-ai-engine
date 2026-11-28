import { SundayScheduleCard } from './sunday-schedule';
import { type SundayStoryPage, sundayStoryPages } from '../lib/sunday-story';
import type { Visit } from '../lib/visit';

export function SundayPrint({ visit }: { visit: Visit }) {
  return (
    <div className="sunday-print">
      {sundayStoryPages(visit).map((page) => (
        <PrintPage key={page.step} page={page} />
      ))}
    </div>
  );
}

function printTypeSize(text: string): '30' | '22' | '16' | '12' {
  const length = text.length;
  if (length <= 90) return '30';
  if (length <= 200) return '22';
  if (length <= 600) return '16';
  return '12';
}

function PrintPage({ page }: { page: SundayStoryPage }) {
  const pageSize = printTypeSize(page.step === 'cover' ? page.churchName : page.text);
  const footer = (
    <footer className="sunday-print-footer">
      <span>Fictional demo data · not a real church</span>
      <span className="sunday-print-mark">{page.step === 'cover' ? 'Cover' : page.step}</span>
    </footer>
  );
  switch (page.step) {
    case 'cover':
      return (
        <article className="sunday-print-page" data-print-size={pageSize}>
          <h1 className="sunday-print-title" data-print-size={printTypeSize(page.title)}>
            {page.title}
          </h1>
          <p className="sunday-print-church" data-print-size={printTypeSize(page.churchName)}>
            {page.churchName}
          </p>
          <p className="sunday-print-subtitle">{page.subtitle}</p>
          {page.notice === null ? null : <p className="sunday-print-subtitle">{page.notice}</p>}
          {footer}
        </article>
      );
    case 1:
    case 2:
    case 3:
    case 4:
    case 5:
    case 6:
    case 7:
      return (
        <article className="sunday-print-page" data-print-size={pageSize}>
          <p className="sunday-print-sentence" data-print-size={printTypeSize(page.text)}>
            {page.text}
          </p>
          {page.step === 4 ? <SundayScheduleCard /> : null}
          {footer}
        </article>
      );
    default: {
      const leftover: never = page;
      return leftover;
    }
  }
}
