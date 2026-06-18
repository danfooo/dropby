export function formatScheduledDayTime(startsAt: number, timezone: string): string {
  return new Date(startsAt * 1000).toLocaleString('en-US', {
    weekday: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  });
}

export function formatScheduledTime(startsAt: number, timezone: string): string {
  return new Date(startsAt * 1000).toLocaleString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: timezone,
  });
}
