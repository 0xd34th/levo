import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  getExpectedOrigin,
  hasValidHmacSecret,
  invalidInputResponse,
  parseSuiAddress,
} from '@/lib/api';
import { rateLimit } from '@/lib/rate-limit';
import {
  buildWalletAuthMessage,
  HISTORY_WALLET_AUTH_PATH,
  setWalletAuthChallengeCookie,
  signWalletAuthChallenge,
  WALLET_AUTH_MAX_AGE_SEC,
  type WalletAuthChallengePayload,
} from '@/lib/wallet-auth';

const QuerySchema = z.object({
  address: z.string().min(1),
});

export async function GET(req: NextRequest) {
  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const address = parseSuiAddress(parsed.data.address);
  if (!address) {
    return invalidInputResponse();
  }

  const ip = getClientIp(req);
  const rl = await rateLimit(`wallet-auth-challenge:${ip}:${address}`, 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const hmacSecret = process.env.HMAC_SECRET;
  const origin = getExpectedOrigin(req);
  if (!hasValidHmacSecret(hmacSecret) || !origin) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const issuedAt = Date.now();
  const expiresAt = issuedAt + WALLET_AUTH_MAX_AGE_SEC * 1000;
  const payload: WalletAuthChallengePayload = {
    address,
    origin,
    path: HISTORY_WALLET_AUTH_PATH,
    nonce: randomBytes(16).toString('hex'),
    issuedAt,
    expiresAt,
  };
  const token = signWalletAuthChallenge(payload, hmacSecret);

  const response = NextResponse.json(
    {
      message: buildWalletAuthMessage(payload),
      expiresAt: new Date(expiresAt).toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
  setWalletAuthChallengeCookie(response, token, HISTORY_WALLET_AUTH_PATH, expiresAt);
  return response;
}
