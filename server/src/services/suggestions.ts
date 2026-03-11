// Predefined contextual note suggestions.
// Each suggestion specifies exactly when it applies so they're easy to review and edit.

type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
type DayType = 'weekday' | 'weekend';
type Season = 'spring' | 'summer' | 'autumn' | 'winter';

interface Suggestion {
  text: string;
  timeOfDay: TimeOfDay[];
  dayType: DayType[];
  season: Season[];
}

const ALL_SEASONS: Season[] = ['spring', 'summer', 'autumn', 'winter'];
const ALL_DAYS: DayType[] = ['weekday', 'weekend'];

export const SUGGESTIONS: Suggestion[] = [
  // Morning — weekday
  { text: "Coffee's on ☕", timeOfDay: ['morning'], dayType: ['weekday'], season: ALL_SEASONS },
  { text: 'Working from home today', timeOfDay: ['morning', 'afternoon'], dayType: ['weekday'], season: ALL_SEASONS },
  { text: 'Morning walk after this call', timeOfDay: ['morning'], dayType: ['weekday'], season: ['spring', 'summer', 'autumn'] },

  // Morning — weekend
  { text: 'Lazy morning, swing by', timeOfDay: ['morning'], dayType: ['weekend'], season: ALL_SEASONS },
  { text: 'Brunch vibes 🥞', timeOfDay: ['morning'], dayType: ['weekend'], season: ALL_SEASONS },
  { text: 'Slow start today', timeOfDay: ['morning'], dayType: ['weekend'], season: ALL_SEASONS },

  // Afternoon — weekday
  { text: 'Afternoon break ☀️', timeOfDay: ['afternoon'], dayType: ['weekday'], season: ALL_SEASONS },
  { text: 'WFH, come keep me company', timeOfDay: ['afternoon'], dayType: ['weekday'], season: ALL_SEASONS },

  // Afternoon — weekend
  { text: 'Chilling at home', timeOfDay: ['afternoon'], dayType: ALL_DAYS, season: ALL_SEASONS },
  { text: 'Pop by for a coffee', timeOfDay: ['afternoon'], dayType: ALL_DAYS, season: ALL_SEASONS },

  // Evening — weekday
  { text: 'After-work drinks?', timeOfDay: ['evening'], dayType: ['weekday'], season: ALL_SEASONS },
  { text: 'Winding down, pop by', timeOfDay: ['evening'], dayType: ['weekday'], season: ALL_SEASONS },

  // Evening — weekend
  { text: 'Saturday evening vibes', timeOfDay: ['evening'], dayType: ['weekend'], season: ALL_SEASONS },
  { text: 'Dinner? Come by 🍝', timeOfDay: ['evening'], dayType: ALL_DAYS, season: ALL_SEASONS },
  { text: 'Low-key hangout', timeOfDay: ['evening'], dayType: ['weekend'], season: ALL_SEASONS },

  // Night
  { text: 'Night owl mode 🦉', timeOfDay: ['night'], dayType: ALL_DAYS, season: ALL_SEASONS },
  { text: 'Late night vibes', timeOfDay: ['night'], dayType: ['weekend'], season: ALL_SEASONS },

  // Spring
  { text: "Garden's looking good 🌱", timeOfDay: ['afternoon', 'evening'], dayType: ALL_DAYS, season: ['spring'] },
  { text: 'Spring energy', timeOfDay: ['morning', 'afternoon'], dayType: ALL_DAYS, season: ['spring'] },

  // Summer
  { text: 'Cold drinks out back 🍺', timeOfDay: ['afternoon', 'evening'], dayType: ALL_DAYS, season: ['summer'] },
  { text: 'BBQ happening 🔥', timeOfDay: ['afternoon', 'evening'], dayType: ['weekend'], season: ['summer'] },
  { text: 'Sitting outside', timeOfDay: ['afternoon', 'evening'], dayType: ALL_DAYS, season: ['summer'] },

  // Autumn
  { text: 'Cosy inside 🍂', timeOfDay: ['afternoon', 'evening'], dayType: ALL_DAYS, season: ['autumn'] },
  { text: 'Warm drinks on', timeOfDay: ['morning', 'afternoon', 'evening'], dayType: ALL_DAYS, season: ['autumn', 'winter'] },

  // Winter
  { text: 'Cozy winter hangout 🕯️', timeOfDay: ['afternoon', 'evening'], dayType: ALL_DAYS, season: ['winter'] },
  { text: 'Fireside vibes', timeOfDay: ['evening', 'night'], dayType: ALL_DAYS, season: ['winter', 'autumn'] },
];

function getTimeOfDay(hour: number): TimeOfDay {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

function getSeason(month: number): Season {
  // Northern hemisphere seasons (months are 0-indexed)
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export function getContextualSuggestions(timezone?: string | null, maxCount = 4): string[] {
  let now: Date;
  if (timezone) {
    try {
      // Use the timezone to determine local time
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        weekday: 'long',
        month: 'numeric',
        hour12: false,
      });
      const parts = formatter.formatToParts(new Date());
      const hour = parseInt(parts.find(p => p.type === 'hour')?.value || '12');
      const month = parseInt(parts.find(p => p.type === 'month')?.value || '1') - 1;
      const weekday = parts.find(p => p.type === 'weekday')?.value || 'Monday';
      const isWeekend = ['Saturday', 'Sunday'].includes(weekday);

      const timeOfDay = getTimeOfDay(hour);
      const season = getSeason(month);
      const dayType: DayType = isWeekend ? 'weekend' : 'weekday';

      const matches = SUGGESTIONS.filter(
        s =>
          s.timeOfDay.includes(timeOfDay) &&
          s.dayType.includes(dayType) &&
          s.season.includes(season)
      );

      // Shuffle and return up to maxCount
      return shuffle(matches)
        .slice(0, maxCount)
        .map(s => s.text);
    } catch {
      // Fall through to default
    }
  }

  // Default: use server local time
  now = new Date();
  const hour = now.getHours();
  const month = now.getMonth();
  const isWeekend = [0, 6].includes(now.getDay());

  const timeOfDay = getTimeOfDay(hour);
  const season = getSeason(month);
  const dayType: DayType = isWeekend ? 'weekend' : 'weekday';

  const matches = SUGGESTIONS.filter(
    s =>
      s.timeOfDay.includes(timeOfDay) &&
      s.dayType.includes(dayType) &&
      s.season.includes(season)
  );

  return shuffle(matches)
    .slice(0, maxCount)
    .map(s => s.text);
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
