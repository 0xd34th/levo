import 'dotenv/config';
import { prisma } from '../lib/prisma';

async function main() {
  try {
    const r = await prisma.$queryRaw`SELECT 1 as ok`;
    console.log('DB OK:', r);
    const cnt = await prisma.agentMandate.count();
    console.log('agent_mandate row count:', cnt);
  } catch (e) {
    console.error('DB ERR:', e instanceof Error ? e.message : e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}
main();
