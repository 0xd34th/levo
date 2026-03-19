import { NextRequest } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import {
  getClientIp,
  hasValidHmacSecret,
  invalidInputResponse,
  noStoreJson,
  parseSuiAddress,
  verifySameOrigin,
} from '@/lib/api';
import {
  isSupportedCoinType,
  requiresPackageIdForCoinType,
} from '@/lib/coins';
import { deriveVaultAddress } from '@/lib/sui';
import { signQuoteToken, type QuotePayload } from '@/lib/hmac';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';
import { getXLookupErrorDetails, resolveFreshXUser } from '@/lib/x-user-lookup';
import { X_USERNAME_INPUT_RE } from '@/lib/twitter';

const RequestSchema = z.object({
  username: z.string().regex(X_USERNAME_INPUT_RE, 'Invalid username'),
  coinType: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string'),
  senderAddress: z.string().min(1),
});

const QUOTE_EXPIRY_SECONDS = 5 * 60; // 5 minutes
const MAX_PENDING_QUOTES = 10;

export async function POST(req: NextRequest) {
  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  // Parse input first so we can validate the authenticated sender address
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const normalizedSenderAddress = parseSuiAddress(parsed.data.senderAddress);
  if (!normalizedSenderAddress) {
    return invalidInputResponse();
  }

  const { username, coinType, amount } = parsed.data;
  const senderAddress = normalizedSenderAddress;

  const xUser = await prisma.xUser.findUnique({
    where: { xUserId: auth.identity.xUserId },
    select: { privyUserId: true, suiAddress: true },
  });
  if (!xUser?.suiAddress) {
    return noStoreJson(
      { error: 'No embedded wallet found. Please set up your wallet first.' },
      { status: 400 },
    );
  }

  if (!xUser.privyUserId || xUser.privyUserId !== auth.identity.privyUserId) {
    return noStoreJson(
      { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
      { status: 403 },
    );
  }

  if (xUser.suiAddress !== senderAddress) {
    return noStoreJson(
      { error: 'Sender address does not match the authenticated embedded wallet' },
      { status: 403 },
    );
  }

  // Validate amount bounds (must fit in u64)
  const amountBigInt = BigInt(amount);
  if (amountBigInt < 1n || amountBigInt > 18446744073709551615n) {
    return noStoreJson({ error: 'Amount out of valid range' }, { status: 400 });
  }

  if (
    !process.env.NEXT_PUBLIC_PACKAGE_ID &&
    requiresPackageIdForCoinType(coinType)
  ) {
    return noStoreJson(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  if (!isSupportedCoinType(coinType)) {
    return noStoreJson({ error: 'Unsupported coin type' }, { status: 400 });
  }

  // Rate limit by authenticated sender (10 req/min)
  const ip = getClientIp(req);
  const ipRl = await rateLimit(`quote:${ip}`, 60, 20);
  if (!ipRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const userRl = await rateLimit(`quote:user:${auth.identity.xUserId}`, 60, 10);
  if (!userRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const now = new Date();

  await prisma.paymentQuote.updateMany({
    where: {
      senderAddress,
      status: 'PENDING',
      expiresAt: { lt: now },
    },
    data: { status: 'EXPIRED' },
  });

  // Check pending quote cap: max 10 unresolved quotes per sender
  const pendingCount = await prisma.paymentQuote.count({
    where: {
      senderAddress,
      status: 'PENDING',
      expiresAt: { gt: now },
    },
  });
  if (pendingCount >= MAX_PENDING_QUOTES) {
    return noStoreJson(
      { error: 'Too many pending quotes. Please wait for existing quotes to resolve.' },
      { status: 429 },
    );
  }

  // Resolve username via twitterapi.io, reusing a very recent cached resolution when possible.
  const apiKey = process.env.TWITTER_API_KEY;
  if (!apiKey) {
    return noStoreJson(
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
      console.warn('Quote recipient lookup provider is rate limited');
    } else {
      console.error('Failed to resolve quote recipient', error);
    }
    return noStoreJson(
      { error: lookupError.error },
      { status: lookupError.status, headers: lookupError.headers },
    );
  }
  if (!userInfo) {
    return noStoreJson(
      { error: 'User not found on X' },
      { status: 404 },
    );
  }

  if (userInfo.xUserId === auth.identity.xUserId) {
    return noStoreJson(
      { error: 'Cannot send to yourself' },
      { status: 400 },
    );
  }

  // Check XUser account status — reject if SUSPENDED or DELETED
  const existingUser = await prisma.xUser.findUnique({
    where: { xUserId: userInfo.xUserId },
    select: { accountStatus: true },
  });
  if (
    existingUser &&
    (existingUser.accountStatus === 'SUSPENDED' || existingUser.accountStatus === 'DELETED')
  ) {
    return noStoreJson(
      { error: 'This account is not eligible for payments' },
      { status: 403 },
    );
  }

  // Derive vault address
  const registryId = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID;
  if (!registryId) {
    return noStoreJson(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const vaultAddress = deriveVaultAddress(registryId, BigInt(userInfo.xUserId));
  const derivationVersion = 1;
  const trustedProfilePicture =
    userInfo.profilePicture && isTrustedProfilePictureUrl(userInfo.profilePicture)
      ? userInfo.profilePicture
      : null;

  // Generate HMAC token with 5-minute expiry
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(hmacSecret)) {
    return noStoreJson(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const nonce = randomBytes(16).toString('hex');
  const expiresAtUnix = Math.floor(Date.now() / 1000) + QUOTE_EXPIRY_SECONDS;

  const payload: QuotePayload = {
    xUserId: userInfo.xUserId,
    derivationVersion,
    vaultAddress,
    coinType,
    amount,
    senderAddress,
    nonce,
    expiresAt: expiresAtUnix,
  };

  const quoteToken = signQuoteToken(payload, hmacSecret);
  const expiresAt = new Date(expiresAtUnix * 1000);

  // Upsert XUser row
  await prisma.xUser.upsert({
    where: { xUserId: userInfo.xUserId },
    update: {
      username: userInfo.username,
      profilePicture: trustedProfilePicture,
      isBlueVerified: userInfo.isBlueVerified,
    },
    create: {
      xUserId: userInfo.xUserId,
      username: userInfo.username,
      profilePicture: trustedProfilePicture,
      isBlueVerified: userInfo.isBlueVerified,
      derivationVersion,
    },
  });

  // Write PaymentQuote row
  await prisma.paymentQuote.create({
    data: {
      senderAddress,
      xUserId: userInfo.xUserId,
      usernameAtQuote: userInfo.username,
      derivationVersion,
      vaultAddress,
      coinType,
      amount: BigInt(amount),
      expiresAt,
      status: 'PENDING',
      hmacToken: quoteToken,
    },
  });

  return noStoreJson({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: trustedProfilePicture,
    isBlueVerified: userInfo.isBlueVerified,
    vaultAddress,
    coinType,
    amount,
    quoteToken,
    expiresAt: expiresAt.toISOString(),
  });
}
