import type { ReactNode } from 'react';
import type { ChurchPhotoSet } from '../lib/ready-store';
import { SundayScheduleCard } from './sunday-schedule';
import {
  resolveStoryPicture,
  type StoryDrawing,
  type StoryPicture,
  type SundayStoryPage,
  sundayStoryPages,
} from '../lib/sunday-story';
import type { Visit } from '../lib/visit';

export function SundayPrint({ visit, photos }: { visit: Visit; photos: ChurchPhotoSet }) {
  return (
    <div className="sunday-print">
      {sundayStoryPages(visit).map((page) => (
        <PrintPage key={page.step} page={page} photos={photos} />
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

function PrintPage({ page, photos }: { page: SundayStoryPage; photos: ChurchPhotoSet }) {
  const pageSize = printTypeSize(page.step === 'cover' ? page.churchName : page.text);
  const picture = <StoryPagePicture slot={page.slot} photos={photos} />;
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
          {picture}
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
          {picture}
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

export function StoryPagePicture({
  slot,
  photos,
}: {
  slot: SundayStoryPage['slot'];
  photos: ChurchPhotoSet;
}) {
  return (
    <div className="sunday-print-picture">
      <StoryPictureView picture={resolveStoryPicture(slot, photos)} />
    </div>
  );
}

function StoryPictureView({ picture }: { picture: StoryPicture }) {
  switch (picture.kind) {
    case 'photo':
      return <img className="sunday-print-photo" src={picture.src} alt={picture.alt} />;
    case 'drawing':
      return <StoryDrawing drawing={picture.drawing} alt={picture.alt} />;
    default: {
      const leftover: never = picture;
      return leftover;
    }
  }
}

function StoryDrawing({ drawing, alt }: { drawing: StoryDrawing; alt: string }) {
  return (
    <svg viewBox="0 0 280 180" role="img" aria-label={alt} className="sunday-print-drawing">
      <title>{alt}</title>
      <g fill="none" stroke="currentColor" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round">
        <DrawingShape drawing={drawing} />
      </g>
    </svg>
  );
}

function DrawingShape({ drawing }: { drawing: StoryDrawing }): ReactNode {
  switch (drawing) {
    case 'building':
      return (
        <>
          <path d="M28 158 H252" />
          <path d="M64 158 V86 L140 28 L216 86 V158" />
          <path d="M140 28 V8 M126 16 H154" />
          <circle cx="140" cy="78" r="18" />
          <path d="M124 158 V118 Q124 96 140 96 Q156 96 156 118 V158" />
          <circle cx="214" cy="32" r="14" />
        </>
      );
    case 'doors':
      return (
        <>
          <path d="M28 158 H252" />
          <rect x="40" y="36" width="112" height="122" rx="12" />
          <path d="M96 48 V146 M84 92 V108 M108 92 V108" />
          <Face cx={188} cy={58} r={22} />
          <path d="M166 82 Q166 158 188 158 Q210 158 210 82" />
          <path d="M204 100 L232 78" />
        </>
      );
    case 'desk':
      return (
        <>
          <path d="M32 112 H248 M68 112 V158 M212 112 V158 M68 138 H212" />
          <rect x="86" y="40" width="108" height="56" rx="14" />
          <path d="M122 40 V26 H158 V40 M106 72 H174" />
        </>
      );
    case 'classroom':
      return (
        <>
          <rect x="114" y="14" width="52" height="44" rx="3" />
          <path d="M140 14 V58 M114 36 H166" />
          <ellipse cx="140" cy="142" rx="108" ry="20" />
          <path d="M52 70 V112 H100 M76 112 V136" />
          <path d="M228 70 V112 H180 M204 112 V136" />
          <path d="M124 100 H156 M132 100 V136 M148 100 V136" />
        </>
      );
    case 'helper':
      return (
        <>
          <path d="M28 158 H252" />
          <Face cx={100} cy={48} r={22} />
          <path d="M76 74 Q76 158 100 158 Q124 158 124 74" />
          <rect x="90" y="108" width="20" height="14" rx="2" />
          <path d="M214 92 C214 78 196 76 196 92 C196 76 178 78 178 92 C178 112 196 128 196 128 C196 128 214 112 214 92 Z" />
        </>
      );
    case 'quiet':
      return (
        <>
          <path d="M48 36 V158 H236" />
          <path d="M72 158 C72 100 208 100 208 158" />
          <path d="M96 132 Q140 116 184 132" />
          <path d="M220 158 V78" />
          <path d="M202 78 H244 L234 52 H212 Z" />
        </>
      );
    case 'pickup':
      return (
        <>
          <path d="M24 158 H256" />
          <Face cx={92} cy={46} r={24} />
          <path d="M68 74 V158" />
          <path d="M68 86 Q68 70 96 70 Q124 70 124 100" />
          <path d="M118 112 C146 132 162 104 170 112" />
          <Face cx={196} cy={78} r={18} />
          <path d="M180 98 Q180 158 196 158 Q212 158 212 98" />
        </>
      );
    default: {
      const leftover: never = drawing;
      return leftover;
    }
  }
}

function Face({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  const eye = Math.max(2.4, r * 0.12);
  return (
    <>
      <circle cx={cx} cy={cy} r={r} />
      <circle cx={cx - r * 0.34} cy={cy - r * 0.12} r={eye} fill="currentColor" stroke="none" />
      <circle cx={cx + r * 0.34} cy={cy - r * 0.12} r={eye} fill="currentColor" stroke="none" />
      <path d={`M${cx - r * 0.38} ${cy + r * 0.28} Q${cx} ${cy + r * 0.58} ${cx + r * 0.38} ${cy + r * 0.28}`} />
    </>
  );
}
