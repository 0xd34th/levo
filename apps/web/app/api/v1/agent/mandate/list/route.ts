import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson } from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { serializeAgentMandate } from '@/lib/agent/serialize';

// GET /api/v1/agent/mandate/list — list all mandates owned by the calling X user.
// Foundation route to validate Privy auth + Prisma chain. Real flows (create / revoke /
// execute) come in Phase 2.
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-list:${ip}`, 60, 30);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const mandates = await prisma.agentMandate.findMany({
    where: { xUserId: auth.identity.xUserId },
    orderBy: { createdAt: 'desc' },
  });

  return noStoreJson({ mandates: mandates.map(serializeAgentMandate) });
}
