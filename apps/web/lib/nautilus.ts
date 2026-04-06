/**
 * Client for the Nautilus enclave attestation service.
 * The enclave signs attestation messages that the on-chain verifier checks.
 */

import { normalizeSuiAddress } from '@mysten/sui/utils';
import { z } from 'zod';
import { parseXUserId } from '@/lib/twitter';

export interface AttestationRequest {
  xUserId: string;
  suiAddress: string;
}

export interface AttestationResponse {
  xUserId: bigint;
  suiAddress: string;
  nonce: bigint;
  expiresAt: bigint;
  signature: Uint8Array;
}

export interface OwnerRecoveryAttestationRequest {
  xUserId: string;
  vaultId: string;
  currentOwner: string;
  newOwner: string;
  recoveryCounter: string;
}

export interface OwnerRecoveryAttestationResponse {
  xUserId: bigint;
  vaultId: string;
  currentOwner: string;
  newOwner: string;
  recoveryCounter: bigint;
  expiresAt: bigint;
  signature: Uint8Array;
}

const MIN_SIGNER_SECRET_LENGTH = 32;

const UintLikeStringSchema = z.union([z.string(), z.number()]).transform((value, ctx) => {
  const normalized = String(value).trim();
  if (!/^\d+$/.test(normalized)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Expected an unsigned integer string',
    });
    return z.NEVER;
  }

  return normalized;
});

const AttestationPayloadSchema = z.object({
  signature: z
    .string()
    .regex(/^(?:0x)?[0-9a-fA-F]+$/, 'Invalid signature hex')
    .refine((value) => {
      const rawHex = value.startsWith('0x') ? value.slice(2) : value;
      return rawHex.length > 0 && rawHex.length % 2 === 0;
    }, 'Invalid signature hex'),
  x_user_id: UintLikeStringSchema,
  sui_address: z.string().min(1),
  nonce: UintLikeStringSchema,
  expires_at: UintLikeStringSchema,
});

const OwnerRecoveryAttestationPayloadSchema = z.object({
  signature: z
    .string()
    .regex(/^(?:0x)?[0-9a-fA-F]+$/, 'Invalid signature hex')
    .refine((value) => {
      const rawHex = value.startsWith('0x') ? value.slice(2) : value;
      return rawHex.length > 0 && rawHex.length % 2 === 0;
    }, 'Invalid signature hex'),
  x_user_id: UintLikeStringSchema,
  vault_id: z.string().min(1),
  current_owner: z.string().min(1),
  new_owner: z.string().min(1),
  recovery_counter: UintLikeStringSchema,
  expires_at: UintLikeStringSchema,
});

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '::1' ||
    normalized === '[::1]' ||
    /^127(?:\.\d{1,3}){3}$/.test(normalized)
  );
}

