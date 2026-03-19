import { NextRequest } from 'next/server';
import { getClientIp, noStoreJson, verifySameOrigin } from '@/lib/api';
import { getPrivyClient, verifyPrivyXAuth } from '@/lib/privy-auth';
import { getOrCreateSuiWallet } from '@/lib/privy-wallet';
import { prisma } from '@/lib/prisma';
import { acquireRedisLock } from '@/lib/redis-lock';
import { rateLimit } from '@/lib/rate-limit';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

export async function POST(req: NextRequest) {
  // Rate limit: 10 req/min per IP
  const ip = getClientIp(req);
  const rl = await rateLimit(`wallet-setup:${ip}`, 60, 10);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const { privyUserId, xUserId, username, profilePictureUrl } = auth.identity;
  const trustedProfilePicture =
    profilePictureUrl && isTrustedProfilePictureUrl(profilePictureUrl)
      ? profilePictureUrl
      : null;

  const walletSetupLock = await acquireRedisLock(`wallet-setup:${xUserId}`, 60);
  if (walletSetupLock.status !== 'acquired') {
    if (walletSetupLock.status === 'busy') {
      return noStoreJson(
        { error: 'Wallet setup already in progress. Please retry in a moment.' },
        { status: 409 },
      );
    }

    return noStoreJson(
      { error: 'Wallet setup is temporarily unavailable. Please retry shortly.' },
      { status: 503 },
    );
  }

  try {
    const existingUser = await prisma.xUser.findUnique({
      where: { xUserId },
      select: { privyUserId: true },
    });

    if (existingUser?.privyUserId && existingUser.privyUserId !== privyUserId) {
      return noStoreJson(
        { error: 'This X account is already linked to a different embedded wallet owner.' },
        { status: 409 },
      );
    }

    await prisma.xUser.upsert({
      where: { xUserId },
      update: {
        ...(username ? { username } : {}),
        ...(trustedProfilePicture ? { profilePicture: trustedProfilePicture } : {}),
        privyUserId,
      },
      create: {
        xUserId,
        username: username ?? xUserId,
        profilePicture: trustedProfilePicture,
        privyUserId,
      },
    });

    const privy = getPrivyClient();
    const wallet = await getOrCreateSuiWallet(privy, privyUserId, xUserId);
    return noStoreJson({
      suiAddress: wallet.suiAddress,
      walletReady: true,
    });
  } catch (error) {
    console.error('Failed to setup Sui wallet', error);
    return noStoreJson(
      { error: 'Failed to create wallet. Please try again.' },
      { status: 500 },
    );
  } finally {
    await walletSetupLock.release();
  }
}
