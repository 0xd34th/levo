import type { NextResponse } from 'next/server';
import { createLegacyHmac, createScopedHmac, hasMatchingHmac } from './scoped-hmac';

export const HISTORY_WALLET_AUTH_PATH = '/api/v1/payments/history';
export const WALLET_AUTH_CHALLENGE_COOKIE = 'levo_wallet_auth_challenge';
export const WALLET_AUTH_MAX_AGE_SEC = 5 * 60;
const WALLET_AUTH_HMAC_SCOPE = 'wallet-auth';

export interface WalletAuthChallengePayload {
  address: string;
  origin: string;
  path: string;
  nonce: string;
  issuedAt: number; // unix timestamp (milliseconds)
  expiresAt: number; // unix timestamp (milliseconds)
}

function isWalletAuthChallengePayload(value: unknown): value is WalletAuthChallengePayload {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const payload = value as Partial<WalletAuthChallengePayload> & Record<string, unknown>;
  return (
    typeof payload.address === 'string' &&
    typeof payload.origin === 'string' &&
    typeof payload.path === 'string' &&
    typeof payload.nonce === 'string' &&
    Number.isFinite(payload.issuedAt) &&
    Number.isFinite(payload.expiresAt) &&
    !('xUserId' in payload)
  );
}

export function buildWalletAuthMessage(payload: WalletAuthChallengePayload): string {
  return [
    'Levo wallet authentication',
    `Address: ${payload.address}`,
    `Origin: ${payload.origin}`,
    `URI: ${payload.path}`,
    `Nonce: ${payload.nonce}`,
    `Issued At: ${new Date(payload.issuedAt).toISOString()}`,
    `Expires At: ${new Date(payload.expiresAt).toISOString()}`,
  ].join('\n');
}

export function signWalletAuthChallenge(
  payload: WalletAuthChallengePayload,
  secret: string,
): string {
  const jsonStr = JSON.stringify(payload);
  const payloadB64 = Buffer.from(jsonStr).toString('base64url');
  const hmac = createScopedHmac(payloadB64, secret, WALLET_AUTH_HMAC_SCOPE);
  return `${payloadB64}.${hmac}`;
}

export function verifyWalletAuthChallenge(
  token: string,
  secret: string,
): WalletAuthChallengePayload | null {
  const dotIndex = token.indexOf('.');
  if (dotIndex === -1) {
    return null;
  }

  const payloadB64 = token.slice(0, dotIndex);
  const receivedHmac = token.slice(dotIndex + 1);
  const expectedHmacs = [
    createScopedHmac(payloadB64, secret, WALLET_AUTH_HMAC_SCOPE),
    // TODO(2026-Q2): Remove legacy HMAC fallback after rollout.
    createLegacyHmac(payloadB64, secret),
  ];

  if (!hasMatchingHmac(receivedHmac, expectedHmacs)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());

    if (!isWalletAuthChallengePayload(payload)) {
      return null;
    }

    if (payload.expiresAt <= Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function setWalletAuthChallengeCookie(
  response: NextResponse,
  token: string,
  path: string,
  expiresAt: number,
) {
  response.cookies.set({
    name: WALLET_AUTH_CHALLENGE_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path,
    expires: new Date(expiresAt),
  });
}

export function clearWalletAuthChallengeCookie(response: NextResponse, path: string) {
  response.cookies.set({
    name: WALLET_AUTH_CHALLENGE_COOKIE,
    value: '',
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path,
    expires: new Date(0),
  });
}
