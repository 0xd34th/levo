import { NextRequest } from 'next/server';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { z } from 'zod';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { createMandate, loadOwnerWallet } from '@/lib/agent/mandate-flow';
import { resolveEarnMandateTarget } from '@/lib/agent/config';
import { MandateSpecSchema } from '@/lib/agent/mandate-spec';
import type { MandateSpec } from '@/lib/agent/types';
import { MANDATE_LIMITS } from '@/lib/agent/package';
import { isDelegatedSigningConfigured } from '@/lib/agent/delegated-signing';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';

const PlannedActionSchema = z.object({
  actionType: z.number().int().positive(),
  coinType: z.string().min(1),
  target: z.string().regex(/^0x[0-9a-fA-F]{1,64}$/),
  amount: z.string().regex(/^\d+$/).transform((s) => BigInt(s)),
});

const RequestSchema = z.object({
  spec: MandateSpecSchema,
  plan: z.array(PlannedActionSchema).min(1).max(64),
  metadataName: z.string().min(1).max(120).optional(),
});

// POST /api/v1/agent/mandate/create
//
// DB-scheduled mandate: validates the spec/plan and the user's one-time Privy
// delegation, then persists an AgentMandate row. No on-chain transaction and no
// wallet signature are required at create time — the delegation grants the
// background worker autonomous signing for scheduled runs.
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`agent-mandate-create:${ip}`, 60, 10);
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

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  let owner;
  try {
    owner = await loadOwnerWallet(auth.identity.xUserId);
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Wallet is not set up for this session.' },
      { status: 400 },
    );
  }

  // Require the one-time delegation that lets the worker sign this wallet.
  const xUser = await prisma.xUser.findUnique({
    where: { xUserId: auth.identity.xUserId },
    select: { agentDelegatedAt: true },
  });
  if (!xUser?.agentDelegatedAt) {
    return noStoreJson({ error: 'delegation_required' }, { status: 409 });
  }

  const resolvedTarget = await resolveEarnMandateTarget({
    xUserId: auth.identity.xUserId,
    senderAddress: owner.suiAddress,
  });
  if (!resolvedTarget.ok) {
    return noStoreJson({ error: resolvedTarget.error }, { status: resolvedTarget.status });
  }

  const targetAddress = resolvedTarget.targetAddress;
  const allTargets = [
    ...parsed.data.spec.allowedTargets,
    ...parsed.data.plan.map((step) => step.target),
  ];
  if (!allTargets.every((target) => normalizeSuiAddress(target) === targetAddress)) {
    return noStoreJson(
      { error: "Mandate target is not this wallet's StableLayer Earn account target" },
      { status: 400 },
    );
  }

  const planValidationError = validatePlanAgainstSpec(parsed.data.spec, parsed.data.plan);
  if (planValidationError) {
    return noStoreJson({ error: planValidationError }, { status: 400 });
  }

  try {
    const result = await createMandate({
      owner,
      spec: parsed.data.spec,
      plan: parsed.data.plan,
      metadataName: parsed.data.metadataName,
    });
    return noStoreJson(result);
  } catch (error) {
    return noStoreJson(
      { error: error instanceof Error ? error.message : 'Mandate create failed' },
      { status: 400 },
    );
  }
}

function validatePlanAgainstSpec(
  spec: MandateSpec,
  plan: Array<z.infer<typeof PlannedActionSchema>>,
): string | null {
  const nowMs = BigInt(Date.now());
  if (spec.expiryMs <= nowMs) {
    return 'Mandate expiry must be in the future';
  }
  if (spec.expiryMs - nowMs > MANDATE_LIMITS.maxPeriodMs) {
    return 'Mandate expiry exceeds the maximum supported duration';
  }

  const allowedTargets = new Set(spec.allowedTargets.map((target) => normalizeSuiAddress(target)));
  for (const step of plan) {
    if (!isSingleAction(step.actionType) || (spec.actions & step.actionType) !== step.actionType) {
      return 'Planned action is not allowed by the mandate spec';
    }
    if (!allowedTargets.has(normalizeSuiAddress(step.target))) {
      return 'Planned target is not allowed by the mandate spec';
    }
    if (step.amount <= 0n) {
      return 'Planned amount must be greater than zero';
    }

    const coinLimit = spec.coinLimits.find((limit) => limit.coinType === step.coinType);
    if (!coinLimit) {
      return 'Planned coin type is not allowed by the mandate spec';
    }
    if (step.amount > coinLimit.perTxCap) {
      return 'Planned amount exceeds the mandate per-transaction cap';
    }
    if (step.amount > coinLimit.periodCap) {
      return 'Planned amount exceeds the mandate period cap';
    }
  }

  return null;
}

function isSingleAction(actionType: number): boolean {
  return actionType > 0 && (actionType & (actionType - 1)) === 0;
}
