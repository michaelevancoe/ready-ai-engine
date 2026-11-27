export interface PrivacyFull {
  readonly title: string;
  readonly bullets: readonly string[];
}

export interface PrivacyStory {
  readonly pill: string;
  readonly line: string;
}

export function parentStartPrivacy(churchName: string): PrivacyFull {
  return {
    title: 'Before you start: who sees what you share',
    bullets: [
      `Only your child's kids-ministry leader and this Sunday's volunteers at ${churchName} see the brief.`,
      'Nothing is shared until you approve it.',
      "Care notes you write go to your child's leaders exactly as you wrote them.",
      'The story your child reads stays simple and label-free.',
      'This demo uses made-up children. Nothing is saved to a database, and closing the tab clears it.',
    ],
  };
}

export function parentReviewPrivacy(input: {
  readonly name: string;
  readonly leader: string;
  readonly churchName: string;
  readonly readonly?: boolean;
}): PrivacyFull {
  return {
    title: `Who sees ${input.name}'s brief`,
    bullets: [
      `${input.leader} and this Sunday's volunteers at ${input.churchName}. No one else.`,
      ...(input.readonly === true ? [] : ['Nothing is shared until you approve. You can fix anything first.']),
      `Care notes you write, like allergies, go to ${input.name}'s leaders exactly as you wrote them.`,
      `The story ${input.name} reads stays simple and label-free. Medical details stay out.`,
      'This demo uses made-up children. Nothing is saved to a database.',
    ],
  };
}

export function storyPrivacy(input: {
  readonly name: string;
  readonly room: string;
  readonly source: 'model' | 'fallback';
}): PrivacyStory {
  switch (input.source) {
    case 'model':
      return {
        pill: 'Written by Ready · only from your approved answers',
        line: `Ready used only your approved answers and ${input.room}'s plan. Medical details and labels stay out of ${input.name}'s story.`,
      };
    case 'fallback':
      return {
        pill: "Simple version · Ready's personal story wasn't available just now",
        line: `Ready kept this story simple today, using only ${input.room}'s plan.`,
      };
    default: {
      const leftover: never = input.source;
      return leftover;
    }
  }
}

export function volunteerCheckInPrivacy(name: string): string {
  return `Shared by ${name}'s parent for this Sunday's team only. Care notes are in the parent's own words.`;
}
