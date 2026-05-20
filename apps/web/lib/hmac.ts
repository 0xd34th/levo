import { createLegacyHmac, createScopedHmac, hasMatchingHmac } from './scoped-hmac';

export interface QuotePayload {
  recipientType?: 'X_HANDLE' | 'SUI_ADDRESS'; // absent = X_HANDLE (backward compat)
  xUserId: string;           // empty string '' for SUI_ADDRESS sends
  derivationVersion: number; // 0 for SUI_ADDRESS sends
  vaultAddress: string;      // destination address (vault for X_HANDLE, recipient for SUI_ADDRESS)
  coinType: string;
  amount: string;            // stringified BigInt
  senderAddress: string;
  nonce: string;
  expiresAt: number;         // unix timestamp (seconds)
}

const QUOTE_HMAC_SCOPE = 'quote';

function isQuotePayload(value: unknown): value is QuotePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<QuotePayload>;
  if (
    payload.recipientType !== undefined &&
    payload.recipientType !== 'X_HANDLE' &&
    payload.recipientType !== 'SUI_ADDRESS'
  ) {
    return false;
  }
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
