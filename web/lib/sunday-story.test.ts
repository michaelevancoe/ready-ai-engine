import assert from 'node:assert/strict';
import { test } from 'node:test';
import { exampleBrief } from './example-briefs.ts';
import { STORY_BEATS, type StoryPages } from '../../src/sunday-story-text.ts';
import { resolveStoryPicture, sundayStoryPages, type SundayStoryPage } from './sunday-story.ts';
import { childPreferredName, initialVisit, reduceVisit, type SocialStory, type Visit } from './visit.ts';
import type { ChurchPhotoSet } from './ready-store.ts';

const emptyPhotos: ChurchPhotoSet = {
  outside: null,
  doors: null,
  desk: null,
  classroom: null,
  quiet: null,
  pickup: null,
};

test('a Sunday story is a cover plus seven steps in order', () => {
  const pages = sundayStoryPages(initialVisit());
  assert.deepEqual(
    pages.map((page) => described(page)),
    [
      {
        step: 'cover',
        slot: 'cover',
        title: "Rowan's Sunday at",
        churchName: 'Example Harbor Fellowship',
        subtitle: 'A story to read together before Sunday',
        notice: "Simple version · Ready's personal story wasn't available just now",
      },
      {
        step: 1,
        slot: 'outside',
        text: 'On Sunday at 9:00, you and your grown-up go to Example Harbor Fellowship.',
      },
      {
        step: 2,
        slot: 'doors',
        text: 'You walk in the front doors. A greeter smiles and says hello.',
      },
      {
        step: 3,
        slot: 'desk',
        text: 'At the welcome desk, you check in and get a name tag.',
      },
      {
        step: 4,
        slot: 'classroom',
        text: 'You go to the Harbor Room. You will have a short welcome, one song, and a quiet activity.',
      },
      {
        step: 5,
        slot: 'helper',
        text: 'Ms. Dana and the helpers are there to help you.',
      },
      {
        step: 6,
        slot: 'quiet',
        text: 'If you need a break, there is a quiet spot in the room.',
      },
      {
        step: 7,
        slot: 'pickup',
        text: 'When it is over, your grown-up comes back to pick you up.',
      },
    ],
  );
});

test('the arrival sentence splits a day and time, and a plan keeps its ending mark', () => {
  const visit = initialVisit();
  assert.equal(
    stepText(withChurch(visit, { service: 'Sunday' }), 1),
    'On Sunday, you and your grown-up go to Example Harbor Fellowship.',
  );
  assert.equal(
    stepText(withChurch(visit, { service: '   ' }), 1),
    'You and your grown-up go to Example Harbor Fellowship.',
  );
  assert.equal(
    stepText(withChurch(visit, { service: '' }), 1),
    'You and your grown-up go to Example Harbor Fellowship.',
  );
  assert.equal(
    stepText(withChurch(visit, { plan: 'One song.' }), 4),
    'You go to the Harbor Room. You will have one song.',
  );
  assert.equal(
    stepText(withChurch(visit, { plan: 'One song' }), 4),
    'You go to the Harbor Room. You will have one song.',
  );
  assert.equal(
    stepText(withChurch(visit, { plan: 'Welcome!' }), 4),
    'You go to the Harbor Room. You will have welcome!',
  );
});

test('example stories name the child and leave out the brief', () => {
  const mayaAllergy = exampleBrief('maya').cards.find((card) => card.sectionId === 'allergies')?.text ?? '';
  assert.match(mayaAllergy, /peanut allergy/);
  for (const id of ['rowan', 'maya', 'jonah'] as const) {
    const visit = reduceVisit(initialVisit(), { type: 'conversation', event: { type: 'openExample', id } });
    const text = sundayStoryPages(visit)
      .map((page) => (page.step === 'cover' ? `${page.title}\n${page.churchName}\n${page.subtitle}` : page.text))
      .join('\n');
    assert.equal(text.includes(childPreferredName(visit)), true);
    assert.equal(text.includes(mayaAllergy), false);
    for (const word of ['peanut', 'allergy', 'allergies', 'medical', 'diagnosis', 'brief', 'headphone']) {
      assert.equal(text.toLowerCase().includes(word), false, word);
    }
  }
});

test('a ready story prints the same seven pages the screen shows', () => {
  const pages: StoryPages = {
    arrive: 'Rowan arrives with a quiet hello.',
    doors: 'Rowan walks in the front doors.',
    desk: 'Rowan stops at the welcome desk.',
    room: 'Rowan finds a picture in the hall.',
    helper: 'A helper waves at Rowan.',
    quiet: 'Rowan can hold a small fox.',
    pickup: 'Rowan goes home with a grown-up.',
  };
  const story: SocialStory = { title: 'Sunday with Rowan', pages, source: 'model' };
  const visit: Visit = {
    ...initialVisit(),
    brief: { phase: 'approved', lines: [] },
    story: { phase: 'ready', value: story },
  };
  const printed = sundayStoryPages(visit);
  assert.equal(printed.length, 8);
  assert.equal(printed[0]?.step, 'cover');
  if (printed[0]?.step === 'cover') assert.equal(printed[0].notice, null);
  const steps = printed.slice(1);
  assert.deepEqual(
    steps.map((page) => (page.step === 'cover' ? '' : page.text)),
    STORY_BEATS.map((beat) => pages[beat]),
  );
  assert.deepEqual(
    steps.map((page) => page.slot),
    ['outside', 'doors', 'desk', 'classroom', 'helper', 'quiet', 'pickup'],
  );
  const approved: Visit = { ...visit, story: { phase: 'approved', value: story } };
  assert.deepEqual(
    sundayStoryPages(approved).slice(1).map((page) => (page.step === 'cover' ? '' : page.text)),
    STORY_BEATS.map((beat) => pages[beat]),
  );
});

