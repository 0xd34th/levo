import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse } from '@/lib/api';
import { deriveVaultAddress } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { getXLookupErrorDetails, resolveFreshXUser } from '@/lib/x-user-lookup';
import { X_USERNAME_INPUT_RE } from '@/lib/twitter';

const RequestSchema = z.object({
  username: z.string().regex(X_USERNAME_INPUT_RE, 'Invalid username'),
});

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = getClientIp(req);
  const rl = await rateLimit(`resolve:${ip}`, 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Parse input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const { username } = parsed.data;

  // Resolve via twitterapi.io
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  let userInfo;
  try {
    userInfo = await resolveFreshXUser(username, apiKey);
  } catch (error) {
    const lookupError = getXLookupErrorDetails(error);
    if (lookupError.status === 429) {
      console.warn('X lookup provider is rate limited');
    } else {
      console.error('Failed to resolve X user', error);
    }
    return NextResponse.json(
      { error: lookupError.error },
      { status: lookupError.status, headers: lookupError.headers },
    );
  }
  if (!userInfo) {
    return NextResponse.json(
      { error: 'User not found on X' },
      { status: 404 },
    );
  }

  // Derive vault address
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const vaultAddress = deriveVaultAddress(registryId, BigInt(userInfo.xUserId));
  const derivationVersion = 1;

  // Upsert x_user row (analytics/audit only)
  try {
    await prisma.xUser.upsert({
      where: { xUserId: userInfo.xUserId },
      update: {
        username: userInfo.username,
        profilePicture: userInfo.profilePicture,
        isBlueVerified: userInfo.isBlueVerified,
      },
      create: {
        xUserId: userInfo.xUserId,
        username: userInfo.username,
        profilePicture: userInfo.profilePicture,
        isBlueVerified: userInfo.isBlueVerified,
        derivationVersion,
      },
    });
  } catch (error) {
    console.error('Failed to persist resolved X user metadata', error);
  }

  return NextResponse.json({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: userInfo.profilePicture,
    isBlueVerified: userInfo.isBlueVerified,
    derivationVersion,
    vaultAddress,
  });
}
