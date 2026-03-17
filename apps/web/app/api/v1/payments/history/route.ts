import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  parseSuiAddress,
  verifyWalletAuth,
} from '@/lib/api';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import {
  decodeTransactionHistoryCursor,
  encodeTransactionHistoryCursor,
} from '@/lib/transaction-history-cursor';
import { isTrustedProfilePictureUrl, type TransactionHistoryResponse } from '@/lib/transaction-history';
import { WALLET_AUTH_CHALLENGE_COOKIE } from '@/lib/wallet-auth';

const QuerySchema = z.object({
  senderAddress: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`history:${ip}`, 60, 30);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const senderAddress = parseSuiAddress(parsed.data.senderAddress);
  if (!senderAddress) {
    return invalidInputResponse();
  }

  const { cursor, limit } = parsed.data;
  const paginationCursor = cursor ? decodeTransactionHistoryCursor(cursor) : null;
  if (cursor && !paginationCursor) {
    return invalidInputResponse();
  }

  const hasWalletAuth =
    Boolean(req.headers.get('x-wallet-signature')) &&
    Boolean(req.cookies.get(WALLET_AUTH_CHALLENGE_COOKIE));

  if (hasWalletAuth) {
    const walletAuth = await verifyWalletAuth(req, senderAddress, req.nextUrl.pathname);
    if (!walletAuth.ok) {
      return walletAuth.response;
    }
  } else {
    const auth = await verifyPrivyXAuth();
    if (!auth.ok) return auth.response;

    const viewerWallet = await prisma.xUser.findUnique({
      where: { xUserId: auth.identity.xUserId },
      select: { privyUserId: true, suiAddress: true },
    });

    if (!viewerWallet?.privyUserId || viewerWallet.privyUserId !== auth.identity.privyUserId) {
      return NextResponse.json(
        { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
        {
          status: 403,
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }

    if (viewerWallet.suiAddress !== senderAddress) {
      return NextResponse.json(
        { error: 'Sender address does not match the authenticated embedded wallet' },
        {
          status: 403,
          headers: {
            'Cache-Control': 'private, no-store',
          },
        },
      );
    }
  }

  const cursorCreatedAt = paginationCursor ? new Date(paginationCursor.createdAt) : null;
  const rows = await prisma.paymentLedger.findMany({
    where: paginationCursor && cursorCreatedAt
      ? {
          senderAddress,
          OR: [
            { createdAt: { lt: cursorCreatedAt } },
            { createdAt: cursorCreatedAt, id: { lt: paginationCursor.id } },
          ],
        }
      : { senderAddress },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit + 1,
    include: {
      xUser: {
        select: { username: true, profilePicture: true },
      },
    },
  });

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? encodeTransactionHistoryCursor({
        createdAt: items[items.length - 1]!.createdAt.toISOString(),
        id: items[items.length - 1]!.id,
      })
    : null;
  const responseBody: TransactionHistoryResponse = {
    items: items.map((row) => ({
      id: row.id,
      txDigest: row.txDigest,
      coinType: row.coinType,
      amount: row.amount.toString(),
      createdAt: row.createdAt.toISOString(),
      recipient: {
        username: row.xUser.username,
        profilePicture:
          row.xUser.profilePicture && isTrustedProfilePictureUrl(row.xUser.profilePicture)
            ? row.xUser.profilePicture
            : null,
      },
    })),
    nextCursor,
  };

  const response = NextResponse.json(
    responseBody,
    {
      headers: {
        'Cache-Control': 'private, no-store',
      },
    },
  );
  return response;
}
