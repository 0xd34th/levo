import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  ActionStatus,
  AgentExecutionJobStatus,
  MandateStatus,
  UserAgentCustodyMode,
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

const OWNER_BINDING_SCOPE = 'agent-owner-binding-v1';
const OWNER_BINDING_TTL_MS = 10 * 60 * 1000;
const RUNNER_TOKEN_PREFIX = 'lvo_runner_';
const CLAIM_TTL_MS = 5 * 60 * 1000;
const HOSTED_AGENT_LABEL = 'Levo hosted agent';
const HOSTED_AGENT_KEY_VERSION = 'v1';
const HOSTED_AGENT_ENCRYPTION_ENV = 'LEVO_HOSTED_AGENT_ENCRYPTION_KEY';
const ED25519_SEED_BYTES = 32;
const AES_256_GCM_KEY_BYTES = 32;
const AES_GCM_IV_BYTES = 12;

interface HostedSeedEnvelope {
  v: 1;
  alg: 'A256GCM';
  kid: string;
  iv: string;
  ciphertext: string;
  tag: string;
}

export interface SerializedUserAgent {
  id: string;
  agentAddress: string;
  label: string;
  status: UserAgent['status'];
  isDefault: boolean;
  custodyMode: UserAgent['custodyMode'];
  hostedProvisionedAt: string | null;
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
    custodyMode: agent.custodyMode,
    hostedProvisionedAt: agent.hostedProvisionedAt?.toISOString() ?? null,
    hasRunnerToken: Boolean(agent.runnerTokenHash),
    lastHeartbeatAt: agent.lastHeartbeatAt?.toISOString() ?? null,
    runnerTokenRotatedAt: agent.runnerTokenRotatedAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
  };
}

interface OwnerAgentBindingPayload {
  v: 1;
  ownerXUserId: string;
  ownerAddress: string;
  agentAddress: string;
  label: string;
  nonce: string;
  issuedAt: number;
  expiresAt: number;
}

export type OwnerAgentBindingIntentVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'agent binding intent invalid'
        | 'agent binding intent expired'
        | 'agent binding intent mismatch';
    };

export function normalizeUserAgentLabel(label?: string): string {
  return label?.trim() || 'External agent';
}

export function encryptHostedAgentSeed(
  seed: Uint8Array,
  keyVersion = HOSTED_AGENT_KEY_VERSION,
): Uint8Array<ArrayBuffer> {
  if (seed.length !== ED25519_SEED_BYTES) {
    throw new Error(`Hosted agent seed must be ${ED25519_SEED_BYTES} bytes; got ${seed.length}`);
  }
  const key = loadHostedAgentEncryptionKey();
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(seed), cipher.final()]);
  const envelope: HostedSeedEnvelope = {
    v: 1,
    alg: 'A256GCM',
    kid: keyVersion,
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
  };
  const encoded = Buffer.from(JSON.stringify(envelope), 'utf8');
  const bytes = new Uint8Array(encoded.length);
  bytes.set(encoded);
  return bytes;
}

export function decryptHostedAgentSeed(encryptedSeed: Uint8Array): Uint8Array {
  const key = loadHostedAgentEncryptionKey();
  let envelope: HostedSeedEnvelope;
  try {
    envelope = JSON.parse(Buffer.from(encryptedSeed).toString('utf8')) as HostedSeedEnvelope;
  } catch {
    throw new Error('Hosted agent encrypted seed is not a valid envelope.');
  }
  if (
    envelope.v !== 1 ||
    envelope.alg !== 'A256GCM' ||
    typeof envelope.kid !== 'string' ||
    typeof envelope.iv !== 'string' ||
    typeof envelope.ciphertext !== 'string' ||
    typeof envelope.tag !== 'string'
  ) {
    throw new Error('Hosted agent encrypted seed envelope is unsupported.');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(envelope.iv, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const seed = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final(),
  ]);
  if (seed.length !== ED25519_SEED_BYTES) {
    throw new Error(`Hosted agent seed must decrypt to ${ED25519_SEED_BYTES} bytes; got ${seed.length}`);
  }
  return Uint8Array.from(seed);
}

