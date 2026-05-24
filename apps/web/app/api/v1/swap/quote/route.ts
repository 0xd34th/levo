import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  getClientIp,
  invalidInputResponse,
  noStoreJson,
  parseSuiAddress,
  verifySameOrigin,
} from '@/lib/api';
import {
  isSupportedCoinType,
  normalizeCoinType,
} from '@/lib/coins';
import { prisma } from '@/lib/prisma';
import { verifyPrivyXAuth } from '@/lib/privy-auth';
import { rateLimit } from '@/lib/rate-limit';
import { getBestSevenKQuote } from '@/lib/swap/seven-k';
import { stageSwapQuote } from '@/lib/swap/quote-store';

const RequestSchema = z.object({
  coinTypeIn: z.string().min(1),
  coinTypeOut: z.string().min(1),
  amount: z.string().regex(/^\d+$/, 'amount must be a numeric string'),
  senderAddress: z.string().min(1),
});

const SWAP_QUOTE_TTL_SEC = 90;

function isMainnet() {
  return (process.env.NEXT_PUBLIC_SUI_NETWORK ?? 'testnet') === 'mainnet';
}

export async function POST(req: NextRequest) {
  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  if (!isMainnet()) {
    return noStoreJson({ error: 'Swap is available on Sui mainnet only.' }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const senderAddress = parseSuiAddress(parsed.data.senderAddress);
  if (!senderAddress) {
    return invalidInputResponse();
  }

  const amount = BigInt(parsed.data.amount);
  if (amount < 1n || amount > 18446744073709551615n) {
    return noStoreJson({ error: 'Amount out of valid range' }, { status: 400 });
  }

  const coinTypeIn = normalizeCoinType(parsed.data.coinTypeIn);
  const coinTypeOut = normalizeCoinType(parsed.data.coinTypeOut);

  if (!isSupportedCoinType(coinTypeIn) || !isSupportedCoinType(coinTypeOut)) {
    return noStoreJson({ error: 'Unsupported coin type' }, { status: 400 });
  }

  if (coinTypeIn === coinTypeOut) {
    return noStoreJson({ error: 'Choose two different coins.' }, { status: 400 });
  }

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

  const ipRl = await rateLimit(`swap:quote:${getClientIp(req)}`, 60, 20);
  if (!ipRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  const userRl = await rateLimit(`swap:quote:user:${auth.identity.xUserId}`, 60, 10);
  if (!userRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  let quoteReview;
  try {
    quoteReview = await getBestSevenKQuote({
      coinTypeIn,
      coinTypeOut,
      amount: parsed.data.amount,
      senderAddress,
    });
  } catch (error) {
    console.error('Failed to get 7K swap quote', error);
    return noStoreJson({ error: 'No swap quote available for this route.' }, { status: 503 });
  }

  const staged = await stageSwapQuote(
    {
      senderAddress,
      coinTypeIn,
      coinTypeOut,
      amountIn: quoteReview.amountIn,
      amountOut: quoteReview.amountOut,
      minAmountOut: quoteReview.minAmountOut,
      slippageBps: quoteReview.slippageBps,
      provider: quoteReview.provider,
      quote: quoteReview.quote,
    },
    SWAP_QUOTE_TTL_SEC,
  );

  return noStoreJson({
    swapQuoteToken: staged.token,
    provider: quoteReview.provider,
    coinTypeIn,
    coinTypeOut,
    amountIn: quoteReview.amountIn,
    amountOut: quoteReview.amountOut,
    minAmountOut: quoteReview.minAmountOut,
    slippageBps: quoteReview.slippageBps,
    expiresAt: staged.expiresAt.toISOString(),
  });
}
