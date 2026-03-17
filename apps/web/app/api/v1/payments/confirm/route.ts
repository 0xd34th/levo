import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
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

const RequestSchema = z.object({
  txDigest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{43,44}$/, 'Invalid transaction digest format'),
  quoteToken: z.string().min(1),
});

type QuoteVerificationData = Pick<
  QuotePayload,
  'senderAddress' | 'xUserId' | 'vaultAddress' | 'coinType' | 'amount'
>;

class QuoteClaimError extends Error {
  constructor() {
    super('Quote is no longer claimable');
    this.name = 'QuoteClaimError';
  }
}

function extractTransferredCoinType(objectType: string): string | null {
  const prefix = '0x2::coin::Coin<';
  if (!objectType.startsWith(prefix) || !objectType.endsWith('>')) {
    return null;
  }

  return objectType.slice(prefix.length, -1);
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

  if (
    !existingLedger ||
    existingLedger.senderAddress !== quoteData.senderAddress ||
    existingLedger.xUserId !== quoteData.xUserId ||
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
      xUserId: quoteData.xUserId,
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
      xUserId: true,
      vaultAddress: true,
      coinType: true,
      confirmedTxDigest: true,
    },
  });

  const storedQuoteData: QuoteVerificationData | null = storedQuote
    ? {
        senderAddress: storedQuote.senderAddress,
        xUserId: storedQuote.xUserId,
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
    await prisma.paymentQuote.updateMany({
      where: {
        hmacToken: quoteToken,
        status: 'PENDING',
        confirmedTxDigest: txDigest,
      },
      data: { status: 'FAILED' },
    });
    return NextResponse.json(
      { error: 'Transaction failed on-chain', txDigest },
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

  // 8. Find matching transfer in objectChanges
  const objectChanges = tx.objectChanges ?? [];
  const transferChange = objectChanges.find((change) => {
    // Accept both 'transferred' and 'created' — SplitCoins + TransferObjects
    // produces a 'created' change, not 'transferred'
    if (change.type !== 'transferred' && change.type !== 'created') return false;

    // 'transferred' uses recipient, 'created' uses owner
    const ownerField = change.type === 'transferred' ? change.recipient : change.owner;
    if (typeof ownerField !== 'object' || ownerField === null) return false;
    if (!('AddressOwner' in ownerField)) return false;
    if (ownerField.AddressOwner !== quoteData.vaultAddress) return false;

    return extractTransferredCoinType(change.objectType) === quoteData.coinType;
  });

  if (!transferChange) {
    return NextResponse.json(
      { error: 'No matching transfer found in transaction' },
      { status: 400 },
    );
  }

  // 9. Get amount from balanceChanges
  const balanceChanges = tx.balanceChanges ?? [];
  const vaultBalanceChange = balanceChanges.find((bc) => {
    const owner = bc.owner;
    if (typeof owner !== 'object' || owner === null) return false;
    if (!('AddressOwner' in owner)) return false;
    if (owner.AddressOwner !== quoteData.vaultAddress) return false;
    if (bc.coinType !== quoteData.coinType) return false;
    return true;
  });

  if (!vaultBalanceChange) {
    return NextResponse.json(
      { error: 'No matching balance change found for vault' },
      { status: 400 },
    );
  }

  // 10. Verify amount matches
  const onChainAmount = BigInt(vaultBalanceChange.amount);
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

  // 11. Write PaymentLedger row and update quote to CONFIRMED (in a Prisma transaction)
  try {
    const confirmedAt = new Date();
    await prisma.$transaction(async (txClient) => {
      const claim = await txClient.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          ...(allowExpiredPendingQuote
            ? { confirmedTxDigest: txDigest }
            : { expiresAt: { gte: confirmedAt } }),
          senderAddress: quoteData.senderAddress,
          xUserId: quoteData.xUserId,
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
        throw new QuoteClaimError();
      }

      await txClient.paymentLedger.create({
        data: {
          ledgerSource: 'SEND_CONFIRM',
          txDigest,
          sourceIndex: 0,
          senderAddress: quoteData.senderAddress,
          xUserId: quoteData.xUserId,
          vaultAddress: quoteData.vaultAddress,
          coinType: quoteData.coinType,
          amount: onChainAmount,
        },
      });
    });
  } catch (err: unknown) {
    if (err instanceof QuoteClaimError) {
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
