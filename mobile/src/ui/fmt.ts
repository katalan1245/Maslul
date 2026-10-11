import type { Leg, TransitMode } from '../data/models';
import { type Instant, type LocalDate, dayOfWeek, localDate, localParts, plusDays, today } from '../data/time';
import { fixed } from '../data/util';
import { S } from '../i18n';

const pad2 = (n: number) => String(n).padStart(2, '0');

export const Fmt = {
  /** "07:05" in Israel time. */
  time(t: Instant): string {
    const p = localParts(t);
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  },

  /** "18:13" today, "Sat 18:13" on another day (in Israel time): after the last bus, plans and reminders are for tomorrow. */
  when(t: Instant, now: Instant): string {
    const date = localDate(t);
    return date === localDate(now) ? Fmt.time(t) : S.fmt.dayTime(S.fmt.days[dayOfWeek(date)], Fmt.time(t));
  },

  /** "Now", "4 min", or "21:40" ("Sat 18:15" on another day) once more than an hour away. */
  relative(t: Instant, now: Instant): string {
    const sec = t - now;
    if (sec < 45) return S.fmt.now;
    if (sec < 60 * 60) return S.fmt.min(Math.trunc((sec + 30) / 60));
    return Fmt.when(t, now);
  },

  /** "Updated 30s ago", "Updated 2 min ago" — how old a live position is. */
  ago(t: Instant, now: Instant): string {
    const sec = Math.max(now - t, 0);
    if (sec < 5) return S.fmt.updatedNow;
    if (sec < 60) return S.fmt.updatedSec(sec);
    if (sec < 60 * 60) return S.fmt.updatedMin(Math.trunc(sec / 60));
    return S.fmt.updatedAt(Fmt.time(t));
  },

  duration(sec: number): string {
    const m = Math.max(Math.trunc((sec + 30) / 60), 1);
    return m < 60 ? S.fmt.min(m) : S.fmt.hours(Math.trunc(m / 60), m % 60);
  },

  distance(m: number): string {
    return m < 1000 ? S.fmt.meters(Math.trunc(m / 10) * 10) : S.fmt.km(fixed(m / 1000, 1));
  },

  day(date: LocalDate, todayDate: LocalDate = today()): string {
    if (date === todayDate) return S.fmt.today;
    if (date === plusDays(todayDate, 1)) return S.fmt.tomorrow;
    const [, mo, d] = date.split('-').map(Number);
    return S.fmt.date(S.fmt.days[dayOfWeek(date)], d, S.fmt.months[mo - 1]);
  },
};

export function modeName(mode: TransitMode): string {
  return mode in S.modes ? S.modes[mode as keyof typeof S.modes] : S.modes.OTHER;
}

/** "Bus 61"; just "Train" for a ride with no line number of its own (its label is then a stand-in such as "Train"). */
export function modeLine(mode: TransitMode, label: string | null | undefined): string {
  const m = modeName(mode);
  const n = label?.trim();
  const unnumbered = !n || n === 'NaN' || n === '—' || n === S.stop.trainLine || n === S.stop.cableLine || n.toLowerCase() === m.toLowerCase();
  return unnumbered ? m : `${m} ${n}`;
}

export const rideName = (l: Leg) => modeLine(l.mode, l.routeShortName);
