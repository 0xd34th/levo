import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import {
  ActionStatus,
  AgentExecutionJobStatus,
  MandateStatus,
  UserAgentStatus,
  type AgentExecutionJob,
  type AgentWitness,
  type UserAgent,
} from '@/lib/generated/prisma/client';
import { hasValidHmacSecret } from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { createScopedHmac, hasMatchingHmac } from '@/lib/scoped-hmac';
import { getLevoAgentPackageId } from './package';
import { getMandateExecutionBlockReason } from './execution-guard';
import { extractWitnessConsumed } from './audit';
import { getAgentSuiClient } from './sui-client';

const CHALLENGE_SCOPE = 'agent-bind-challenge';
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const RUNNER_TOKEN_PREFIX = 'lvo_runner_';
const CLAIM_TTL_MS = 5 * 60 * 1000;

export interface SerializedUserAgent {
  id: string;
  agentAddress: string;
  label: string;
  status: UserAgent['status'];
  isDefault: boolean;
  hasRunnerToken: boolean;
  lastHeartbeatAt: string | null;
  runnerTokenRotatedAt: string | null;
  createdAt: string;
}

export function serializeUserAgent(agent: UserAgent): SerializedUserAgent {
  return {
    id: agent.id,
    agentAddress: agent.agentAddress,
    label: agent.label,
    status: agent.status,
    isDefault: agent.isDefault,
    hasRunnerToken: Boolean(agent.runnerTokenHash),
    lastHeartbeatAt: agent.lastHeartbeatAt?.toISOString() ?? null,
    runnerTokenRotatedAt: agent.runnerTokenRotatedAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
  };
}

