import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  invalidInputResponse,
  parseSuiAddress,
  verifyWalletAuth,
} from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import {
  decodeTransactionHistoryCursor,
  encodeTransactionHistoryCursor,
} from '@/lib/transaction-history-cursor';
import { isTrustedProfilePictureUrl, type TransactionHistoryResponse } from '@/lib/transaction-history';
// Cookie is no longer cleared per-request — it lives for its full TTL so
// paginated load-more calls can reuse the same wallet-auth proof.

const QuerySchema = z.object({
  senderAddress: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`history:${ip}`, 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
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

  // Verify the caller owns this wallet
  const auth = await verifyWalletAuth(req, senderAddress, req.nextUrl.pathname);
  if (!auth.ok) return auth.response;

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
