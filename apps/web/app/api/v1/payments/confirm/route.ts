import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { normalizeStructTag } from '@mysten/sui/utils';
import {
  getClientIp,
  hasValidHmacSecret,
  invalidInputResponse,
  verifySameOrigin,
} from '@/lib/api';
import { verifyQuoteToken, type QuotePayload } from '@/lib/hmac';
import { getSuiClient } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';
import { annotateNoValidGasCoinsError } from '@/lib/sui-transaction-errors';

const RequestSchema = z.object({
  txDigest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'Invalid transaction digest format'),
  quoteToken: z.string().min(1),
});

type QuoteVerificationData = Pick<
  QuotePayload,
  'senderAddress' | 'xUserId' | 'vaultAddress' | 'coinType' | 'amount'
> & { recipientType?: 'X_HANDLE' | 'SUI_ADDRESS' };

class QuoteUpdateConflictError extends Error {
  constructor() {
    super('Quote is no longer updateable');
    this.name = 'QuoteUpdateConflictError';
  }
}

function extractAccumulatorBalanceCoinType(type: string): string | null {
  const normalizedType = normalizeStructTag(type);
  const prefix = `${normalizeStructTag('0x2::balance::Balance<0x2::sui::SUI>').split('<')[0]}<`;
  if (!normalizedType.startsWith(prefix) || !normalizedType.endsWith('>')) {
    return null;
  }

  return normalizedType.slice(prefix.length, -1);
}

function isPrismaConflictError(error: unknown): error is { code: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}

