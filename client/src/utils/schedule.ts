import { format } from 'date-fns';

// Returns a Tailwind text-size class if the string is emoji-only, null otherwise.
export function bigEmojiClass(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const segments = [...new Intl.Segmenter().segment(trimmed)];
  let count = 0;
  for (const { segment } of segments) {
    if (/^\s+$/.test(segment)) continue;
    if (/\p{Extended_Pictographic}/u.test(segment)) { count++; }
    else return null;
  }
  if (count === 0) return null;
  if (count === 1) return 'text-5xl';
  if (count <= 3) return 'text-4xl';
  if (count <= 5) return 'text-3xl';
  return null;
}

export function formatTime(ts: number): string {
  return format(new Date(ts * 1000), 'EEE h:mm a');
}

export function formatTimeShort(ts: number): string {
  return format(new Date(ts * 1000), 'h:mm a');
}

export function todayStr(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export function defaultStartTime(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return format(d, 'HH:mm');
}

export function addHours(dateStr: string, timeStr: string, hours: number): string {
  const d = new Date(`${dateStr}T${timeStr}`);
  d.setHours(d.getHours() + hours);
  return format(d, 'HH:mm');
}

export function toUnix(dateStr: string, timeStr: string): number {
  return Math.floor(new Date(`${dateStr}T${timeStr}`).getTime() / 1000);
}

export function getScheduleGroup(startsAt: number): string {
  const msDay = 86400000;
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = new Date(startsAt * 1000).getTime();
  if (ts < todayMidnight + 2 * msDay) return 'tomorrow';
  const dow = new Date(todayMidnight).getDay();
  const nextMon = todayMidnight + (dow === 0 ? 1 : 8 - dow) * msDay;
  if (ts < nextMon) return 'this_week';
  if (ts < nextMon + 7 * msDay) return 'next_week';
  if (ts < todayMidnight + 30 * msDay) return 'soon';
  return 'later';
}

export function groupScheduledDoors(doors: any[]): { key: string; doors: any[] }[] {
  const sorted = [...doors].sort((a, b) => a.starts_at - b.starts_at);
  const groups: { key: string; doors: any[] }[] = [];
  const seen = new Map<string, { key: string; doors: any[] }>();
  for (const door of sorted) {
    const key = getScheduleGroup(door.starts_at);
    if (!seen.has(key)) {
      const group = { key, doors: [] };
      groups.push(group);
      seen.set(key, group);
    }
    seen.get(key)!.doors.push(door);
  }
  return groups;
}

export const REMINDER_OPTIONS = [5, 15, 30, 60];
