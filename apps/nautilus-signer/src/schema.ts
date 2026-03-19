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

export const AttestationRequestSchema = z.object({
  x_user_id: z.union([z.string(), z.number(), z.bigint()]),
  sui_address: z.string(),
});

export type AttestationRequestInput = z.input<typeof AttestationRequestSchema>;

export function parseAttestationRequest(input: unknown): {
  xUserId: bigint;
  xUserIdText: string;
  suiAddress: string;
} {
  const parsed = AttestationRequestSchema.parse(input);
  const xUserId = normalizeU64(parsed.x_user_id, 'x_user_id');
  const suiAddress = normalizeSuiAddress(parsed.sui_address);

  return {
    xUserId,
    xUserIdText: xUserId.toString(),
    suiAddress,
  };
}