export async function getOrCreateHostedUserAgent(xUserId: string): Promise<UserAgent> {
  const existing = await prisma.userAgent.findFirst({
    where: {
      xUserId,
      status: UserAgentStatus.ACTIVE,
      isDefault: true,
      custodyMode: UserAgentCustodyMode.HOSTED,
    },
    orderBy: { updatedAt: 'desc' },
  });
  if (existing) return existing;

  const seed = randomBytes(ED25519_SEED_BYTES);
  const keypair = Ed25519Keypair.fromSecretKey(seed);
  const agentAddress = normalizeSuiAddress(keypair.getPublicKey().toSuiAddress());
  const hostedEncryptedSeed = encryptHostedAgentSeed(seed);

  return prisma.$transaction(async (tx) => {
    const current = await tx.userAgent.findFirst({
      where: {
        xUserId,
        status: UserAgentStatus.ACTIVE,
        isDefault: true,
        custodyMode: UserAgentCustodyMode.HOSTED,
      },
      orderBy: { updatedAt: 'desc' },
    });
    if (current) return current;

    await tx.userAgent.updateMany({
      where: { xUserId, isDefault: true },
      data: { isDefault: false },
    });
    return tx.userAgent.create({
      data: {
        xUserId,
        agentAddress,
        label: HOSTED_AGENT_LABEL,
        status: UserAgentStatus.ACTIVE,
        isDefault: true,
        custodyMode: UserAgentCustodyMode.HOSTED,
        hostedEncryptedSeed,
        hostedKeyVersion: HOSTED_AGENT_KEY_VERSION,
        hostedProvisionedAt: new Date(),
        runnerTokenHash: null,
        runnerTokenRotatedAt: null,
      },
    });
  });
}

export function getHostedAgentKeypair(
  userAgent: Pick<UserAgent, 'agentAddress' | 'custodyMode' | 'hostedEncryptedSeed'>,
): Ed25519Keypair {
  if (userAgent.custodyMode !== UserAgentCustodyMode.HOSTED || !userAgent.hostedEncryptedSeed) {
    throw new Error('Mandate agent is not a hosted Levo agent.');
  }
  const keypair = Ed25519Keypair.fromSecretKey(
    decryptHostedAgentSeed(userAgent.hostedEncryptedSeed),
  );
  const derivedAddress = normalizeSuiAddress(keypair.getPublicKey().toSuiAddress());
  const storedAddress = normalizeSuiAddress(userAgent.agentAddress);
  if (derivedAddress !== storedAddress) {
    throw new Error('Hosted agent key does not match the stored agent address.');
  }
  return keypair;
}

