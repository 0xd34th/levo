import { ed25519 } from '@noble/curves/ed25519.js';
import { bytesToHex, hexToBytes, normalizeSuiAddress, normalizeU64 } from './schema';
import type { SignerConfig } from './config';

export const DEFAULT_ATTESTATION_TTL_MS = 5 * 60_000;
export const DEFAULT_ATTESTATION_NONCE = 1n;

export interface SignAttestationInput {
  xUserId: string | number | bigint;
  suiAddress: string;
  nonce?: string | number | bigint;
  expiresAt?: string | number | bigint;
}

export interface SignAttestationOutput {
  signature: string;
  x_user_id: string;
  sui_address: string;
  nonce: string;
  expires_at: string;
}

export interface BuildAttestationBytesInput {
  xUserId: bigint;
  suiAddress: string;
  nonce: bigint;
  expiresAt: bigint;
  registryId: string;
}

function u64ToBytes(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error('Value does not fit in u64');
  }

  const bytes = new Uint8Array(8);
  let remaining = value;
  for (let index = 0; index < 8; index += 1) {
    bytes[index] = Number(remaining & 0xffn);
    remaining >>= 8n;
  }
  return bytes;
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

export function buildAttestationBytes(input: BuildAttestationBytesInput): Uint8Array {
  return concatBytes([
    u64ToBytes(input.xUserId),
    hexToBytes(normalizeSuiAddress(input.suiAddress), 'sui_address'),
    u64ToBytes(input.nonce),
    u64ToBytes(input.expiresAt),
    hexToBytes(normalizeSuiAddress(input.registryId), 'registry_id'),
  ]);
}

export function signAttestation(
  config: SignerConfig,
  input: SignAttestationInput,
  options: { nowMs?: number; ttlMs?: number } = {},
): SignAttestationOutput {
  const xUserId = normalizeU64(input.xUserId, 'x_user_id');
  const suiAddress = normalizeSuiAddress(input.suiAddress);
  const nonce = input.nonce === undefined ? DEFAULT_ATTESTATION_NONCE : normalizeU64(input.nonce, 'nonce');
  const expiresAt =
    input.expiresAt === undefined
      ? BigInt(options.nowMs ?? Date.now()) + BigInt(options.ttlMs ?? DEFAULT_ATTESTATION_TTL_MS)
      : normalizeU64(input.expiresAt, 'expires_at');

  const attestationBytes = buildAttestationBytes({
    xUserId,
    suiAddress,
    nonce,
    expiresAt,
    registryId: config.registryId,
  });

  const signature = ed25519.sign(attestationBytes, config.seed);

  return {
    signature: `0x${bytesToHex(signature)}`,
    x_user_id: xUserId.toString(),
    sui_address: suiAddress,
    nonce: nonce.toString(),
    expires_at: expiresAt.toString(),
  };
}
