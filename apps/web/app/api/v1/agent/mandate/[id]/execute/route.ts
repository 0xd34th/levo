import { NextRequest } from 'next/server';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { queueNextExecutionJob } from '@/lib/agent/user-agent';
import { ActionTrigger } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { acquireRedisLock } from '@/lib/redis-lock';

// POST /api/v1/agent/mandate/[id]/execute
//
// Single-step trigger: queue the next unconsumed witness for the user's external
// runner. The web runtime never signs or submits the agent transaction.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-execute:${ip}`, 60, 20);
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

  // Verify the caller owns this mandate before triggering any chain advance.
  const mandate = await prisma.agentMandate.findFirst({
    where: { id, xUserId: auth.identity.xUserId },
  });
  if (!mandate) {
    return noStoreJson({ error: 'Mandate not found' }, { status: 404 });
  }

  // Per-mandate lock keeps concurrent triggers (chat + scheduler racing) from
  // double-spending the same witness. 30s window covers Seal RTT + on-chain.
  const lock = await acquireRedisLock(`agent-execute:${id}`, 30);
  if (lock.status !== 'acquired') {
    if (lock.status === 'busy') {
      return noStoreJson(
        { error: 'Execution already in progress for this mandate' },
        { status: 409 },
      );
    }
    return noStoreJson(
      { error: 'Execution service unavailable' },
      { status: 503 },
    );
  }

  try {
    const outcome = await queueNextExecutionJob({
      mandateId: id,
      trigger: ActionTrigger.CHAT,
    });
    const httpStatus =
      outcome.status === 'queued'
        ? 200
        : outcome.status === 'no_steps_pending'
          ? 200
          : 409;
    return noStoreJson(
      outcome.status === 'queued'
        ? { status: 'queued', job: { id: outcome.job.id } }
        : outcome,
      { status: httpStatus },
    );
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Execute failed' },
      { status: 500 },
    );
  } finally {
    await lock.release();
  }
}