export function issueOwnerAgentBindingIntent(args: {
  ownerXUserId: string;
  ownerAddress: string;
  agentAddress: string;
  label?: string;
  nowMs?: number;
}): { bindingIntent: string; payloadBase64: string; expiresAt: string } {
  const secret = getAgentHmacSecret();
  const now = args.nowMs ?? Date.now();
  const payload: OwnerAgentBindingPayload = {
    v: 1,
    ownerXUserId: args.ownerXUserId,
    ownerAddress: normalizeSuiAddress(args.ownerAddress),
    agentAddress: normalizeSuiAddress(args.agentAddress),
    label: normalizeUserAgentLabel(args.label),
    nonce: randomBytes(16).toString('base64url'),
    issuedAt: now,
    expiresAt: now + OWNER_BINDING_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createScopedHmac(payloadB64, secret, OWNER_BINDING_SCOPE);
  return {
    bindingIntent: `${payloadB64}.${mac}`,
    payloadBase64: Buffer.from(buildOwnerAgentBindingMessage(payload)).toString('base64'),
    expiresAt: new Date(payload.expiresAt).toISOString(),
  };
}

export function verifyOwnerAgentBindingIntent(
  token: string | undefined,
  binding: {
    ownerXUserId: string;
    ownerAddress: string;
    agentAddress: string;
    label?: string;
    payloadBase64: string;
  },
  nowMs = Date.now(),
): OwnerAgentBindingIntentVerification {
  const payload = verifyOwnerAgentBindingPayload(token);
  if (!payload) return { ok: false, reason: 'agent binding intent invalid' };
  if (payload.expiresAt <= nowMs) {
    return { ok: false, reason: 'agent binding intent expired' };
  }

  const expected = {
    ownerXUserId: binding.ownerXUserId,
    ownerAddress: normalizeSuiAddress(binding.ownerAddress),
    agentAddress: normalizeSuiAddress(binding.agentAddress),
    label: normalizeUserAgentLabel(binding.label),
    payloadBase64: Buffer.from(buildOwnerAgentBindingMessage(payload)).toString('base64'),
  };
  const actual = {
    ownerXUserId: payload.ownerXUserId,
    ownerAddress: payload.ownerAddress,
    agentAddress: payload.agentAddress,
    label: payload.label,
    payloadBase64: binding.payloadBase64,
  };
  if (
    actual.ownerXUserId !== expected.ownerXUserId ||
    actual.ownerAddress !== expected.ownerAddress ||
    actual.agentAddress !== expected.agentAddress ||
    actual.label !== expected.label ||
    actual.payloadBase64 !== expected.payloadBase64
  ) {
    return { ok: false, reason: 'agent binding intent mismatch' };
  }
  return { ok: true };
}

function verifyOwnerAgentBindingPayload(token: string | undefined): OwnerAgentBindingPayload | null {
  if (!token) return null;
  const dot = token.indexOf('.');
  if (dot === -1) return null;
  const payloadB64 = token.slice(0, dot);
  const received = token.slice(dot + 1);
  const expected = createScopedHmac(payloadB64, getAgentHmacSecret(), OWNER_BINDING_SCOPE);
  if (!hasMatchingHmac(received, [expected])) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString()) as Partial<OwnerAgentBindingPayload>;
    if (!isOwnerAgentBindingPayload(payload)) return null;
    return {
      v: 1,
      ownerXUserId: payload.ownerXUserId,
      ownerAddress: normalizeSuiAddress(payload.ownerAddress),
      agentAddress: normalizeSuiAddress(payload.agentAddress),
      label: normalizeUserAgentLabel(payload.label),
      nonce: payload.nonce,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt,
    };
  } catch {
    return null;
  }
}

function isOwnerAgentBindingPayload(value: unknown): value is OwnerAgentBindingPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<OwnerAgentBindingPayload>;
  return (
    payload.v === 1 &&
    typeof payload.ownerXUserId === 'string' &&
    typeof payload.ownerAddress === 'string' &&
    typeof payload.agentAddress === 'string' &&
    typeof payload.label === 'string' &&
    typeof payload.nonce === 'string' &&
    Number.isFinite(payload.issuedAt) &&
    Number.isFinite(payload.expiresAt)
  );
}

function buildOwnerAgentBindingMessage(payload: OwnerAgentBindingPayload): string {
  return [
    'Levo BYO Agent Binding',
    `Owner X User: ${payload.ownerXUserId}`,
    `Owner Wallet: ${payload.ownerAddress}`,
    `Agent: ${payload.agentAddress}`,
    `Label: ${payload.label}`,
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
  const label = normalizeUserAgentLabel(args.label);
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
    mandateObjectId: string | null;
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
    mandateObjectId: job.mandate.mandateObjectId ?? '',
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
  const consumed = extractWitnessConsumed(response, job.mandate.mandateObjectId ?? '');
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

function loadHostedAgentEncryptionKey(): Buffer {
  const raw = process.env[HOSTED_AGENT_ENCRYPTION_ENV]?.trim();
  if (!raw || raw === 'replace-me') {
    throw new Error('Hosted agent key encryption is not configured.');
  }

  let key: Buffer;
  try {
    key = Buffer.from(raw, 'base64');
  } catch {
    throw new Error(`${HOSTED_AGENT_ENCRYPTION_ENV} must be a base64-encoded 32-byte key.`);
  }
  if (key.length !== AES_256_GCM_KEY_BYTES) {
    throw new Error(`${HOSTED_AGENT_ENCRYPTION_ENV} must decode to ${AES_256_GCM_KEY_BYTES} bytes; got ${key.length}.`);
  }
  return key;
}

function getAgentHmacSecret(): string {
  const secret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(secret)) {
    throw new Error('HMAC_SECRET must be configured before binding user agents.');
  }
  return secret;
}
