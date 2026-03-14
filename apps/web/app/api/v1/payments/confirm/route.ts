import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getClientIp, invalidInputResponse } from '@/lib/api';
import { verifyQuoteToken } from '@/lib/hmac';
import { getSuiClient } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  txDigest: z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid transaction digest format'),
  quoteToken: z.string().min(1),
});

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

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (20 req/min)
  const ip = getClientIp(req);
  const rl = await rateLimit(`confirm:${ip}`, 60, 20);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // 2. Parse and validate input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return invalidInputResponse();
  }

  const { txDigest, quoteToken } = parsed.data;

  // 3. Verify HMAC token
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hmacSecret) {
    return NextResponse.json(
      { error: 'Server configuration error' },
      { status: 500 },
    );
  }

  const quotePayload = verifyQuoteToken(quoteToken, hmacSecret);
  if (!quotePayload) {
    return NextResponse.json(
      { error: 'Invalid or expired quote token' },
      { status: 401 },
    );
  }

  // 4. Idempotency check: look for existing ledger entry
  const existingLedger = await prisma.paymentLedger.findFirst({
    where: {
      ledgerSource: 'SEND_CONFIRM',
      txDigest,
    },
  });
  if (existingLedger) {
    return NextResponse.json({
      status: 'confirmed',
      amount: existingLedger.amount.toString(),
      vaultAddress: existingLedger.vaultAddress,
      txDigest: existingLedger.txDigest,
    });
  }

  const quotedAmount = BigInt(quotePayload.amount);

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
  if (!txSender || txSender !== quotePayload.senderAddress) {
    return NextResponse.json(
      { error: 'Transaction sender does not match quote' },
      { status: 400 },
    );
  }

  // 8. Find matching transfer in objectChanges
  const objectChanges = tx.objectChanges ?? [];
  const transferChange = objectChanges.find((change) => {
    if (change.type !== 'transferred') return false;
    // Check recipient matches vault address
    const recipient = change.recipient;
    if (typeof recipient !== 'object' || recipient === null) return false;
    if (!('AddressOwner' in recipient)) return false;
    if (recipient.AddressOwner !== quotePayload.vaultAddress) return false;
    return extractTransferredCoinType(change.objectType) === quotePayload.coinType;
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
    if (owner.AddressOwner !== quotePayload.vaultAddress) return false;
    if (bc.coinType !== quotePayload.coinType) return false;
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
          expiresAt: { gte: confirmedAt },
          senderAddress: quotePayload.senderAddress,
          xUserId: quotePayload.xUserId,
          vaultAddress: quotePayload.vaultAddress,
          coinType: quotePayload.coinType,
          amount: onChainAmount,
        },
        data: { status: 'CONFIRMED' },
      });

      if (claim.count !== 1) {
        throw new QuoteClaimError();
      }

      await txClient.paymentLedger.create({
        data: {
          ledgerSource: 'SEND_CONFIRM',
          txDigest,
          sourceIndex: 0,
          senderAddress: quotePayload.senderAddress,
          xUserId: quotePayload.xUserId,
          vaultAddress: quotePayload.vaultAddress,
          coinType: quotePayload.coinType,
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
        },
      });

      if (!currentQuote) {
        return NextResponse.json(
          { error: 'No matching quote found' },
          { status: 404 },
        );
      }

      if (currentQuote.status === 'PENDING' && currentQuote.expiresAt < new Date()) {
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
        return NextResponse.json(
          { error: 'Quote already confirmed' },
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
      return NextResponse.json({ error: 'Transaction already confirmed' }, { status: 409 });
    }
    throw err;
  }

  // 12. Return confirmed result
  return NextResponse.json({
    status: 'confirmed',
    amount: onChainAmount.toString(),
    vaultAddress: quotePayload.vaultAddress,
    txDigest,
  });
}
