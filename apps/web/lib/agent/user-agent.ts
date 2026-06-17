import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import {
  UserAgentCustodyMode,
  UserAgentStatus,
  type UserAgent,
} from '@/lib/generated/prisma/client';
import { prisma } from '@/lib/prisma';

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

// Provision (or load) the per-user hosted agent identity. Its address is shown in
// the agent config; with non-custodial delegated execution the hosted key no
// longer signs anything, but the record is kept for display/config continuity.
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
