import { createLegacyHmac, createScopedHmac, hasMatchingHmac } from './scoped-hmac';

export interface QuotePayload {
  xUserId: string;
  derivationVersion: number;
  vaultAddress: string;
  coinType: string;
  amount: string;          // stringified BigInt
  senderAddress: string;
  nonce: string;
  expiresAt: number;       // unix timestamp (seconds)
}

const QUOTE_HMAC_SCOPE = 'quote';

function isQuotePayload(value: unknown): value is QuotePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<QuotePayload>;
  return (
    typeof payload.xUserId === 'string' &&
    Number.isInteger(payload.derivationVersion) &&
    typeof payload.vaultAddress === 'string' &&
    typeof payload.coinType === 'string' &&
    typeof payload.amount === 'string' &&
    /^\d+$/.test(payload.amount) &&
    typeof payload.senderAddress === 'string' &&
    typeof payload.nonce === 'string' &&
    Number.isInteger(payload.expiresAt)
  );
}

/**
 * Sign a quote payload into an opaque token: base64(json_payload).base64(hmac).
 */
export function signQuoteToken(payload: QuotePayload, secret: string): string {
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(jsonStr).toString('base64url');
  const hmac = createScopedHmac(payloadB64, secret, QUOTE_HMAC_SCOPE);
  return `${payloadB64}.${hmac}`;
}

/**
 * Verify and decode a quote token. Returns null if invalid, tampered, or expired.
 */
export function verifyQuoteToken(token: string, secret: string): QuotePayload | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) return null;

  const payloadB64 = token.slice(0, dotIndex);
  const receivedHmac = token.slice(dotIndex + 1);

  const expectedHmacs = [
    createScopedHmac(payloadB64, secret, QUOTE_HMAC_SCOPE),
    // TODO(2026-Q2): Remove legacy HMAC fallback after rollout.
    createLegacyHmac(payloadB64, secret),
  ];

  if (!hasMatchingHmac(receivedHmac, expectedHmacs)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
    if (!isQuotePayload(payload)) {
      return null;
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt <= now) return null;

    return payload;
  } catch {
    return null;
  }
}
