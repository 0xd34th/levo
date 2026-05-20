import { NextRequest } from 'next/server';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { executeNextStep } from '@/lib/agent/executor';
import { ActionTrigger } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { acquireRedisLock } from '@/lib/redis-lock';

// POST /api/v1/agent/mandate/[id]/execute
//
// Single-step trigger: agent KMS consumes the next unconsumed witness in the
// mandate's chain. No owner signature is required — by virtue of having created
// the mandate, the owner has already authorized this set of actions via Seal.
// Phase G will add a scheduler that calls this on cron; Phase D adds chat-tool
// invocation. This route is the chat-tool / manual-trigger entry point.
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
    const outcome = await executeNextStep({
      mandateId: id,
      trigger: ActionTrigger.CHAT,
    });
    const httpStatus =
      outcome.status === 'confirmed'
        ? 200
        : outcome.status === 'no_steps_pending'
          ? 200
          : outcome.status === 'blocked_by_seal'
            ? 422
            : outcome.actionId === ''
              ? 409
              : 500;
    return noStoreJson(outcome, { status: httpStatus });
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Execute failed' },
      { status: 500 },
    );
  } finally {
    await lock.release();
  }
}
