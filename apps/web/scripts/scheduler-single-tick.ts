// Run one scheduler tick + write heartbeat, then exit. Useful for verifying the
// runtime against the live DB / Redis without leaving a long-running process.

import 'dotenv/config';
import { prisma } from '../lib/prisma';
import { runScheduledTick, writeHeartbeat } from '../lib/agent/scheduler-runtime';

async function main() {
  await writeHeartbeat();
  const stats = await runScheduledTick();
  console.log('tick stats:', stats);
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
