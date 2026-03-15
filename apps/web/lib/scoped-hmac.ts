import { createHmac, timingSafeEqual } from 'node:crypto';

export function createScopedHmac(payloadB64: string, secret: string, scope: string): string {
  return createHmac('sha256', secret).update(`${scope}:`).update(payloadB64).digest('base64url');
}

export function createLegacyHmac(payloadB64: string, secret: string): string {
  return createHmac('sha256', secret).update(payloadB64).digest('base64url');
}

export function hasMatchingHmac(receivedHmac: string, expectedHmacs: string[]): boolean {
  try {
    const received = Buffer.from(receivedHmac, 'base64url');
    let hasMatch = false;
    for (const expectedHmac of expectedHmacs) {
      const expected = Buffer.from(expectedHmac, 'base64url');
      const isMatch =
        received.length === expected.length && timingSafeEqual(received, expected);
      hasMatch = hasMatch || isMatch;
    }
    return hasMatch;
  } catch {
    return false;
  }
}
