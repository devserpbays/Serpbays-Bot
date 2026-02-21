/**
 * Configurable Platform Schedule Utility
 *
 * Replaces the hardcoded Mon-Fri 9AM-6PM IST schedule guard
 * with per-platform configurable timezone, days, and hours.
 */

export interface PlatformSchedule {
  timezone: string;   // IANA timezone (e.g. 'Asia/Kolkata')
  days: number[];     // 0=Sun, 1=Mon, ..., 6=Sat
  startHour: number;  // 0-23
  endHour: number;    // 0-23 (exclusive)
}

const DEFAULT_SCHEDULE: PlatformSchedule = {
  timezone: 'Asia/Kolkata',
  days: [1, 2, 3, 4, 5], // Mon-Fri
  startHour: 9,
  endHour: 18,
};

/**
 * Check if the current time falls within the given schedule.
 * Uses Intl.DateTimeFormat for accurate timezone conversion.
 */
export function isWithinSchedule(schedule?: Partial<PlatformSchedule> | null): boolean {
  const s: PlatformSchedule = { ...DEFAULT_SCHEDULE, ...(schedule || {}) };

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
