import { NextRequest } from 'next/server';
import { MandateStatus } from '@/lib/generated/prisma/client';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { serializeAgentMandate } from '@/lib/agent/serialize';

// POST /api/v1/agent/mandate/[id]/resume
// Service-side execution gate only. Revoked/destroyed/expired mandates cannot
// be resumed because the on-chain or policy lifetime has already terminated.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-resume:${ip}`, 60, 20);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) {
    return sameOrigin.response;
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const { id } = await params;
  if (!id) {
    return invalidInputResponse();
  }

  const mandate = await prisma.agentMandate.findFirst({
    where: { id, xUserId: auth.identity.xUserId },
  });
  if (!mandate) {
    return noStoreJson({ error: 'Mandate not found' }, { status: 404 });
  }
  if (mandate.status !== MandateStatus.PAUSED_BY_USER) {
    return noStoreJson(
      { error: `Only paused mandates can be resumed. Current status: ${mandate.status}` },
      { status: 409 },
    );
  }
  if (mandate.expiryMs <= BigInt(Date.now())) {
    const expired = await prisma.agentMandate.update({
      where: { id: mandate.id },
      data: { status: MandateStatus.EXPIRED },
    });
    return noStoreJson(
      {
        error: 'Mandate has expired and cannot be resumed',
        mandate: serializeAgentMandate(expired),
      },
      { status: 409 },
    );
  }

  const updated = await prisma.agentMandate.update({
    where: { id: mandate.id },
    data: { status: MandateStatus.ACTIVE },
  });

  return noStoreJson({
    status: 'resumed',
    mandate: serializeAgentMandate(updated),
  });
}
