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

  if (process.env.NODE_ENV === 'production' && baseUrl.protocol !== 'https:') {
    throw new Error('Nautilus enclave URL must use HTTPS in production');
  }

  baseUrl.pathname = `${baseUrl.pathname.replace(/\/+$/, '')}/attestation`;
  baseUrl.search = '';
  baseUrl.hash = '';

  return baseUrl.toString();
}

/**
 * Request an attestation from the Nautilus enclave service.
 * The enclave verifies the user's X identity and produces a signed
 * AttestationMessage { x_user_id, sui_address, nonce, expires_at, registry_id }.
 */
export async function requestAttestation(
  req: AttestationRequest,
): Promise<AttestationResponse> {
  const response = await fetch(getAttestationEndpoint(), {
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
    headers: { 'Content-Type': 'application/json' },
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
  const minAcceptedExpiry = BigInt(Math.floor(Date.now() / 1000) + 30);
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
