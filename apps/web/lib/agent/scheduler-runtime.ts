import { ActionTrigger, MandateStatus } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getRedis } from '@/lib/rate-limit';
import { acquireRedisLock } from '@/lib/redis-lock';
import { extractSchedule, nextCronRun } from './cron-util';
import { executeMandateNow } from './executor';

export { extractSchedule, nextCronRun };

// Agent scheduler — minute-grain loop that runs hosted agent jobs for any ACTIVE
// mandate whose `metadata.schedule` cron expression has fired since the
// last recorded SCHEDULED action. Persistent across worker restarts: the
// scheduler reads the latest SCHEDULED `AgentAction` per mandate to know when
// the cron last fired.
//
// V1 deliberately picks "next fire only" semantics: if the worker is down for
// hours and a daily cron missed many fires, we run the action exactly once on
// startup (not N times). This is appropriate for yield auto-compound where a
// single late run catches up the same amount.

export const HEARTBEAT_KEY = 'agent:scheduler:heartbeat';
const COUNTERS_KEY = 'agent:scheduler:counters';

export interface TickStats {
  scanned: number;
  fired: number;
  queued: number;
  failed: number;
  exhausted: number;
  skipped: number;
}

export async function runScheduledTick(args: { now?: Date } = {}): Promise<TickStats> {
  const now = args.now ?? new Date();
  const stats: TickStats = {
    scanned: 0,
    fired: 0,
    queued: 0,
    failed: 0,
    exhausted: 0,
    skipped: 0,
  };

  const mandates = await prisma.agentMandate.findMany({
    where: {
      status: MandateStatus.ACTIVE,
      expiryMs: { gt: BigInt(now.getTime()) },
    },
    select: { id: true, metadata: true, createdAt: true },
  });

  const lastScheduledByMandate = new Map<string, Date>();
  if (mandates.length > 0) {
    const lastScheduled = await prisma.agentAction.findMany({
      where: {
        mandateId: { in: mandates.map((mandate) => mandate.id) },
        trigger: ActionTrigger.SCHEDULED,
      },
      orderBy: [{ mandateId: 'asc' }, { createdAt: 'desc' }],
      distinct: ['mandateId'],
      select: { mandateId: true, createdAt: true },
    });
    for (const row of lastScheduled) {
      lastScheduledByMandate.set(row.mandateId, row.createdAt);
    }
  }

  for (const mandate of mandates) {
    stats.scanned += 1;
    const schedule = extractSchedule(mandate.metadata);
    if (!schedule) {
      stats.skipped += 1;
      continue;
    }

    // First-run anchor: a mandate that has never produced a SCHEDULED action has
    // no prior fire to anchor its cron to. Anchoring to `null` makes croner
    // compute the next run relative to *now*, which is always in the future, so
    // the very first scheduled run would never become due. Fall back to the
    // mandate's createdAt so the first cron slot after creation fires once the
    // worker reaches it; subsequent runs anchor off the recorded SCHEDULED action.
    const anchor = lastScheduledByMandate.get(mandate.id) ?? mandate.createdAt;
    const dueAt = nextCronRun(schedule, anchor);
    if (!dueAt || dueAt > now) {
      continue;
    }

    stats.fired += 1;
    const outcome = await fireForMandate(mandate.id);
    if (outcome.status === 'confirmed') stats.queued += 1;
    else if (outcome.status === 'skipped') stats.skipped += 1;
    else stats.failed += 1;
  }

  await incrementCounters(stats);
  return stats;
}

async function fireForMandate(mandateId: string): Promise<
  Awaited<ReturnType<typeof executeMandateNow>>
> {
  const lock = await acquireRedisLock(`agent-execute:${mandateId}`, 120);
  if (lock.status !== 'acquired') {
    return {
      status: 'failed',
      reason: lock.status === 'busy' ? 'another execution in progress' : 'lock unavailable',
      actionId: '',
    };
  }
  try {
    return await executeMandateNow({
      mandateId,
      trigger: ActionTrigger.SCHEDULED,
    });
  } catch (err) {
    return {
      status: 'failed',
      reason: err instanceof Error ? err.message : 'unknown error',
      actionId: '',
    };
  } finally {
    await lock.release();
  }
}

// Counter and heartbeat plumbing — best-effort, Redis errors don't kill the loop.

async function incrementCounters(stats: TickStats): Promise<void> {
  try {
    const redis = getRedis();
    const pipe = redis.pipeline();
    pipe.hincrby(COUNTERS_KEY, 'scanned', stats.scanned);
    pipe.hincrby(COUNTERS_KEY, 'fired', stats.fired);
    pipe.hincrby(COUNTERS_KEY, 'queued', stats.queued);
    pipe.hincrby(COUNTERS_KEY, 'failed', stats.failed);
    pipe.hincrby(COUNTERS_KEY, 'exhausted', stats.exhausted);
    pipe.hincrby(COUNTERS_KEY, 'skipped', stats.skipped);
    pipe.hset(COUNTERS_KEY, 'last_tick_ms', Date.now());
    await pipe.exec();
  } catch (err) {
    console.error('[agent-scheduler] counter increment failed:', err);
  }
}

export async function writeHeartbeat(now = Date.now()): Promise<void> {
  try {
    const redis = getRedis();
    await redis.set(HEARTBEAT_KEY, String(now), 'EX', 300);
  } catch (err) {
    console.error('[agent-scheduler] heartbeat write failed:', err);
  }
}

// Test-only helper to reset counters between unit tests.
export async function __resetCountersForTests(): Promise<void> {
  try {
    const redis = getRedis();
    await redis.del(COUNTERS_KEY);
    await redis.del(HEARTBEAT_KEY);
  } catch {
    // ignore — test env may not have redis running
  }
}
