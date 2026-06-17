import {
  ActionStatus,
  ActionTrigger,
  type AgentAction,
  MandateStatus,
} from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';

export interface NewActionInput {
  mandateId: string;
  xUserId: string;
  actionType: number;
  coinType: string;
  amount: bigint;
  target: string;
  trigger: ActionTrigger;
  sealApproved: boolean;
}

export async function createPendingAction(input: NewActionInput): Promise<AgentAction> {
  return prisma.agentAction.create({
    data: {
      mandateId: input.mandateId,
      xUserId: input.xUserId,
      actionType: input.actionType,
      coinType: input.coinType,
      amount: input.amount.toString(),
      target: input.target,
      status: ActionStatus.PENDING,
      trigger: input.trigger,
      sealApproved: input.sealApproved,
    },
  });
}

// Sui RPC returns event struct fields in snake_case via `parsedJson`. We narrow
// here to the v2 WitnessConsumed shape (mandate.move).
interface WitnessConsumedJson {
  mandate_id: string;
  action_type: number;
  coin_type: { name: string };
  target: string;
  amount: string;
  at_ms: string;
  nonce: string;
  witness_commit_before: number[] | string;
  witness_commit_after: number[] | string;
}

function commitToHex(commit: number[] | string): string {
  if (typeof commit === 'string') {
    return commit.startsWith('0x') ? commit : `0x${commit}`;
  }
  const hex = commit.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `0x${hex}`;
}

export async function markActionConfirmed(args: {
  actionId: string;
  txDigest: string;
  witnessConsumed: WitnessConsumedJson | null;
}): Promise<AgentAction> {
  const { actionId, txDigest, witnessConsumed } = args;
  return prisma.agentAction.update({
    where: { id: actionId },
    data: {
      status: ActionStatus.CONFIRMED,
      txDigest,
      confirmedAt: new Date(),
      nonceAfter: witnessConsumed ? BigInt(witnessConsumed.nonce) : undefined,
      commitBefore: witnessConsumed ? commitToHex(witnessConsumed.witness_commit_before) : undefined,
      commitAfter: witnessConsumed ? commitToHex(witnessConsumed.witness_commit_after) : undefined,
    },
  });
}

export async function markActionFailed(args: {
  actionId: string;
  errorReason: string;
  txDigest?: string;
  blockedBySeal?: boolean;
}): Promise<AgentAction> {
  return prisma.agentAction.update({
    where: { id: args.actionId },
    data: {
      status: args.blockedBySeal ? ActionStatus.BLOCKED_BY_SEAL : ActionStatus.FAILED,
      errorReason: args.errorReason,
      txDigest: args.txDigest,
    },
  });
}

// ---------- Mandate-level state changes (revoke / destroy / expiry update) ----------

export async function markMandateRevoked(args: {
  mandateId: string;
  txDigest: string;
}): Promise<void> {
  await prisma.agentMandate.update({
    where: { id: args.mandateId },
    data: {
      status: MandateStatus.REVOKED,
      revokedTxDigest: args.txDigest,
      revokedAt: new Date(),
    },
  });
}

export async function markMandateDestroyed(args: {
  mandateId: string;
  txDigest: string;
}): Promise<void> {
  await prisma.agentMandate.update({
    where: { id: args.mandateId },
    data: {
      status: MandateStatus.DESTROYED,
      destroyedTxDigest: args.txDigest,
      destroyedAt: new Date(),
    },
  });
}
