import { MandateStatus } from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { type MandateSpec } from './types';

// The owner wallet binding for a mandate, loaded from XUser. The agent mandate
// worker signs this wallet non-custodially via the platform authorization key
// (see lib/agent/delegated-signing.ts), so no on-chain agent key is involved.
export interface OwnerWallet {
  xUserId: string;
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
}

export async function loadOwnerWallet(xUserId: string): Promise<OwnerWallet> {
  const xUser = await prisma.xUser.findUnique({ where: { xUserId } });
  if (!xUser?.privyWalletId || !xUser.suiAddress || !xUser.suiPublicKey) {
    throw new Error(
      'Wallet not set up. Complete /api/v1/wallet/setup before creating a mandate.',
    );
  }
  return {
    xUserId,
    privyWalletId: xUser.privyWalletId,
    suiAddress: xUser.suiAddress,
    suiPublicKey: xUser.suiPublicKey,
  };
}

// A planned action carries what the mandate will do each scheduled run.
export interface PlannedAction {
  actionType: number;
  coinType: string;
  target: string;
  amount: bigint;
}

export interface CreateMandateInput {
  owner: OwnerWallet;
  spec: MandateSpec;
  plan: PlannedAction[];
  metadataName?: string;
}

export type CreateMandateOutput = { status: 'confirmed'; mandateRowId: string };

// Persist a DB-scheduled mandate. No on-chain object, no Seal, no witness chain:
// the mandate config (action bitfield, caps, target, schedule cron, per-run
// amount) lives in the row, and the background worker executes it on schedule
// using the user's delegated wallet (deposit/withdraw) or the manager (harvest).
export async function createMandate(input: CreateMandateInput): Promise<CreateMandateOutput> {
  const first = input.plan[0];
  if (!first) {
    throw new Error('Mandate plan is empty');
  }

  const metadata: Record<string, string> = {
    ...(input.spec.metadata ?? {}),
    amount: first.amount.toString(),
  };

  const coinLimits = input.spec.coinLimits.map((c) => ({
    coinType: c.coinType,
    perTxCap: c.perTxCap.toString(),
    periodCap: c.periodCap.toString(),
    periodSpent: '0',
    periodStartMs: '0',
  }));

  const mandate = await prisma.agentMandate.create({
    data: {
      xUserId: input.owner.xUserId,
      userAgentId: null,
      agentAddress: '',
      mandateObjectId: null,
      name: input.metadataName ?? 'Earn mandate',
      actions: input.spec.actions,
      coinLimits,
      periodMs: input.spec.periodMs,
      allowedTargets: input.spec.allowedTargets,
      expiryMs: input.spec.expiryMs,
      metadata,
      status: MandateStatus.ACTIVE,
      witnessCommit: null,
      createdTxDigest: null,
    },
  });

  return { status: 'confirmed', mandateRowId: mandate.id };
}

// Revoking / destroying a DB mandate is a pure status change — there is no
// on-chain object to terminate.
export async function revokeMandate(input: {
  owner: OwnerWallet;
  mandateRowId: string;
}): Promise<{ status: 'confirmed' }> {
  const mandate = await prisma.agentMandate.findFirst({
    where: { id: input.mandateRowId, xUserId: input.owner.xUserId },
  });
  if (!mandate) {
    throw new Error('Mandate not found');
  }
  await prisma.agentMandate.update({
    where: { id: mandate.id },
    data: { status: MandateStatus.REVOKED, revokedAt: new Date() },
  });
  return { status: 'confirmed' };
}

export async function destroyMandate(input: {
  owner: OwnerWallet;
  mandateRowId: string;
}): Promise<{ status: 'confirmed' }> {
  const mandate = await prisma.agentMandate.findFirst({
    where: { id: input.mandateRowId, xUserId: input.owner.xUserId },
  });
  if (!mandate) {
    throw new Error('Mandate not found');
  }
  await prisma.agentMandate.update({
    where: { id: mandate.id },
    data: { status: MandateStatus.DESTROYED, destroyedAt: new Date() },
  });
  return { status: 'confirmed' };
}
