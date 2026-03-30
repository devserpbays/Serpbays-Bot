/**
 * Configurable Platform Schedule Utility
 *
 * Replaces the hardcoded Mon-Fri 9AM-6PM IST schedule guard
 * with per-platform configurable timezone, days, and hours.
 */

/**
 * Get the UTC Date representing midnight (00:00:00) of today in the given timezone.
 * Use this for MongoDB "$gte" queries when counting "posts today" per user timezone.
 *
 * Example: for America/New_York (UTC+5:30), midnight IST = 18:30 UTC the previous day.
 */
export function getTodayStartUTC(timezone = 'UTC'): Date {
  const tz = timezone || 'UTC';
  const now = new Date();
  // Compute offset by comparing what 'now' looks like in the target timezone vs UTC
  const tzStr  = new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime();
  const utcStr = new Date(now.toLocaleString('en-US', { timeZone: 'UTC'  })).getTime();
  const offsetMs = tzStr - utcStr; // e.g. +19800000 for IST (+5:30)
  // Shift now into the target timezone as a fake-UTC date, set to midnight, shift back
  const tzNow = new Date(now.getTime() + offsetMs);
  tzNow.setUTCHours(0, 0, 0, 0);
  return new Date(tzNow.getTime() - offsetMs);
}

/**
 * Get the current hour (0-23) in the given timezone.
 * Uses Intl for accuracy — handles fractional-hour offsets (IST, NPT, etc).
 */
export function getHourInTimezone(timezone = 'UTC'): number {
  const tz = timezone || 'UTC';
  const str = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour: 'numeric', hour12: false,
  }).format(new Date());
  const h = parseInt(str, 10);
  return isNaN(h) ? new Date().getUTCHours() : h % 24;
}

export interface PlatformSchedule {
  timezone: string;   // IANA timezone (e.g. 'America/New_York')
  days: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
  startHour: number;  // 0-23
  endHour: number;    // 0-23 (exclusive)
}

const DEFAULT_SCHEDULE: PlatformSchedule = {
  timezone: 'UTC',
  days: [0, 1, 2, 3, 4, 5, 6], // Sun-Sat (all days)
  startHour: 0,
  endHour: 24,
};

/**
 * Check if the current time falls within the given schedule.
 * Uses Intl.DateTimeFormat for accurate timezone conversion.
 */
export function isWithinSchedule(schedule?: Partial<PlatformSchedule> | null): boolean {
  const s: PlatformSchedule = { ...DEFAULT_SCHEDULE, ...(schedule || {}) };
  // Treat empty timezone as UTC (no timezone restriction)
  if (!s.timezone) s.timezone = 'UTC';

  const now = new Date();

  // Get current day and hour in the target timezone
  const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: s.timezone,
    weekday: 'short',
  });
  const hourFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: s.timezone,
    hour: 'numeric',
    hour12: false,
  });

  const dayStr = dayFormatter.format(now);
  const hourStr = hourFormatter.format(now);

  // Map day string to number
  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const dayOfWeek = dayMap[dayStr] ?? -1;
  const hour = parseInt(hourStr, 10);

  // Check day
  if (!s.days.includes(dayOfWeek)) {
    console.log(`Outside schedule: ${dayStr} not in allowed days (${s.timezone})`);
    return false;
  }

  // Check hour
  if (hour < s.startHour || hour >= s.endHour) {
    console.log(`Outside schedule: hour ${hour} ${s.timezone} (allowed ${s.startHour}-${s.endHour - 1})`);
    return false;
  }

  return true;
}
