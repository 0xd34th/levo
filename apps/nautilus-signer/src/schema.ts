import { z } from 'zod';

function stripHexPrefix(value: string): string {
  return value.startsWith('0x') || value.startsWith('0X') ? value.slice(2) : value;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(value: string, label = 'hex string'): Uint8Array {
  const hex = stripHexPrefix(value.trim());
  if (hex.length === 0 || hex.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error(`Invalid ${label}`);
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

export function normalizeSuiAddress(value: string): string {
  const hex = stripHexPrefix(value.trim());
  if (hex.length === 0 || hex.length > 64 || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error('Invalid sui_address');
  }

  return `0x${hex.toLowerCase().padStart(64, '0')}`;
}

export function normalizeUnsignedInteger(value: string | number | bigint, label: string): bigint {
  const text = String(value).trim();
  if (!/^\d+$/.test(text)) {
    throw new Error(`Invalid ${label}`);
  }

  return BigInt(text);
}

export function normalizeU64(value: string | number | bigint, label: string): bigint {
  const parsed = normalizeUnsignedInteger(value, label);
  if (parsed > 0xffff_ffff_ffff_ffffn) {
    throw new Error(`Invalid ${label}`);
  }

  return parsed;
}

const ClaimAttestationRequestSchema = z.object({
  x_user_id: z.union([z.string(), z.number(), z.bigint()]),
  sui_address: z.string(),
  kind: z.undefined().optional(),
});

const OwnerRecoveryAttestationRequestSchema = z.object({
  kind: z.literal('owner_recovery'),
  x_user_id: z.union([z.string(), z.number(), z.bigint()]),
  vault_id: z.string(),
  current_owner: z.string(),
  new_owner: z.string(),
  recovery_counter: z.union([z.string(), z.number(), z.bigint()]),
});

export const AttestationRequestSchema = z.union([
  ClaimAttestationRequestSchema,
  OwnerRecoveryAttestationRequestSchema,
]);

export type AttestationRequestInput = z.input<typeof AttestationRequestSchema>;

export function parseAttestationRequest(input: unknown):
  | {
      kind: 'claim';
      xUserId: bigint;
      xUserIdText: string;
      suiAddress: string;
    }
  | {
      kind: 'owner_recovery';
      xUserId: bigint;
      xUserIdText: string;
      vaultId: string;
      currentOwner: string;
      newOwner: string;
      recoveryCounter: bigint;
      recoveryCounterText: string;
    } {
  const parsed = AttestationRequestSchema.parse(input);
  const xUserId = normalizeU64(parsed.x_user_id, 'x_user_id');

  if (parsed.kind === 'owner_recovery') {
    return {
      kind: 'owner_recovery',
      xUserId,
      xUserIdText: xUserId.toString(),
      vaultId: normalizeSuiAddress(parsed.vault_id),
      currentOwner: normalizeSuiAddress(parsed.current_owner),
      newOwner: normalizeSuiAddress(parsed.new_owner),
      recoveryCounter: normalizeU64(parsed.recovery_counter, 'recovery_counter'),
      recoveryCounterText: normalizeU64(parsed.recovery_counter, 'recovery_counter').toString(),
    };
  }

  return {
    kind: 'claim',
    xUserId,
    xUserIdText: xUserId.toString(),
    suiAddress: normalizeSuiAddress(parsed.sui_address),
  };
}