test('a story picture prefers an upload, then a sample, then a drawing', () => {
  const upload = { ...emptyPhotos, classroom: 'blob:room' };
  const samples = { classroom: { src: '/custom/classroom.jpg', alt: 'Custom classroom' } };
  assert.deepEqual(resolveStoryPicture('classroom', upload, samples), {
    kind: 'photo',
    source: 'upload',
    src: 'blob:room',
    alt: 'A classroom in a fictional church',
  });
  assert.deepEqual(resolveStoryPicture('classroom', emptyPhotos, samples), {
    kind: 'photo',
    source: 'sample',
    src: '/custom/classroom.jpg',
    alt: 'Custom classroom',
  });
  const bundled = [
    ['outside', '/sunday-story/outside.jpg', 'The outside of a small fictional church'],
    ['doors', '/sunday-story/front-doors.jpg', 'Front doors of a fictional church'],
    ['desk', '/sunday-story/welcome-desk.jpg', 'A welcome desk in a fictional church'],
    ['classroom', '/sunday-story/classroom.jpg', 'A classroom in a fictional church'],
    ['quiet', '/sunday-story/quiet-spot.jpg', 'A quiet corner in a fictional church room'],
    ['pickup', '/sunday-story/pickup.jpg', 'A pickup bench in a fictional church'],
  ] as const;
  for (const [slot, src, alt] of bundled) {
    assert.deepEqual(resolveStoryPicture(slot, emptyPhotos), { kind: 'photo', source: 'sample', src, alt });
  }
  assert.deepEqual(resolveStoryPicture('classroom', emptyPhotos, {}), {
    kind: 'drawing',
    drawing: 'classroom',
    alt: 'A line drawing of a classroom',
  });
  assert.deepEqual(resolveStoryPicture('outside', emptyPhotos, {}), {
    kind: 'drawing',
    drawing: 'building',
    alt: 'A line drawing of a church building',
  });
  assert.deepEqual(resolveStoryPicture('helper', upload), {
    kind: 'drawing',
    drawing: 'helper',
    alt: 'A line drawing of a helper',
  });
  assert.deepEqual(resolveStoryPicture('cover', upload), {
    kind: 'drawing',
    drawing: 'building',
    alt: 'A line drawing of a church building',
  });
});

test('print names the simple version until a personal story is ready', () => {
  const pill = "Simple version · Ready's personal story wasn't available just now";
  const template = templatePages();
  const fallback: SocialStory = { title: 'Sunday with Rowan', pages: template, source: 'fallback' };
  const stories = [
    { phase: 'idle' },
    { phase: 'writing' },
    { phase: 'failed', message: 'The draft could not be written. Try again.' },
    { phase: 'ready', value: fallback },
    { phase: 'approved', value: fallback },
  ] as const;
  for (const story of stories) {
    const pages = sundayStoryPages({ ...initialVisit(), story });
    assert.equal(pages.length, 8);
    assert.equal(pages[0]?.step, 'cover');
    if (pages[0]?.step !== 'cover') continue;
    assert.equal(pages[0].notice, pill);
  }
});

function templatePages(): StoryPages {
  const visit = initialVisit();
  const pages = sundayStoryPages(visit);
  const text = (step: 1 | 2 | 3 | 4 | 5 | 6 | 7) => {
    const page = pages.find((item) => item.step === step);
    if (page === undefined || page.step === 'cover') throw new Error(`missing step ${step}`);
    return page.text;
  };
  return {
    arrive: text(1),
    doors: text(2),
    desk: text(3),
    room: text(4),
    helper: text(5),
    quiet: text(6),
    pickup: text(7),
  };
}

function described(page: SundayStoryPage): { step: SundayStoryPage['step']; slot: SundayStoryPage['slot'] } & Record<string, string | number | null> {
  if (page.step === 'cover') {
    return {
      step: page.step,
      slot: page.slot,
      title: page.title,
      churchName: page.churchName,
      subtitle: page.subtitle,
      notice: page.notice,
    };
  }
  return { step: page.step, slot: page.slot, text: page.text };
}

function stepText(visit: Visit, step: 1 | 2 | 3 | 4 | 5 | 6 | 7): string {
  const page = sundayStoryPages(visit).find((item) => item.step === step);
  if (page === undefined || page.step === 'cover') throw new Error(`missing step ${step}`);
  return page.text;
}

function withChurch(visit: Visit, church: Partial<Visit['church']>): Visit {
  return { ...visit, church: { ...visit.church, ...church } };
}
