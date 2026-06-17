import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson, verifySameOrigin } from '@/lib/api';
import { getAgentSignerId, isDelegatedSigningConfigured } from '@/lib/agent/delegated-signing';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

// GET /api/v1/agent/delegate
// Returns the platform signer (key quorum) id the client adds to the user's
// embedded wallet, plus whether this user has already delegated.
export async function GET(req: NextRequest) {
  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }
  if (!isDelegatedSigningConfigured()) {
    return noStoreJson({ error: 'Agent signing is not configured.' }, { status: 503 });
  }
  const xUser = await prisma.xUser.findUnique({
    where: { xUserId: auth.identity.xUserId },
    select: { agentDelegatedAt: true },
  });
  return noStoreJson({
    signerId: getAgentSignerId(),
    delegated: Boolean(xUser?.agentDelegatedAt),
  });
}

// POST /api/v1/agent/delegate
// Records the user's one-time consent after the client has added the platform
// signer to their embedded wallet via Privy. (If the signer was not actually
// added, the worker's later rawSign simply fails — recording consent carries no
// fund-movement authority on its own.)
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-delegate:${ip}`, 60, 10);
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

  if (!isDelegatedSigningConfigured()) {
    return noStoreJson({ error: 'Agent signing is not configured.' }, { status: 503 });
  }

  await prisma.xUser.update({
    where: { xUserId: auth.identity.xUserId },
    data: { agentDelegatedAt: new Date() },
  });

  return noStoreJson({ ok: true });
}