function getAttestationEndpoint(): string {
  const enclaveUrl = process.env.NAUTILUS_ENCLAVE_URL?.trim();
  if (!enclaveUrl) {
    throw new Error('Nautilus enclave service not configured');
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(enclaveUrl);
  } catch {
    throw new Error('Nautilus enclave URL is invalid');
  }

  if (
    process.env.NODE_ENV === 'production' &&
    baseUrl.protocol !== 'https:' &&
    !isLoopbackHostname(baseUrl.hostname)
  ) {
    throw new Error('Nautilus enclave URL must use HTTPS in production');
  }

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/attestation`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl.toString();
}

function getSignerSecret(): string {
  const secret = process.env.NAUTILUS_SIGNER_SECRET?.trim();
  if (!secret || secret.length < MIN_SIGNER_SECRET_LENGTH) {
    throw new Error('Nautilus signer secret not configured');
  }

  return secret;
}

/**
 * Request an attestation from the Nautilus enclave service.
 * The web app verifies the caller's X identity first, then the signer produces
 * a signed AttestationMessage { x_user_id, sui_address, nonce, expires_at, registry_id }.
 */
export async function requestAttestation(
  req: AttestationRequest,
): Promise<AttestationResponse> {
  const signerSecret = getSignerSecret();
  const response = await fetch(getAttestationEndpoint(), {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signerSecret}`,
    },
    body: JSON.stringify({
      x_user_id: req.xUserId,
      sui_address: req.suiAddress,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown error');
    throw new Error(`Attestation request failed (${response.status}): ${body}`);
  }

  const payload = AttestationPayloadSchema.parse(await response.json());
  const responseXUserId = parseXUserId(payload.x_user_id);
  if (!responseXUserId || responseXUserId !== req.xUserId) {
    throw new Error('Attestation response contained an unexpected X user id');
  }

  const responseSuiAddress = normalizeSuiAddress(payload.sui_address);
  if (responseSuiAddress !== normalizeSuiAddress(req.suiAddress)) {
    throw new Error('Attestation response contained an unexpected Sui address');
  }

  const expiresAt = BigInt(payload.expires_at);
  const minAcceptedExpiry = BigInt(Date.now()) + 30_000n;
  if (expiresAt <= minAcceptedExpiry) {
    throw new Error('Attestation already expired or expiring too soon');
  }

  // The signature comes as hex from the enclave
  const sigHex = payload.signature;
  const sigBytes = sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex;
  const signature = new Uint8Array(Buffer.from(sigBytes, 'hex'));

  return {
    xUserId: BigInt(responseXUserId),
    suiAddress: responseSuiAddress,
    nonce: BigInt(payload.nonce),
    expiresAt,
    signature,
  };
}

/**
 * Request an owner-recovery attestation from the Nautilus enclave service.
 * The current vault owner must still authorize the transaction on-chain; this
 * only authorizes rotating ownership to the canonical embedded wallet.
 */
export async function requestOwnerRecoveryAttestation(
  req: OwnerRecoveryAttestationRequest,
): Promise<OwnerRecoveryAttestationResponse> {
  const signerSecret = getSignerSecret();
  const response = await fetch(getAttestationEndpoint(), {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signerSecret}`,
    },
    body: JSON.stringify({
      kind: 'owner_recovery',
      x_user_id: req.xUserId,
      vault_id: req.vaultId,
      current_owner: req.currentOwner,
      new_owner: req.newOwner,
      recovery_counter: req.recoveryCounter,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => 'unknown error');
    throw new Error(`Owner recovery attestation request failed (${response.status}): ${body}`);
  }

  const payload = OwnerRecoveryAttestationPayloadSchema.parse(await response.json());
  const responseXUserId = parseXUserId(payload.x_user_id);
  if (!responseXUserId || responseXUserId !== req.xUserId) {
    throw new Error('Owner recovery attestation response contained an unexpected X user id');
  }

  const vaultId = normalizeSuiAddress(payload.vault_id);
  if (vaultId !== normalizeSuiAddress(req.vaultId)) {
    throw new Error('Owner recovery attestation response contained an unexpected vault id');
  }

  const currentOwner = normalizeSuiAddress(payload.current_owner);
  if (currentOwner !== normalizeSuiAddress(req.currentOwner)) {
    throw new Error('Owner recovery attestation response contained an unexpected current owner');
  }

  const newOwner = normalizeSuiAddress(payload.new_owner);
  if (newOwner !== normalizeSuiAddress(req.newOwner)) {
    throw new Error('Owner recovery attestation response contained an unexpected new owner');
  }

  const recoveryCounter = BigInt(payload.recovery_counter);
  if (recoveryCounter !== BigInt(req.recoveryCounter)) {
    throw new Error('Owner recovery attestation response contained an unexpected recovery counter');
  }

  const expiresAt = BigInt(payload.expires_at);
  const minAcceptedExpiry = BigInt(Date.now()) + 30_000n;
  if (expiresAt <= minAcceptedExpiry) {
    throw new Error('Attestation already expired or expiring too soon');
  }

  const sigHex = payload.signature;
  const sigBytes = sigHex.startsWith('0x') ? sigHex.slice(2) : sigHex;
  const signature = new Uint8Array(Buffer.from(sigBytes, 'hex'));

  return {
    xUserId: BigInt(responseXUserId),
    vaultId,
    currentOwner,
    newOwner,
    recoveryCounter,
    expiresAt,
    signature,
  };
}
