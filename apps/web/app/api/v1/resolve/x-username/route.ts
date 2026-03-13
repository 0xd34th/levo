import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveXUser } from '@/lib/twitter';
import { deriveVaultAddress } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  username: z.string().min(1).max(16),
});

export async function POST(req: NextRequest) {
  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rl = await rateLimit(`resolve:${ip}`, 60, 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Parse input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.format() },
      { status: 400 },
    );
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

  const userInfo = await resolveXUser(username, apiKey);
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

  return NextResponse.json({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: userInfo.profilePicture,
    isBlueVerified: userInfo.isBlueVerified,
    derivationVersion,
    vaultAddress,
  });
}
