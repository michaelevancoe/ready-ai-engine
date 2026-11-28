import { HARBOR_SCHEDULE } from '../lib/sunday-schedule';

export function SundayScheduleCard() {
  return (
    <section className="sunday-schedule" aria-label="My Sunday schedule">
      <h2>My Sunday schedule</h2>
      <p>
        {HARBOR_SCHEDULE.place} · {HARBOR_SCHEDULE.span}
      </p>
      <ol>
        {HARBOR_SCHEDULE.items.map((item) => (
          <li key={item.time}>
            <time dateTime={item.time}>{item.time}</time>
            <span>{item.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
