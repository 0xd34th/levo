import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson } from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { serializeAgentAction, serializeAgentMandate } from '@/lib/agent/serialize';

const ACTION_PAGE_SIZE = 50;

// GET /api/v1/agent/mandate/[id]
// Returns the mandate + most recent actions for the calling X user.
// 404 if the mandate doesn't belong to the user (no info leak via 403).
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-get:${ip}`, 60, 60);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!id || typeof id !== 'string') {
    return noStoreJson({ error: 'Invalid mandate id' }, { status: 400 });
  }

  const mandate = await prisma.agentMandate.findFirst({
    where: { id, xUserId: auth.identity.xUserId },
  });
  if (!mandate) {
    return noStoreJson({ error: 'Mandate not found' }, { status: 404 });
  }

  const actions = await prisma.agentAction.findMany({
    where: { mandateId: mandate.id },
    orderBy: { createdAt: 'desc' },
    take: ACTION_PAGE_SIZE,
  });

  return noStoreJson({
    mandate: serializeAgentMandate(mandate),
    actions: actions.map(serializeAgentAction),
  });
}
