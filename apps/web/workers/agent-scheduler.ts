// Levo Agent scheduler — long-running Node worker.
// Runs `runScheduledTick` every minute against the configured Sui testnet +
// dev Postgres. Writes Redis heartbeat every 30 s. Exits cleanly on SIGINT
// / SIGTERM (so the per-mandate Redis locks release without waiting for TTL).
//
// Run:   pnpm worker:agent
// Docker / Fly: keep this as a separate process from the Next.js app.

import 'dotenv/config';
import { prisma } from '@/lib/prisma';
import {
  HEARTBEAT_KEY,
  runScheduledTick,
  type TickStats,
  writeHeartbeat,
} from '@/lib/agent/scheduler-runtime';

const TICK_INTERVAL_MS = 60_000; // one minute
const HEARTBEAT_INTERVAL_MS = 30_000;

let shuttingDown = false;
let activeTick: Promise<TickStats | null> | null = null;

async function main() {
  console.log('[agent-scheduler] starting');
  console.log(`  tick interval     : ${TICK_INTERVAL_MS} ms`);
  console.log(`  heartbeat interval: ${HEARTBEAT_INTERVAL_MS} ms`);
  console.log(`  heartbeat key     : ${HEARTBEAT_KEY}`);

  const heartbeat = setInterval(() => {
    writeHeartbeat().catch((err) => console.error('[agent-scheduler] heartbeat err:', err));
  }, HEARTBEAT_INTERVAL_MS);

  // Fire once immediately on start so an operator can verify health without
  // waiting a full minute.
  await tickOnce();

  while (!shuttingDown) {
    await sleep(TICK_INTERVAL_MS);
    if (shuttingDown) break;
    await tickOnce();
  }

  clearInterval(heartbeat);
  await prisma.$disconnect();
  console.log('[agent-scheduler] stopped');
}

async function tickOnce() {
  const t0 = Date.now();
  activeTick = runScheduledTick().catch((err) => {
    console.error('[agent-scheduler] tick threw:', err);
    return null;
  });
  const stats = await activeTick;
  activeTick = null;
  const elapsed = Date.now() - t0;
  if (stats) {
    console.log(
      `[agent-scheduler] tick ${elapsed}ms — scanned=${stats.scanned} fired=${stats.fired} ` +
        `confirmed=${stats.confirmed} blocked=${stats.blocked} failed=${stats.failed} ` +
        `skipped=${stats.skipped}`,
    );
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installShutdownHandlers() {
  const shutdown = (signal: string) => async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[agent-scheduler] received ${signal}, draining...`);
    if (activeTick) {
      await activeTick.catch(() => undefined);
    }
  };
  process.on('SIGINT', shutdown('SIGINT'));
  process.on('SIGTERM', shutdown('SIGTERM'));
}

installShutdownHandlers();
main().catch((err) => {
  console.error('[agent-scheduler] fatal:', err);
  process.exitCode = 1;
});
