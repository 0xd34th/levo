import { createHmac, timingSafeEqual } from 'crypto';

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

/**
 * Sign a quote payload into an opaque token: base64(json_payload).base64(hmac).
 */
export function signQuoteToken(payload: QuotePayload, secret: string): string {
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(jsonStr).toString('base64url');
  const hmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');
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

  const expectedHmac = createHmac('sha256', secret).update(payloadB64).digest('base64url');

  // Timing-safe comparison
  try {
    const a = Buffer.from(receivedHmac, 'base64url');
    const b = Buffer.from(expectedHmac, 'base64url');
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const payload: QuotePayload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.expiresAt <= now) return null;

    return payload;
  } catch {
    return null;
  }
}
