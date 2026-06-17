import type { AgentAction, AgentMandate } from '@/lib/generated/prisma/client';

// Prisma returns BigInt for u64 columns; JSON.stringify can't serialize them.
// Convert to decimal strings (Move-side already uses u64 string form).

export interface SerializedAgentMandate {
  id: string;
  xUserId: string;
  userAgentId: string | null;
  agentAddress: string;
  mandateObjectId: string | null;
  name: string;
  actions: number;
  coinLimits: unknown;
  periodMs: string;
  allowedTargets: unknown;
  expiryMs: string;
  metadata: unknown;
  status: AgentMandate['status'];
  nonce: string;
  witnessCommit: string | null;
  createdTxDigest: string | null;
  initTxDigest: string | null;
  revokedTxDigest: string | null;
  revokedAt: string | null;
  destroyedTxDigest: string | null;
  destroyedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeAgentMandate(m: AgentMandate): SerializedAgentMandate {
  return {
    id: m.id,
    xUserId: m.xUserId,
    userAgentId: m.userAgentId,
    agentAddress: m.agentAddress,
    mandateObjectId: m.mandateObjectId,
    name: m.name,
    actions: m.actions,
    coinLimits: m.coinLimits,
    periodMs: m.periodMs.toString(),
    allowedTargets: m.allowedTargets,
    expiryMs: m.expiryMs.toString(),
    metadata: m.metadata,
    status: m.status,
    nonce: m.nonce.toString(),
    witnessCommit: m.witnessCommit,
    createdTxDigest: m.createdTxDigest,
    initTxDigest: m.initTxDigest,
    revokedTxDigest: m.revokedTxDigest,
    revokedAt: m.revokedAt?.toISOString() ?? null,
    destroyedTxDigest: m.destroyedTxDigest,
    destroyedAt: m.destroyedAt?.toISOString() ?? null,
    createdAt: m.createdAt.toISOString(),
    updatedAt: m.updatedAt.toISOString(),
  };
}

export interface SerializedAgentAction {
  id: string;
  mandateId: string;
  xUserId: string;
  actionType: number;
  coinType: string;
  amount: string;
  target: string;
  status: AgentAction['status'];
  txDigest: string | null;
  trigger: AgentAction['trigger'];
  sealApproved: boolean;
  errorReason: string | null;
  nonceAfter: string | null;
  commitBefore: string | null;
  commitAfter: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

export function serializeAgentAction(a: AgentAction): SerializedAgentAction {
  return {
    id: a.id,
    mandateId: a.mandateId,
    xUserId: a.xUserId,
    actionType: a.actionType,
    coinType: a.coinType,
    amount: a.amount,
    target: a.target,
    status: a.status,
    txDigest: a.txDigest,
    trigger: a.trigger,
    sealApproved: a.sealApproved,
    errorReason: a.errorReason,
    nonceAfter: a.nonceAfter?.toString() ?? null,
    commitBefore: a.commitBefore,
    commitAfter: a.commitAfter,
    createdAt: a.createdAt.toISOString(),
    confirmedAt: a.confirmedAt?.toISOString() ?? null,
  };
}