function confirmedResponse(amount: bigint, vaultAddress: string, txDigest: string) {
  return NextResponse.json(
    {
      status: 'confirmed',
      amount: amount.toString(),
      vaultAddress,
      txDigest,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  );
}

async function findMatchingConfirmedLedgerEntry(
  txDigest: string,
  quoteData: QuoteVerificationData,
): Promise<{ amount: bigint; vaultAddress: string; txDigest: string } | null> {
  const existingLedger = await prisma.paymentLedger.findUnique({
    where: {
      ledgerSource_txDigest_sourceIndex: {
        ledgerSource: 'SEND_CONFIRM',
        txDigest,
        sourceIndex: 0,
      },
    },
    select: {
      txDigest: true,
      senderAddress: true,
      xUserId: true,
      vaultAddress: true,
      coinType: true,
      amount: true,
    },
  });

  // Normalize xUserId: empty string in HMAC payload maps to null in DB
  const normalizedQuoteXUserId = quoteData.xUserId || null;
  if (
    !existingLedger ||
    existingLedger.senderAddress !== quoteData.senderAddress ||
    (existingLedger.xUserId ?? null) !== normalizedQuoteXUserId ||
    existingLedger.vaultAddress !== quoteData.vaultAddress ||
    existingLedger.coinType !== quoteData.coinType ||
    existingLedger.amount !== BigInt(quoteData.amount)
  ) {
    return null;
  }

  return {
    amount: existingLedger.amount,
    vaultAddress: existingLedger.vaultAddress,
    txDigest: existingLedger.txDigest,
  };
}

async function syncPendingQuoteWithConfirmedLedger(
  quoteToken: string,
  quoteData: QuoteVerificationData,
  txDigest: string,
) {
  await prisma.paymentQuote.updateMany({
    where: {
      hmacToken: quoteToken,
      status: 'PENDING',
      senderAddress: quoteData.senderAddress,
      xUserId: quoteData.xUserId || null,
      vaultAddress: quoteData.vaultAddress,
      coinType: quoteData.coinType,
      amount: BigInt(quoteData.amount),
    },
    data: {
      status: 'CONFIRMED',
      confirmedTxDigest: txDigest,
    },
  });
}

function findMatchingRecipientAmountFromBalanceChanges(params: {
  balanceChanges: Array<{
    owner?: unknown;
    coinType?: string;
    amount?: string;
  }>;
  recipientAddress: string;
  coinType: string;
}) {
  const normalizedCoinType = normalizeStructTag(params.coinType);
  const match = params.balanceChanges.find((bc) => {
    const owner = bc.owner;
    if (typeof owner !== 'object' || owner === null) return false;
    if (!('AddressOwner' in owner)) return false;
    if (owner.AddressOwner !== params.recipientAddress) return false;
    if (!bc.coinType || normalizeStructTag(bc.coinType) !== normalizedCoinType) return false;
    return BigInt(bc.amount ?? '0') > 0n;
  });

  return match ? BigInt(match.amount ?? '0') : null;
}

function findMatchingRecipientAmountFromAccumulatorEvents(params: {
  accumulatorEvents: unknown[] | null | undefined;
  recipientAddress: string;
  coinType: string;
}) {
  const normalizedCoinType = normalizeStructTag(params.coinType);

  for (const event of params.accumulatorEvents ?? []) {
    if (typeof event !== 'object' || event === null) {
      continue;
    }
    const candidate = event as {
      address?: string;
      operation?: string;
      ty?: string;
      value?: {
        integer?: string;
      };
    };
    if (candidate.address !== params.recipientAddress) {
      continue;
    }
    if (candidate.operation !== 'merge') {
      continue;
    }
    if (!candidate.ty || extractAccumulatorBalanceCoinType(candidate.ty) !== normalizedCoinType) {
      continue;
    }
    if (!candidate.value?.integer) {
      continue;
    }

    const amount = BigInt(candidate.value.integer);
    if (amount > 0n) {
      return amount;
    }
  }

  return null;
}

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (20 req/min)
  const ip = getClientIp(req);
  const rl = await rateLimit(`confirm:${ip}`, 60, 20);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  // 2. Parse and validate input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const { txDigest, quoteToken } = parsed.data;
  const quoteRl = await rateLimit(`confirm:token:${quoteToken}`, 60, 5);
  if (!quoteRl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // 3. Verify HMAC token
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(hmacSecret)) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const storedQuote = await prisma.paymentQuote.findFirst({
    where: {
      hmacToken: quoteToken,
    },
    select: {
      status: true,
      expiresAt: true,
      amount: true,
      senderAddress: true,
      recipientType: true,
      xUserId: true,
      vaultAddress: true,
      coinType: true,
      confirmedTxDigest: true,
    },
  });

  const storedQuoteData: QuoteVerificationData | null = storedQuote
    ? {
        recipientType: storedQuote.recipientType,
        senderAddress: storedQuote.senderAddress,
        xUserId: storedQuote.xUserId ?? '',
        vaultAddress: storedQuote.vaultAddress,
        coinType: storedQuote.coinType,
        amount: storedQuote.amount.toString(),
      }
    : null;

  if (storedQuote?.status === 'CONFIRMED') {
    if (storedQuote.confirmedTxDigest) {
      return confirmedResponse(
        storedQuote.amount,
        storedQuote.vaultAddress,
        storedQuote.confirmedTxDigest,
      );
    }

    // Keep legacy retries working for rows confirmed before confirmed_tx_digest existed.
    const matchingLedger = storedQuoteData
      ? await findMatchingConfirmedLedgerEntry(txDigest, storedQuoteData)
      : null;
    if (matchingLedger) {
      return confirmedResponse(
        storedQuote.amount,
        storedQuote.vaultAddress,
        matchingLedger.txDigest,
      );
    }

    return NextResponse.json(
      { error: 'Confirmed quote is missing its finalized transaction digest' },
      { status: 409 },
    );
  }

  if (storedQuote?.confirmedTxDigest === txDigest && storedQuoteData) {
    const matchingLedger = await findMatchingConfirmedLedgerEntry(
      txDigest,
      storedQuoteData,
    );
    if (matchingLedger) {
      await syncPendingQuoteWithConfirmedLedger(
        quoteToken,
        storedQuoteData,
        matchingLedger.txDigest,
      );
      return confirmedResponse(
        matchingLedger.amount,
        matchingLedger.vaultAddress,
        matchingLedger.txDigest,
      );
    }
  }

  const quotePayload = verifyQuoteToken(quoteToken, hmacSecret);
  const recoverExpiredStoredQuote =
    !quotePayload &&
    storedQuote?.status === 'PENDING' &&
    storedQuote?.confirmedTxDigest === txDigest &&
    storedQuoteData !== null;

  if (!quotePayload && !recoverExpiredStoredQuote) {
    return NextResponse.json(
      { error: 'Invalid or expired quote token' },
      { status: 401 },
    );
  }

  const quoteData = quotePayload ?? storedQuoteData;
  if (!quoteData) {
    return NextResponse.json(
      { error: 'Invalid or expired quote token' },
      { status: 401 },
    );
  }
  const allowExpiredPendingQuote = recoverExpiredStoredQuote;

  const matchingLedger = await findMatchingConfirmedLedgerEntry(txDigest, quoteData);
  if (matchingLedger) {
    await syncPendingQuoteWithConfirmedLedger(
      quoteToken,
      quoteData,
      matchingLedger.txDigest,
    );
    return confirmedResponse(
      matchingLedger.amount,
      matchingLedger.vaultAddress,
      matchingLedger.txDigest,
    );
  }

  const quotedAmount = BigInt(quoteData.amount);
  const settlementCoinType = quoteData.coinType;

  // 6. Fetch transaction from Sui RPC
  const client = getSuiClient();
  let tx;
  try {
    tx = await client.getTransactionBlock({
      digest: txDigest,
      options: {
        showEffects: true,
        showObjectChanges: true,
        showBalanceChanges: true,
        showInput: true,
      },
    });
  } catch (err: unknown) {
    // Transaction not found or not yet visible
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes('Could not find') ||
      message.includes('not found') ||
      message.includes('NotFound')
    ) {
      return NextResponse.json(
        { status: 'pending', message: 'Transaction not yet visible. Retry shortly.' },
        { status: 202 },
      );
    }
    throw err;
  }

  // 6b. If tx failed on-chain, mark quote FAILED and return 409
  if (tx.effects?.status.status !== 'success') {
    const rawOnChainError = tx.effects?.status.error || 'Transaction failed on-chain';
    const onChainError = annotateNoValidGasCoinsError(rawOnChainError);
    await prisma.paymentQuote.updateMany({
      where: {
        hmacToken: quoteToken,
        status: 'PENDING',
        confirmedTxDigest: txDigest,
      },
      data: { status: 'FAILED' },
    });
    return NextResponse.json(
      {
        error: onChainError === rawOnChainError ? 'Transaction failed on-chain' : onChainError,
        txDigest,
      },
      { status: 409 },
    );
  }

  // 7. Verify sender matches quote's senderAddress
  const txSender = tx.transaction?.data.sender;
  if (!txSender || txSender !== quoteData.senderAddress) {
    return NextResponse.json(
      { error: 'Transaction sender does not match quote' },
      { status: 400 },
    );
  }

  // 8. Verify settlement by recipient balance increase. Address Balance
  // settlement via coin::send_funds may not create or transfer a Coin object.
  const onChainAmount =
    findMatchingRecipientAmountFromBalanceChanges({
      balanceChanges: tx.balanceChanges ?? [],
      recipientAddress: quoteData.vaultAddress,
      coinType: settlementCoinType,
    }) ??
    findMatchingRecipientAmountFromAccumulatorEvents({
      accumulatorEvents: tx.effects?.accumulatorEvents,
      recipientAddress: quoteData.vaultAddress,
      coinType: settlementCoinType,
    });

  if (onChainAmount === null) {
    return NextResponse.json(
      { error: 'No matching balance change found for vault' },
      { status: 400 },
    );
  }

  // 9. Verify amount matches
  if (onChainAmount !== quotedAmount) {
    return NextResponse.json(
      {
        error: 'Amount mismatch',
        expected: quotedAmount.toString(),
        actual: onChainAmount.toString(),
      },
      { status: 400 },
    );
  }

  // 10. Write PaymentLedger row and update quote to CONFIRMED (in a Prisma transaction)
  try {
    const confirmedAt = new Date();
    const normalizedXUserId = quoteData.xUserId || null;
    const recipientType = quoteData.recipientType ?? 'X_HANDLE';
    await prisma.$transaction(async (txClient) => {
      const claim = await txClient.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          ...(allowExpiredPendingQuote
            ? { confirmedTxDigest: txDigest }
            : { expiresAt: { gte: confirmedAt } }),
          senderAddress: quoteData.senderAddress,
          xUserId: normalizedXUserId,
          vaultAddress: quoteData.vaultAddress,
          coinType: quoteData.coinType,
          amount: onChainAmount,
        },
        data: {
          status: 'CONFIRMED',
          confirmedTxDigest: txDigest,
        },
      });

      if (claim.count !== 1) {
        throw new QuoteUpdateConflictError();
      }

      await txClient.paymentLedger.create({
        data: {
          ledgerSource: 'SEND_CONFIRM',
          txDigest,
          sourceIndex: 0,
          senderAddress: quoteData.senderAddress,
          recipientType,
          xUserId: normalizedXUserId,
          vaultAddress: quoteData.vaultAddress,
          coinType: quoteData.coinType,
          amount: onChainAmount,
        },
      });
    });
  } catch (err: unknown) {
    if (err instanceof QuoteUpdateConflictError) {
      const currentQuote = await prisma.paymentQuote.findFirst({
        where: { hmacToken: quoteToken },
        select: {
          status: true,
          expiresAt: true,
          amount: true,
          vaultAddress: true,
          confirmedTxDigest: true,
        },
      });

      if (!currentQuote) {
        return NextResponse.json(
          { error: 'No matching quote found' },
          { status: 404 },
        );
      }

      if (
        !allowExpiredPendingQuote &&
        currentQuote.status === 'PENDING' &&
        currentQuote.expiresAt < new Date()
      ) {
        await prisma.paymentQuote.updateMany({
          where: {
            hmacToken: quoteToken,
            status: 'PENDING',
            expiresAt: { lt: new Date() },
          },
          data: { status: 'EXPIRED' },
        });

        return NextResponse.json(
          { error: 'Quote expired before confirmation completed' },
          { status: 410 },
        );
      }

      if (currentQuote.status === 'CONFIRMED') {
        if (currentQuote.confirmedTxDigest) {
          return confirmedResponse(
            currentQuote.amount,
            currentQuote.vaultAddress,
            currentQuote.confirmedTxDigest,
          );
        }

        const confirmedLedger = await findMatchingConfirmedLedgerEntry(txDigest, quoteData);
        if (confirmedLedger) {
          return confirmedResponse(
            currentQuote.amount,
            currentQuote.vaultAddress,
            confirmedLedger.txDigest,
          );
        }

        return NextResponse.json(
          { error: 'Quote already confirmed without a stored finalized digest' },
          { status: 409 },
        );
      }

      if (currentQuote.status === 'FAILED') {
        return NextResponse.json(
          { error: 'Quote already failed' },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: 'Quote is no longer pending' },
        { status: 409 },
      );
    }

    if (isPrismaConflictError(err)) {
      const confirmedLedger = await findMatchingConfirmedLedgerEntry(txDigest, quoteData);
      if (confirmedLedger) {
        await syncPendingQuoteWithConfirmedLedger(
          quoteToken,
          quoteData,
          confirmedLedger.txDigest,
        );
        return confirmedResponse(
          confirmedLedger.amount,
          confirmedLedger.vaultAddress,
          confirmedLedger.txDigest,
        );
      }

      return NextResponse.json({ error: 'Transaction already confirmed' }, { status: 409 });
    }
    throw err;
  }

  // 12. Return confirmed result
  return confirmedResponse(onChainAmount, quoteData.vaultAddress, txDigest);
}
