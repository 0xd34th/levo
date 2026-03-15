import { isIP } from 'node:net';
import { NextRequest, NextResponse } from 'next/server';
import { isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { verifyPersonalMessageSignature } from '@mysten/sui/verify';
import {
  buildWalletAuthMessage,
  clearWalletAuthChallengeCookie,
  verifyWalletAuthChallenge,
  WALLET_AUTH_CHALLENGE_COOKIE,
} from '@/lib/wallet-auth';

const IP_HEADER_NAMES = [
  'x-real-ip',
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'fly-client-ip',
  'x-forwarded-for',
] as const;

function extractIp(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  for (const candidate of headerValue.split(',')) {
    const ip = candidate.trim();
    if (ip && isIP(ip)) {
      return ip;
    }
  }

  return null;
}

export function getClientIp(req: NextRequest): string {
  for (const headerName of IP_HEADER_NAMES) {
    const ip = extractIp(req.headers.get(headerName));
    if (ip) {
      return ip;
    }
  }

  return 'missing-ip';
}

export function invalidInputResponse() {
  return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
}

export function parseSuiAddress(value: string): string | null {
  const trimmedValue = value.trim();
  if (!trimmedValue) {
    return null;
  }

  try {
    const normalizedAddress = normalizeSuiAddress(trimmedValue);
    return isValidSuiAddress(normalizedAddress) ? normalizedAddress : null;
  } catch {
    return null;
  }
}

export function hasValidHmacSecret(secret: string | undefined): secret is string {
  return typeof secret === 'string' && secret.trim().length >= 32;
}

function normalizeOrigin(origin: string): string | null {
  try {
    return new URL(origin).origin;
  } catch {
    return null;
  }
}

export function getExpectedOrigin(req: NextRequest): string | null {
  const configuredOrigin = process.env.APP_ORIGIN?.trim();
  if (configuredOrigin) {
    return normalizeOrigin(configuredOrigin);
  }

  const requestOrigin = normalizeOrigin(req.nextUrl.origin);
  if (!requestOrigin) {
    return null;
  }

  if (process.env.NODE_ENV !== 'production') {
    return requestOrigin;
  }

  return null;
}

function walletAuthError(message: string, path: string) {
  const response = NextResponse.json({ error: message }, { status: 401 });
  clearWalletAuthChallengeCookie(response, path);
  return response;
}

export async function verifyWalletAuth(
  req: NextRequest,
  address: string,
  expectedPath: string,
): Promise<{ ok: true } | { ok: false; response: NextResponse }> {
  const signature = req.headers.get('x-wallet-signature');
  const challengeToken = req.cookies.get(WALLET_AUTH_CHALLENGE_COOKIE)?.value;

  if (!signature || !challengeToken) {
    return {
      ok: false,
      response: walletAuthError('Missing wallet authentication challenge', expectedPath),
    };
  }

  const hmacSecret = process.env.HMAC_SECRET;
  const expectedOrigin = getExpectedOrigin(req);
  if (!hasValidHmacSecret(hmacSecret) || !expectedOrigin) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 },
      ),
    };
  }

  const normalizedAddress = parseSuiAddress(address);
  if (!normalizedAddress) {
    return {
      ok: false,
      response: invalidInputResponse(),
    };
  }

  const challenge = verifyWalletAuthChallenge(challengeToken, hmacSecret);
  if (
    !challenge ||
    challenge.address !== normalizedAddress ||
    challenge.path !== expectedPath ||
    challenge.origin !== expectedOrigin
  ) {
    return {
      ok: false,
      response: walletAuthError('Invalid or expired wallet authentication challenge', expectedPath),
    };
  }

  const message = new TextEncoder().encode(buildWalletAuthMessage(challenge));

  try {
    await verifyPersonalMessageSignature(message, signature, { address: normalizedAddress });
  } catch {
    return {
      ok: false,
      response: walletAuthError('Invalid wallet signature', expectedPath),
    };
  }

  return { ok: true };
}
