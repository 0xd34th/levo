import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  parseSuiAddress,
  verifyWalletAuth,
} from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import {
  decodeWalletActivityCursor,
  fetchWalletActivity,
} from '@/lib/wallet-activity';
import { WALLET_AUTH_CHALLENGE_COOKIE } from '@/lib/wallet-auth';

const ACTIVITY_WALLET_AUTH_PATH = '/api/v1/activity';

const QuerySchema = z.object({
  address: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

function privateNoStoreJson(body: unknown, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...Object.fromEntries(new Headers(init?.headers).entries()),
      'Cache-Control': 'private, no-store',
    },
  });
}

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`activity:${ip}`, 60, 30);
  if (!rl.allowed) {
    return privateNoStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return privateNoStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const address = parseSuiAddress(parsed.data.address);
  if (!address) {
    return privateNoStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const { cursor, limit } = parsed.data;
  const paginationCursor = cursor ? decodeWalletActivityCursor(cursor) : null;
  if (cursor && !paginationCursor) {
    return privateNoStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const hasWalletAuth =
    Boolean(req.headers.get('x-wallet-signature')) &&
    Boolean(req.cookies.get(WALLET_AUTH_CHALLENGE_COOKIE));

  if (hasWalletAuth) {
    const walletAuth = await verifyWalletAuth(req, address, ACTIVITY_WALLET_AUTH_PATH);
    if (!walletAuth.ok) {
      return walletAuth.response;
    }
  } else {
    const auth = await verifyPrivyXAuth(req);
    if (!auth.ok) return auth.response;

    const viewerWallet = await prisma.xUser.findUnique({
      where: { xUserId: auth.identity.xUserId },
      select: { privyUserId: true, suiAddress: true },
    });

    if (!viewerWallet?.privyUserId || viewerWallet.privyUserId !== auth.identity.privyUserId) {
      return privateNoStoreJson(
        { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
        { status: 403 },
      );
    }

    if (viewerWallet.suiAddress !== address) {
      return privateNoStoreJson(
        { error: 'Address does not match the authenticated embedded wallet' },
        { status: 403 },
      );
    }
  }

  try {
    const responseBody = await fetchWalletActivity({
      address,
      cursor: paginationCursor,
      limit,
    });

    return privateNoStoreJson(responseBody);
  } catch (error) {
    console.error('Failed to build wallet activity response', error);
    return privateNoStoreJson(
      { error: 'Activity is temporarily unavailable' },
      { status: 503 },
    );
  }
}
