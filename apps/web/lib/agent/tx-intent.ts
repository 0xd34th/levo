import { createHash } from 'node:crypto';
import { normalizeSuiAddress } from '@mysten/sui/utils';
import { createScopedHmac, hasMatchingHmac } from '@/lib/scoped-hmac';

const OWNER_TX_INTENT_SCOPE = 'agent-owner-tx-v1';
const OWNER_TX_INTENT_TTL_MS = 10 * 60 * 1000;

export type OwnerTxOperation = 'create' | 'initialize' | 'revoke' | 'destroy';

export interface OwnerTxIntentBinding {
  operation: OwnerTxOperation;
  ownerXUserId: string;
  ownerAddress: string;
  txBytesBase64: string;
  requestHash?: string;
  mandateRowId?: string;
  mandateObjectId?: string;
}

interface OwnerTxIntentPayload {
  v: 1;
  operation: OwnerTxOperation;
  ownerXUserId: string;
  ownerAddress: string;
  txHash: string;
  requestHash?: string;
  mandateRowId?: string;
  mandateObjectId?: string;
  issuedAt: number;
  expiresAt: number;
}

export type OwnerTxIntentVerification =
  | { ok: true }
  | {
      ok: false;
      reason:
        | 'owner tx intent invalid'
        | 'owner tx intent expired'
        | 'owner tx intent mismatch';
    };

export function issueOwnerTxIntent(
  binding: OwnerTxIntentBinding,
  secret: string,
  now = Date.now(),
): string {
  const payload: OwnerTxIntentPayload = {
    v: 1,
    operation: binding.operation,
    ownerXUserId: binding.ownerXUserId,
    ownerAddress: normalizeAddress(binding.ownerAddress),
    txHash: hashTxBytes(binding.txBytesBase64),
    requestHash: binding.requestHash,
    mandateRowId: binding.mandateRowId,
    mandateObjectId: binding.mandateObjectId,
    issuedAt: now,
    expiresAt: now + OWNER_TX_INTENT_TTL_MS,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const hmac = createScopedHmac(payloadB64, secret, OWNER_TX_INTENT_SCOPE);
  return `${payloadB64}.${hmac}`;
}

export function verifyOwnerTxIntent(
  token: string | undefined,
  binding: OwnerTxIntentBinding,
  secret: string,
  now = Date.now(),
): OwnerTxIntentVerification {
  if (!token) {
    return { ok: false, reason: 'owner tx intent invalid' };
  }
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) {
    return { ok: false, reason: 'owner tx intent invalid' };
  }

  const payloadB64 = token.slice(0, dotIndex);
  const receivedHmac = token.slice(dotIndex + 1);
  const expectedHmac = createScopedHmac(payloadB64, secret, OWNER_TX_INTENT_SCOPE);
  if (!hasMatchingHmac(receivedHmac, [expectedHmac])) {
    return { ok: false, reason: 'owner tx intent invalid' };
  }

  let payload: OwnerTxIntentPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
  } catch {
    return { ok: false, reason: 'owner tx intent invalid' };
  }
  if (!isOwnerTxIntentPayload(payload)) {
    return { ok: false, reason: 'owner tx intent invalid' };
  }
  if (payload.expiresAt <= now) {
    return { ok: false, reason: 'owner tx intent expired' };
  }

  const expected: Omit<OwnerTxIntentPayload, 'v' | 'issuedAt' | 'expiresAt'> = {
    operation: binding.operation,
    ownerXUserId: binding.ownerXUserId,
    ownerAddress: normalizeAddress(binding.ownerAddress),
    txHash: hashTxBytes(binding.txBytesBase64),
    requestHash: binding.requestHash,
    mandateRowId: binding.mandateRowId,
    mandateObjectId: binding.mandateObjectId,
  };
  const actual: typeof expected = {
    operation: payload.operation,
    ownerXUserId: payload.ownerXUserId,
    ownerAddress: payload.ownerAddress,
    txHash: payload.txHash,
    requestHash: payload.requestHash,
    mandateRowId: payload.mandateRowId,
    mandateObjectId: payload.mandateObjectId,
  };
  if (stableJson(actual) !== stableJson(expected)) {
    return { ok: false, reason: 'owner tx intent mismatch' };
  }

  return { ok: true };
}

export function hashOwnerTxRequest(value: unknown): string {
  return createHash('sha256').update(stableJson(value)).digest('base64url');
}

function hashTxBytes(txBytesBase64: string): string {
  try {
    return createHash('sha256')
      .update(Buffer.from(txBytesBase64, 'base64'))
      .digest('base64url');
  } catch {
    return createHash('sha256').update(txBytesBase64).digest('base64url');
  }
}

function normalizeAddress(address: string): string {
  try {
    return normalizeSuiAddress(address);
  } catch {
    return address;
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortStable(value));
}

function sortStable(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(sortStable);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, sortStable(entry)]),
    );
  }
  return value;
}

function isOwnerTxIntentPayload(value: unknown): value is OwnerTxIntentPayload {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const payload = value as Partial<OwnerTxIntentPayload>;
  return (
    payload.v === 1 &&
    isOperation(payload.operation) &&
    typeof payload.ownerXUserId === 'string' &&
    typeof payload.ownerAddress === 'string' &&
    typeof payload.txHash === 'string' &&
    (payload.requestHash === undefined || typeof payload.requestHash === 'string') &&
    (payload.mandateRowId === undefined || typeof payload.mandateRowId === 'string') &&
    (payload.mandateObjectId === undefined || typeof payload.mandateObjectId === 'string') &&
    Number.isFinite(payload.issuedAt) &&
    Number.isFinite(payload.expiresAt)
  );
}

function isOperation(value: unknown): value is OwnerTxOperation {
  return (
    value === 'create' ||
    value === 'initialize' ||
    value === 'revoke' ||
    value === 'destroy'
  );
}
