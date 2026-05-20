import { Cron } from 'croner';

// Pure cron helpers — kept in their own file (no prisma / redis imports) so
// unit tests can exercise them without a live DB connection.

export function nextCronRun(
  expression: string,
  lastFiredAt: Date | null,
): Date | null {
  try {
    const cron = new Cron(expression);
    return cron.nextRun(lastFiredAt ?? undefined);
  } catch {
    return null;
  }
}

export function extractSchedule(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const raw = (metadata as Record<string, unknown>).schedule;
  if (typeof raw !== 'string' || !raw.trim()) return null;
  try {
    new Cron(raw.trim());
    return raw.trim();
  } catch {
    return null;
  }
}
