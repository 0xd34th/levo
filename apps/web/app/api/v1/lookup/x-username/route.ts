import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse, noStoreJson } from '@/lib/api';
import { buildPublicLookupResponse, persistReceivedDashboardXUser } from '@/lib/received-dashboard';
import { rateLimit } from '@/lib/rate-limit';
import { X_USERNAME_INPUT_RE, TwitterApiError } from '@/lib/twitter';
import { getXLookupErrorDetails, resolveFreshXUser } from '@/lib/x-user-lookup';

const QuerySchema = z.object({
  username: z.string().regex(X_USERNAME_INPUT_RE, 'Invalid username'),
});

export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`public-lookup:${ip}`, 60, 30);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const params = Object.fromEntries(req.nextUrl.searchParams);
  const parsed = QuerySchema.safeParse(params);
  if (!parsed.success) {
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

  const { username } = parsed.data;

  let userInfo;
  try {
    userInfo = await resolveFreshXUser(username, apiKey);
  } catch (error) {
    if (error instanceof TwitterApiError) {
      const lookupError = getXLookupErrorDetails(error);
      if (lookupError.status === 429) {
        console.warn('Public X lookup provider is rate limited');
      } else {
        console.error('Failed to resolve public X lookup', error);
      }
      return noStoreJson(
        { error: lookupError.error },
        { status: lookupError.status, headers: lookupError.headers },
      );
    }

    console.error('Failed to resolve public X lookup', error);
    return noStoreJson(
      { error: 'Lookup is temporarily unavailable' },
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
    const responseBody = await buildPublicLookupResponse(
      userInfo,
      registryId,
      derivationVersion,
    );

    return NextResponse.json(responseBody, {
      headers: {
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('Failed to build public lookup response', error);
    return noStoreJson(
      { error: 'Lookup is temporarily unavailable' },
      { status: 503 },
    );
  }
}
