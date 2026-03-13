import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { resolveXUser } from '@/lib/twitter';
import { deriveVaultAddress } from '@/lib/sui';
import { signQuoteToken, type QuotePayload } from '@/lib/hmac';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const SUI_ADDRESS_RE = /^0x[a-fA-F0-9]{64}$/;

const RequestSchema = z.object({
  username: z.string().min(1).max(15),
  coinType: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string'),
  senderAddress: z.string().regex(SUI_ADDRESS_RE, 'Invalid Sui address'),
});

const QUOTE_EXPIRY_SECONDS = 5 * 60; // 5 minutes
const MAX_PENDING_QUOTES = 10;

export async function POST(req: NextRequest) {
  // Parse input first so we can use senderAddress for rate limiting
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { username, coinType, amount, senderAddress } = parsed.data;

  // Validate amount bounds (must fit in u64)
  const amountBigInt = BigInt(amount);
  if (amountBigInt < 1n || amountBigInt > 18446744073709551615n) {
    return NextResponse.json({ error: 'Amount out of valid range' }, { status: 400 });
  }

  // Validate coinType against allowlist
  const ALLOWED_COIN_TYPES = new Set([
    `${process.env.NEXT_PUBLIC_PACKAGE_ID}::test_usdc::TEST_USDC`,
    '0x2::sui::SUI',
  ]);

  if (!ALLOWED_COIN_TYPES.has(coinType)) {
    return NextResponse.json({ error: 'Unsupported coin type' }, { status: 400 });
  }

  // Rate limit by IP + senderAddress (10 req/min)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rl = await rateLimit(`quote:${ip}:${senderAddress}`, 60, 10);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // Check pending quote cap: max 10 unresolved quotes per sender
  const pendingCount = await prisma.paymentQuote.count({
    where: {
      senderAddress,
      status: 'PENDING',
      expiresAt: { gt: new Date() },
    },
  });
  if (pendingCount >= MAX_PENDING_QUOTES) {
    return NextResponse.json(
      { error: 'Too many pending quotes. Please wait for existing quotes to resolve.' },
      { status: 429 },
    );
  }

  // Resolve username via twitterapi.io (always fresh)
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

  // Check XUser account status — reject if SUSPENDED or DELETED
  const existingUser = await prisma.xUser.findUnique({
    where: { xUserId: userInfo.xUserId },
    select: { accountStatus: true },
  });
  if (
    existingUser &&
    (existingUser.accountStatus === 'SUSPENDED' || existingUser.accountStatus === 'DELETED')
  ) {
    return NextResponse.json(
      { error: 'This account is not eligible for payments' },
      { status: 403 },
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

  // Generate HMAC token with 5-minute expiry
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    return NextResponse.json(
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

  return NextResponse.json({
    xUserId: userInfo.xUserId,
    username: userInfo.username,
    profilePicture: userInfo.profilePicture,
    vaultAddress,
    coinType,
    amount,
    quoteToken,
    expiresAt: expiresAt.toISOString(),
  });
}
