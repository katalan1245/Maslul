import type { TransitMode } from '../data/models';
import { type Instant, type LocalDate, dayOfWeek, localParts, plusDays, today } from '../data/time';
import { fixed } from '../data/util';

const pad2 = (n: number) => String(n).padStart(2, '0');
const DAYS = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const Fmt = {
  /** "07:05" in Israel time. */
  time(t: Instant): string {
    const p = localParts(t);
    return `${pad2(p.hour)}:${pad2(p.minute)}`;
  },

  /** "Now", "4 min", or "21:40" once more than an hour away. */
  relative(t: Instant, now: Instant): string {
    const sec = t - now;
    if (sec < 45) return 'Now';
    if (sec < 60 * 60) return `${Math.trunc((sec + 30) / 60)} min`;
    return Fmt.time(t);
  },

  /** "Updated 30s ago", "Updated 2 min ago" — how old a live position is. */
  ago(t: Instant, now: Instant): string {
    const sec = Math.max(now - t, 0);
    if (sec < 5) return 'Updated just now';
    if (sec < 60) return `Updated ${sec}s ago`;
    if (sec < 60 * 60) return `Updated ${Math.trunc(sec / 60)} min ago`;
    return `Updated at ${Fmt.time(t)}`;
  },

  duration(sec: number): string {
    const m = Math.max(Math.trunc((sec + 30) / 60), 1);
    if (m < 60) return `${m} min`;
    return `${Math.trunc(m / 60)} h ${pad2(m % 60)} min`.replace(' 00 min', '');
  },

  distance(m: number): string {
    return m < 1000 ? `${Math.trunc(m / 10) * 10} m` : `${fixed(m / 1000, 1)} km`;
  },

  day(date: LocalDate, todayDate: LocalDate = today()): string {
    if (date === todayDate) return 'Today';
    if (date === plusDays(todayDate, 1)) return 'Tomorrow';
    const [, mo, d] = date.split('-').map(Number);
    return `${DAYS[dayOfWeek(date)]}, ${d} ${MONTHS[mo - 1]}`;
  },
};

export function modeName(mode: TransitMode): string {
  switch (mode) {
    case 'WALK':
      return 'Walk';
    case 'BUS':
      return 'Bus';
    case 'TRAIN':
      return 'Train';
    case 'LIGHT_RAIL':
      return 'Light rail';
    case 'METRO':
      return 'Carmelit';
    case 'CABLE_CAR':
      return 'Cable car';
    case 'FERRY':
      return 'Ferry';
    case 'CAR':
      return 'Car';
    default:
      return 'Transit';
  }
}
