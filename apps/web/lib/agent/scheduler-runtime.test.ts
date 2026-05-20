import { describe, expect, it } from 'vitest';
// Import from cron-util directly so this test stays pure (no prisma/redis dep).
import { extractSchedule, nextCronRun } from './cron-util';

describe('extractSchedule', () => {
  it('returns null for non-object metadata', () => {
    expect(extractSchedule(null)).toBeNull();
    expect(extractSchedule(undefined)).toBeNull();
    expect(extractSchedule('not-an-object')).toBeNull();
  });

  it('returns null when schedule key is missing or empty', () => {
    expect(extractSchedule({})).toBeNull();
    expect(extractSchedule({ schedule: '' })).toBeNull();
    expect(extractSchedule({ schedule: '   ' })).toBeNull();
  });

  it('returns null for malformed cron expressions', () => {
    expect(extractSchedule({ schedule: 'not-a-cron' })).toBeNull();
    expect(extractSchedule({ schedule: '99 99 99 99 99' })).toBeNull();
  });

  it('returns trimmed expression for valid cron', () => {
    expect(extractSchedule({ schedule: '0 9 * * *' })).toBe('0 9 * * *');
    expect(extractSchedule({ schedule: '  */15 * * * *  ' })).toBe('*/15 * * * *');
  });
});

describe('nextCronRun', () => {
  it('returns the next fire time after a given prev', () => {
    const ref = new Date('2026-05-15T08:00:00.000Z');
    const next = nextCronRun('0 9 * * *', ref);
    expect(next).toBeInstanceOf(Date);
    // Cron fires in the worker's local timezone. The exact ISO depends on
    // tz config, so we only assert the next fire is after `ref` and within
    // ~25h (a daily cron has to be in that window).
    expect(next!.getTime()).toBeGreaterThan(ref.getTime());
    expect(next!.getTime() - ref.getTime()).toBeLessThanOrEqual(25 * 60 * 60 * 1000);
  });

  it('returns null for invalid cron expressions', () => {
    expect(nextCronRun('not-a-cron', new Date())).toBeNull();
  });

  it('returns next run from "now" when prev is null', () => {
    const now = new Date('2026-05-15T08:30:00.000Z');
    // Use a far-future cron — verify it returns SOMETHING (vs null).
    const next = nextCronRun('0 9 * * *', null);
    expect(next).toBeInstanceOf(Date);
    // Just verify it's at least the next minute (relative to wall-clock).
    expect(next!.getTime()).toBeGreaterThan(now.getTime() - 1000);
  });
});
