// Cadence-aware next-run computation.
//
// We compute the local wall-clock time the subscription wants
// (e.g. "Monday 07:00 in America/Chicago") and convert back to UTC. This
// handles DST transitions correctly because we re-compute the offset on
// every iteration of next_run_at — a daily 7am send is always 7am Central
// regardless of the season.

export type Cadence = 'daily' | 'weekly' | 'monthly';

export interface ScheduleSpec {
  cadence:   Cadence;
  /** ISO day-of-week 1..7 (Mon=1, Sun=7). Required when cadence='weekly'. */
  sendDow?:  number | null;
  /** Day-of-month 1..28 (capped to avoid Feb edge case). Required when cadence='monthly'. */
  sendDom?:  number | null;
  /** Local hour 0..23 in `timezone`. */
  sendHour:  number;
  /** IANA timezone, e.g. 'America/Chicago'. */
  timezone:  string;
}

// Returns the UTC offset (minutes) for `date` in `timezone`. Positive west of UTC.
// e.g. America/Chicago in summer = 300 (CDT, UTC-5); in winter = 360 (CST, UTC-6).
function getTimezoneOffsetMinutes(date: Date, timezone: string): number {
  // Intl.DateTimeFormat with the requested timezone gives us the wall-clock
  // parts; the difference from the date's UTC representation is the offset.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const wall = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === '24' ? 0 : parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (date.getTime() - wall) / 60_000;
}

/**
 * Convert a local wall-clock date in `timezone` to UTC.
 * `localParts` is interpreted as if the wall-clock time were in `timezone`.
 */
function zonedTimeToUtc(
  localParts: { year: number; month: number; day: number; hour: number; minute: number },
  timezone: string,
): Date {
  // Start by treating the parts as UTC, then adjust by the timezone offset
  // at that moment. Iterate once to catch DST boundary cases (the offset can
  // change between our first guess and the true moment).
  const naive = Date.UTC(localParts.year, localParts.month - 1, localParts.day, localParts.hour, localParts.minute, 0);
  let guess = new Date(naive);
  for (let i = 0; i < 3; i++) {
    const offset = getTimezoneOffsetMinutes(guess, timezone);
    const next = new Date(naive + offset * 60_000);
    if (next.getTime() === guess.getTime()) return next;
    guess = next;
  }
  return guess;
}

// Get wall-clock parts of `date` in `timezone`.
function utcToZonedParts(date: Date, timezone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const parts = fmt.formatToParts(date).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  const dowMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return {
    year:    Number(parts.year),
    month:   Number(parts.month),
    day:     Number(parts.day),
    hour:    Number(parts.hour === '24' ? 0 : parts.hour),
    minute:  Number(parts.minute),
    isoDow:  dowMap[parts.weekday] ?? 1,
  };
}

/**
 * Compute the next run-at timestamp (UTC) given a schedule spec and a
 * reference time (typically `now()` or the previous send).
 *
 * @param after  Find the next occurrence strictly after this instant.
 */
export function computeNextRunAt(spec: ScheduleSpec, after: Date): Date {
  const tz = spec.timezone || 'America/Chicago';
  const z  = utcToZonedParts(after, tz);

  if (spec.cadence === 'daily') {
    // Today at sendHour, local. If <= after, roll forward one day.
    let candidate = zonedTimeToUtc(
      { year: z.year, month: z.month, day: z.day, hour: spec.sendHour, minute: 0 },
      tz,
    );
    if (candidate.getTime() <= after.getTime()) {
      candidate = zonedTimeToUtc(
        { year: z.year, month: z.month, day: z.day + 1, hour: spec.sendHour, minute: 0 },
        tz,
      );
    }
    return candidate;
  }

  if (spec.cadence === 'weekly') {
    const targetDow = spec.sendDow ?? 1; // Default Monday
    let daysAhead = (targetDow - z.isoDow + 7) % 7;
    // Roll forward a week if same-day target hour has already passed.
    if (daysAhead === 0) {
      const sameDay = zonedTimeToUtc(
        { year: z.year, month: z.month, day: z.day, hour: spec.sendHour, minute: 0 },
        tz,
      );
      if (sameDay.getTime() <= after.getTime()) daysAhead = 7;
    }
    return zonedTimeToUtc(
      { year: z.year, month: z.month, day: z.day + daysAhead, hour: spec.sendHour, minute: 0 },
      tz,
    );
  }

  // Monthly
  const targetDom = Math.min(28, Math.max(1, spec.sendDom ?? 1));
  let candidate = zonedTimeToUtc(
    { year: z.year, month: z.month, day: targetDom, hour: spec.sendHour, minute: 0 },
    tz,
  );
  if (candidate.getTime() <= after.getTime()) {
    const nextMonth = z.month === 12 ? 1 : z.month + 1;
    const nextYear  = z.month === 12 ? z.year + 1 : z.year;
    candidate = zonedTimeToUtc(
      { year: nextYear, month: nextMonth, day: targetDom, hour: spec.sendHour, minute: 0 },
      tz,
    );
  }
  return candidate;
}

export const ISO_DOW_LABELS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export function describeSchedule(spec: ScheduleSpec): string {
  const hour12 = spec.sendHour === 0 ? '12am' : spec.sendHour < 12 ? `${spec.sendHour}am` : spec.sendHour === 12 ? '12pm' : `${spec.sendHour - 12}pm`;
  if (spec.cadence === 'daily')   return `Daily at ${hour12}`;
  if (spec.cadence === 'weekly')  return `Every ${ISO_DOW_LABELS[(spec.sendDow ?? 1) - 1]} at ${hour12}`;
  return `Day ${spec.sendDom ?? 1} of each month at ${hour12}`;
}
