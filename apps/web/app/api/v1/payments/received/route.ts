import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import {
  buildIncomingPaymentsResponse,
  persistReceivedDashboardXUser,
} from '@/lib/received-dashboard';
import { rateLimit } from '@/lib/rate-limit';
import { decodeTransactionHistoryCursor } from '@/lib/transaction-history-cursor';
import { parseXUserId, type XUserInfo } from '@/lib/twitter';

const QuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`received-payments:${ip}`, 60, 60);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) {
    return auth.response;
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const { cursor, limit } = parsed.data;
  const paginationCursor = cursor ? decodeTransactionHistoryCursor(cursor) : null;
  if (cursor && !paginationCursor) {
    return invalidInputResponse();
  }

  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    return noStoreJson(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const { identity } = auth;
  const xUserId = parseXUserId(identity.xUserId);
  if (!xUserId) {
    return noStoreJson(
      { error: 'Invalid X user identifier' },
      { status: 400 },
    );
  }

  const existingXUser = await prisma.xUser.findUnique({
    where: { xUserId },
    select: { username: true, isBlueVerified: true },
  });
  const userInfo: XUserInfo = {
    xUserId,
    username: identity.username ?? existingXUser?.username ?? 'user',
    profilePicture: identity.profilePictureUrl,
    isBlueVerified: existingXUser?.isBlueVerified ?? false,
  };

  try {
    const derivationVersion = await persistReceivedDashboardXUser(userInfo);
    const responseBody = await buildIncomingPaymentsResponse(
      userInfo,
      registryId,
      limit,
      paginationCursor,
      derivationVersion,
    );

    return NextResponse.json(responseBody, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Failed to build received payments response', error);
    return noStoreJson(
      { error: 'Received payments are temporarily unavailable' },
      { status: 503 },
    );
  }
}