interface AgentChallengePayload {
  xUserId: string;
  agentAddress: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export function issueAgentChallenge(args: {
  xUserId: string;
  agentAddress: string;
  nowMs?: number;
}): { challengeToken: string; message: string; expiresAt: string } {
  const secret = getAgentHmacSecret();
  const now = args.nowMs ?? Date.now();
  const payload: AgentChallengePayload = {
    xUserId: args.xUserId,
    agentAddress: normalizeSuiAddress(args.agentAddress),
    nonce: randomBytes(16).toString('base64url'),
    issuedAt: now,
    expiresAt: now + CHALLENGE_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createScopedHmac(payloadB64, secret, CHALLENGE_SCOPE);
  return {
    challengeToken: `${payloadB64}.${mac}`,
    message: buildAgentChallengeMessage(payload),
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export async function verifyAgentChallengeSignature(args: {
  xUserId: string;
  agentAddress: string;
  challengeToken: string;
  signature: string;
}): Promise<{ ok: true; agentAddress: string } | { ok: false; error: string }> {
  const payload = verifyAgentChallenge(args.challengeToken);
  if (!payload) return { ok: false, error: 'Invalid or expired agent challenge.' };
  const normalizedAgent = normalizeSuiAddress(args.agentAddress);
  if (payload.xUserId !== args.xUserId || payload.agentAddress !== normalizedAgent) {
    return { ok: false, error: 'Agent challenge does not match this session.' };
  }
  try {
    await verifyPersonalMessageSignature(
      new TextEncoder().encode(buildAgentChallengeMessage(payload)),
      args.signature,
      { address: normalizedAgent },
    );
    return { ok: true, agentAddress: normalizedAgent };
  } catch {
    return { ok: false, error: 'Invalid agent address signature.' };
  }
}

function verifyAgentChallenge(token: string): AgentChallengePayload | null {
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const received = token.slice(dot + 1);
  const expected = createScopedHmac(payloadB64, getAgentHmacSecret(), CHALLENGE_SCOPE);
  if (!hasMatchingHmac(received, [expected])) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Partial<AgentChallengePayload>;
    if (
      typeof payload.xUserId !== 'string' ||
      typeof payload.agentAddress !== 'string' ||
      typeof payload.nonce !== 'string' ||
      typeof payload.issuedAt !== 'number' ||
      typeof payload.expiresAt !== 'number' ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return {
      xUserId: payload.xUserId,
      agentAddress: normalizeSuiAddress(payload.agentAddress),
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

function buildAgentChallengeMessage(payload: AgentChallengePayload): string {
  return [
    'Levo BYO Agent Binding',
    `X User: ${payload.xUserId}`,
    `Agent: ${payload.agentAddress}`,
    `Nonce: ${payload.nonce}`,
    `Expires: ${new Date(payload.expiresAt).toISOString()}`,
  ].join('\n');
}

export async function registerUserAgent(args: {
  xUserId: string;
  agentAddress: string;
  label?: string;
}): Promise<{ agent: UserAgent; runnerToken: string }> {
  const runnerToken = generateRunnerToken();
  const runnerTokenHash = hashRunnerToken(runnerToken);
  const label = args.label?.trim() || 'External agent';
  const agentAddress = normalizeSuiAddress(args.agentAddress);

  return prisma.$transaction(async (tx) => {
    await tx.userAgent.updateMany({
      where: { xUserId: args.xUserId, isDefault: true },
      data: { isDefault: false },
    });
    const agent = await tx.userAgent.upsert({
      where: {
        xUserId_agentAddress: {
          xUserId: args.xUserId,
          agentAddress,
        },
      },
      create: {
        xUserId: args.xUserId,
        agentAddress,
        label,
        status: UserAgentStatus.ACTIVE,
        isDefault: true,
        runnerTokenHash,
        runnerTokenRotatedAt: new Date(),
      },
      update: {
        label,
        status: UserAgentStatus.ACTIVE,
        isDefault: true,
        runnerTokenHash,
        runnerTokenRotatedAt: new Date(),
        revokedAt: null,
      },
    });
    return { agent, runnerToken };
  });
}

export async function getDefaultUserAgent(xUserId: string): Promise<UserAgent | null> {
  return prisma.userAgent.findFirst({
    where: { xUserId, status: UserAgentStatus.ACTIVE, isDefault: true },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function rotateRunnerToken(args: {
  xUserId: string;
  userAgentId: string;
}): Promise<{ agent: UserAgent; runnerToken: string } | null> {
  const runnerToken = generateRunnerToken();
  const existing = await prisma.userAgent.findFirst({
    where: { id: args.userAgentId, xUserId: args.xUserId },
  });
  if (!existing) return null;
  const agent = await prisma.userAgent.update({
    where: { id: existing.id },
    data: {
      runnerTokenHash: hashRunnerToken(runnerToken),
      runnerTokenRotatedAt: new Date(),
      status: UserAgentStatus.ACTIVE,
      revokedAt: null,
    },
  });
  return { agent, runnerToken };
}

export async function revokeUserAgent(args: {
  xUserId: string;
  userAgentId: string;
}): Promise<UserAgent | null> {
  const existing = await prisma.userAgent.findFirst({
    where: { id: args.userAgentId, xUserId: args.xUserId },
  });
  if (!existing) return null;
  const agent = await prisma.userAgent.update({
    where: { id: existing.id },
    data: {
      status: UserAgentStatus.REVOKED,
      isDefault: false,
      runnerTokenHash: null,
      revokedAt: new Date(),
    },
  });
  await prisma.agentMandate.updateMany({
    where: {
      xUserId: args.xUserId,
      userAgentId: args.userAgentId,
      status: MandateStatus.ACTIVE,
    },
    data: { status: MandateStatus.PAUSED_BY_USER },
  });
  return agent;
}

export function generateRunnerToken(): string {
  return `${RUNNER_TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`;
}

export function hashRunnerToken(token: string): string {
  return createHash('sha256').update(token).digest('base64url');
}

export function hasMatchingRunnerToken(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashRunnerToken(token), 'base64url');
  const expected = Buffer.from(expectedHash, 'base64url');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function authenticateRunnerToken(token: string | null): Promise<
  | { ok: true; userAgent: UserAgent; tokenHash: string }
  | { ok: false; error: string; status: number }
> {
  const raw = token?.trim();
  if (!raw?.startsWith(RUNNER_TOKEN_PREFIX)) {
    return { ok: false, error: 'Missing runner bearer token.', status: 401 };
  }
  const tokenHash = hashRunnerToken(raw);
  const userAgent = await prisma.userAgent.findFirst({
    where: {
      runnerTokenHash: tokenHash,
      status: UserAgentStatus.ACTIVE,
    },
  });
  if (!userAgent?.runnerTokenHash || !hasMatchingRunnerToken(raw, userAgent.runnerTokenHash)) {
    return { ok: false, error: 'Invalid runner bearer token.', status: 401 };
  }
  return { ok: true, userAgent, tokenHash };
}

export async function queueNextExecutionJob(args: {
  mandateId: string;
  trigger: AgentExecutionJob['trigger'];
}): Promise<
  | { status: 'queued'; job: AgentExecutionJob }
  | { status: 'no_steps_pending'; mandateId: string }
  | { status: 'failed'; reason: string }
> {
  const mandate = await prisma.agentMandate.findUnique({
    where: { id: args.mandateId },
    include: {
      userAgent: true,
      agentWitnesses: {
        where: { consumed: false },
        orderBy: { chainIndex: 'asc' },
        take: 1,
      },
    },
  });
  if (!mandate) return { status: 'failed', reason: 'mandate not found' };
  const blockedReason = getMandateExecutionBlockReason(mandate, Date.now());
  if (blockedReason) return { status: 'failed', reason: blockedReason };
  if (!mandate.userAgentId || !mandate.userAgent || mandate.userAgent.status !== UserAgentStatus.ACTIVE) {
    return { status: 'failed', reason: 'mandate has no active external runner agent' };
  }
  const step = mandate.agentWitnesses[0];
  if (!step) return { status: 'no_steps_pending', mandateId: mandate.id };

  const existing = await prisma.agentExecutionJob.findFirst({
    where: {
      witnessId: step.id,
      status: { in: [AgentExecutionJobStatus.QUEUED, AgentExecutionJobStatus.CLAIMED] },
    },
  });
  if (existing) return { status: 'queued', job: existing };

  const job = await prisma.agentExecutionJob.create({
    data: {
      userAgentId: mandate.userAgentId,
      mandateId: mandate.id,
      witnessId: step.id,
      trigger: args.trigger,
      status: AgentExecutionJobStatus.QUEUED,
    },
  });
  return { status: 'queued', job };
}

export async function claimDueJobs(args: {
  userAgentId: string;
  tokenHash: string;
  limit: number;
  now?: Date;
}): Promise<RunnerJobPayload[]> {
  const now = args.now ?? new Date();
  const claimExpiresAt = new Date(now.getTime() + CLAIM_TTL_MS);
  const rows = await prisma.agentExecutionJob.findMany({
    where: {
      userAgentId: args.userAgentId,
      dueAt: { lte: now },
      OR: [
        { status: AgentExecutionJobStatus.QUEUED },
        {
          status: AgentExecutionJobStatus.CLAIMED,
          claimExpiresAt: { lt: now },
        },
      ],
    },
    orderBy: { dueAt: 'asc' },
    take: Math.max(1, Math.min(args.limit, 25)),
    include: jobPayloadInclude,
  });

  const claimed: RunnerJobPayload[] = [];
  for (const row of rows) {
    const result = await prisma.agentExecutionJob.updateMany({
      where: {
        id: row.id,
        userAgentId: args.userAgentId,
        OR: [
          { status: AgentExecutionJobStatus.QUEUED },
          {
            status: AgentExecutionJobStatus.CLAIMED,
            claimExpiresAt: { lt: now },
          },
        ],
      },
      data: {
        status: AgentExecutionJobStatus.CLAIMED,
        claimedAt: now,
        claimExpiresAt,
        lockedByTokenHash: args.tokenHash,
      },
    });
    if (result.count === 1) {
      claimed.push(serializeRunnerJobPayload(row));
    }
  }
  return claimed;
}

const jobPayloadInclude = {
  mandate: true,
  witness: true,
} as const;

type JobWithPayload = AgentExecutionJob & {
  mandate: {
    id: string;
    mandateObjectId: string;
    agentAddress: string;
  };
  witness: AgentWitness | null;
};

export interface RunnerJobPayload {
  id: string;
  mandateId: string;
  mandateObjectId: string;
  agentAddress: string;
  trigger: AgentExecutionJob['trigger'];
  packageId: string;
  witness: {
    id: string;
    actionType: number;
    coinType: string;
    amount: string;
    target: string;
    currentCommit: string;
    nextCommit: string;
    approvalIdentity: string;
    encryptedObjectBase64: string;
  } | null;
}

export function serializeRunnerJobPayload(job: JobWithPayload): RunnerJobPayload {
  return {
    id: job.id,
    mandateId: job.mandate.id,
    mandateObjectId: job.mandate.mandateObjectId,
    agentAddress: job.mandate.agentAddress,
    trigger: job.trigger,
    packageId: getLevoAgentPackageId(),
    witness: job.witness
      ? {
          id: job.witness.id,
          actionType: job.witness.actionType,
          coinType: job.witness.coinType,
          amount: job.witness.amount,
          target: job.witness.target,
          currentCommit: job.witness.currentCommit,
          nextCommit: job.witness.nextCommit,
          approvalIdentity: job.witness.approvalIdentity,
          encryptedObjectBase64: Buffer.from(job.witness.encryptedObject).toString('base64'),
        }
      : null,
  };
}

export async function getRunnerJobPayload(args: {
  userAgentId: string;
  tokenHash: string;
  jobId: string;
}): Promise<RunnerJobPayload | null> {
  const job = await prisma.agentExecutionJob.findFirst({
    where: {
      id: args.jobId,
      userAgentId: args.userAgentId,
      lockedByTokenHash: args.tokenHash,
      status: AgentExecutionJobStatus.CLAIMED,
    },
    include: jobPayloadInclude,
  });
  return job ? serializeRunnerJobPayload(job) : null;
}

export async function submitRunnerResult(args: {
  userAgentId: string;
  tokenHash: string;
  jobId: string;
  txDigest: string;
}): Promise<{ status: 'confirmed'; txDigest: string } | { status: 'failed'; reason: string }> {
  const job = await prisma.agentExecutionJob.findFirst({
    where: {
      id: args.jobId,
      userAgentId: args.userAgentId,
      lockedByTokenHash: args.tokenHash,
      status: AgentExecutionJobStatus.CLAIMED,
    },
    include: {
      mandate: true,
      witness: true,
    },
  });
  if (!job) return { status: 'failed', reason: 'job not found or not claimed by this runner' };
  if (!job.witness) return { status: 'failed', reason: 'job has no witness payload' };

  const response = await getAgentSuiClient().getTransactionBlock({
    digest: args.txDigest,
    options: { showEffects: true, showEvents: true },
  });
  if (response.effects?.status.status !== 'success') {
    await markJobFailed(job.id, response.effects?.status.error ?? 'transaction failed on-chain', args.txDigest);
    return { status: 'failed', reason: response.effects?.status.error ?? 'transaction failed on-chain' };
  }
  const consumed = extractWitnessConsumed(response, job.mandate.mandateObjectId);
  if (!consumed) {
    await markJobFailed(job.id, 'WitnessConsumed event not found for mandate', args.txDigest);
    return { status: 'failed', reason: 'WitnessConsumed event not found for mandate' };
  }
  if (
    consumed.action_type !== job.witness.actionType ||
    normalizeSuiAddress(consumed.target) !== normalizeSuiAddress(job.witness.target) ||
    consumed.amount !== job.witness.amount
  ) {
    await markJobFailed(job.id, 'WitnessConsumed event does not match job payload', args.txDigest);
    return { status: 'failed', reason: 'WitnessConsumed event does not match job payload' };
  }

  await prisma.$transaction([
    prisma.agentWitness.update({
      where: { id: job.witness.id },
      data: {
        consumed: true,
        consumedAt: new Date(),
        consumedTxDigest: args.txDigest,
      },
    }),
    prisma.agentMandate.update({
      where: { id: job.mandate.id },
      data: {
        nonce: BigInt(consumed.nonce),
        witnessCommit: job.witness.nextCommit,
      },
    }),
    prisma.agentAction.create({
      data: {
        mandateId: job.mandate.id,
        xUserId: job.mandate.xUserId,
        actionType: job.witness.actionType,
        coinType: job.witness.coinType,
        amount: job.witness.amount,
        target: job.witness.target,
        status: ActionStatus.CONFIRMED,
        txDigest: args.txDigest,
        trigger: job.trigger,
        sealApproved: true,
        nonceAfter: BigInt(consumed.nonce),
        commitBefore: job.witness.currentCommit,
        commitAfter: job.witness.nextCommit,
        confirmedAt: new Date(),
      },
    }),
    prisma.agentExecutionJob.update({
      where: { id: job.id },
      data: {
        status: AgentExecutionJobStatus.CONFIRMED,
        txDigest: args.txDigest,
        result: consumed as unknown as object,
      },
    }),
  ]);
  return { status: 'confirmed', txDigest: args.txDigest };
}

async function markJobFailed(jobId: string, reason: string, txDigest?: string): Promise<void> {
  await prisma.agentExecutionJob.update({
    where: { id: jobId },
    data: {
      status: AgentExecutionJobStatus.FAILED,
      errorReason: reason,
      txDigest,
    },
  });
}

function getAgentHmacSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(secret)) {
    throw new Error('HMAC_SECRET must be configured before binding user agents.');
  }
  return secret;
}
