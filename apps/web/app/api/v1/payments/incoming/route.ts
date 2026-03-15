import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson } from '@/lib/api';
import {
  buildIncomingPaymentsResponse,
  persistReceivedDashboardXUser,
} from '@/lib/received-dashboard';
import { rateLimit } from '@/lib/rate-limit';
import {
  decodeTransactionHistoryCursor,
} from '@/lib/transaction-history-cursor';
import { X_USERNAME_INPUT_RE, TwitterApiError } from '@/lib/twitter';
import { getXLookupErrorDetails, resolveFreshXUser } from '@/lib/x-user-lookup';

const QuerySchema = z.object({
  username: z.string().regex(X_USERNAME_INPUT_RE, 'Invalid username'),
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`incoming-payments:${ip}`, 60, 60);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const { username, cursor, limit } = parsed.data;
  const paginationCursor = cursor ? decodeTransactionHistoryCursor(cursor) : null;
  if (cursor && !paginationCursor) {
    return invalidInputResponse();
  }

  const apiKey = process.env.TWITTER_API_KEY;
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!apiKey || !registryId) {
    return noStoreJson(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  let userInfo;
  try {
    userInfo = await resolveFreshXUser(username, apiKey);
  } catch (error) {
    if (error instanceof TwitterApiError) {
      const lookupError = getXLookupErrorDetails(error);
      if (lookupError.status === 429) {
        console.warn('Incoming payments X lookup provider is rate limited');
      } else {
        console.error('Failed to resolve incoming payments handle', error);
      }
      return noStoreJson(
        { error: lookupError.error },
        { status: lookupError.status, headers: lookupError.headers },
      );
    }

    console.error('Failed to resolve incoming payments handle', error);
    return noStoreJson(
      { error: 'Incoming payments are temporarily unavailable' },
      { status: 503 },
    );
  }

  if (!userInfo) {
    return noStoreJson(
      { error: 'User not found on X' },
      { status: 404 },
    );
  }

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
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to build incoming payments response', error);
    return noStoreJson(
      { error: 'Incoming payments are temporarily unavailable' },
      { status: 503 },
    );
  }
}
