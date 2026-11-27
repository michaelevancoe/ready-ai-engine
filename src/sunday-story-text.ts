export interface SundaySentenceChurch {
  readonly name: string;
  readonly service: string;
  readonly room: string;
  readonly leader: string;
  readonly plan: string;
}

const CHURCH_FIELD_MAX = 200;
const CHURCH_PLAN_MAX = 2000;

const fullestChurch = {
  name: 'n'.repeat(CHURCH_FIELD_MAX),
  service: 's'.repeat(CHURCH_FIELD_MAX),
  room: 'r'.repeat(CHURCH_FIELD_MAX),
  leader: 'l'.repeat(CHURCH_FIELD_MAX),
  plan: 'p'.repeat(CHURCH_PLAN_MAX),
};

export const STORY_BEATS = ['arrive', 'doors', 'desk', 'room', 'helper', 'quiet', 'pickup'] as const;

export type StoryBeat = (typeof STORY_BEATS)[number];

export type StoryPages = { readonly [beat in StoryBeat]: string };

export const SUNDAY_STORY_PAGE_MAX = Math.max(...sundayStorySentences(fullestChurch).map((sentence) => sentence.length));

export function sundayStorySentences(
  church: SundaySentenceChurch,
): readonly [string, string, string, string, string, string, string] {
  return [
    arrival(church),
    'You walk in the front doors. A greeter smiles and says hello.',
    'At the welcome desk, you check in and get a name tag.',
    classroom(church),
    `${church.leader} and the helpers are there to help you.`,
    'If you need a break, there is a quiet spot in the room.',
    'When it is over, your grown-up comes back to pick you up.',
  ];
}

export function templateStoryPages(church: SundaySentenceChurch): StoryPages {
  const [arrive, doors, desk, room, helper, quiet, pickup] = sundayStorySentences(church);
  return { arrive, doors, desk, room, helper, quiet, pickup };
}

function arrival(church: SundaySentenceChurch): string {
  const service = church.service.trim();
  const place = `you and your grown-up go to ${church.name}.`;
  if (service === '') return `You and your grown-up go to ${church.name}.`;
  const split = service.search(/\s/u);
  if (split === -1) return `On ${service}, ${place}`;
  const day = service.slice(0, split);
  const time = service.slice(split).trim();
  return `On ${day} at ${time}, ${place}`;
}

function classroom(church: SundaySentenceChurch): string {
  return `You go to the ${church.room}. You will have ${planClause(church.plan)}`;
}

function planClause(plan: string): string {
  const trimmed = plan.trim();
  const lowered = `${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
  if (/[.!?]$/u.test(lowered)) return lowered;
  return `${lowered}.`;
}
