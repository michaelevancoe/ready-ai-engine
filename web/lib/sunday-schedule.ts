export interface ScheduleItem {
  readonly time: string;
  readonly label: string;
}

export interface SundaySchedule {
  readonly place: string;
  readonly span: string;
  readonly items: readonly ScheduleItem[];
}

export const HARBOR_SCHEDULE: SundaySchedule = {
  place: 'Example Harbor Fellowship',
  span: '9:00 to 10:15',
  items: [
    { time: '9:00', label: 'Arrive and check in at the Welcome Desk' },
    { time: '9:10', label: 'Harbor Room free play' },
    { time: '9:25', label: 'Song time' },
    { time: '9:35', label: 'Bible story' },
    { time: '9:50', label: 'Snack' },
    { time: '10:00', label: 'Quiet activity' },
    { time: '10:15', label: 'Pickup with family' },
  ],
};
