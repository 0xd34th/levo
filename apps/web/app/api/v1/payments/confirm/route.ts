import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { verifyQuoteToken } from '@/lib/hmac';
import { getSuiClient } from '@/lib/sui';
import { prisma } from '@/lib/prisma';
import { rateLimit } from '@/lib/rate-limit';

const RequestSchema = z.object({
  txDigest: z.string().min(1),
  quoteToken: z.string().min(1),
});

export async function POST(req: NextRequest) {
  // 1. Rate limit by IP (20 req/min)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown';
  const rl = await rateLimit(`confirm:${ip}`, 60, 20);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // 2. Parse and validate input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.format() },
      { status: 400 },
    );
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

  // 5. Find matching PaymentQuote by hmacToken where status=PENDING
  const quote = await prisma.paymentQuote.findFirst({
    where: {
      hmacToken: quoteToken,
      status: 'PENDING',
    },
  });
  if (!quote) {
    return NextResponse.json(
      { error: 'No matching pending quote found' },
      { status: 404 },
    );
  }

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
    await prisma.paymentQuote.update({
      where: { id: quote.id },
      data: { status: 'FAILED' },
    });
    return NextResponse.json(
      { error: 'Transaction failed on-chain', txDigest },
      { status: 409 },
    );
  }

  // 7. Verify sender matches quote's senderAddress
  const txSender = tx.transaction?.data.sender;
  if (!txSender || txSender !== quote.senderAddress) {
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
    if (recipient.AddressOwner !== quote.vaultAddress) return false;
    // Check objectType includes the coinType
    if (!change.objectType.includes(quote.coinType)) return false;
    return true;
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
    if (owner.AddressOwner !== quote.vaultAddress) return false;
    if (bc.coinType !== quote.coinType) return false;
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
  if (onChainAmount !== quote.amount) {
    return NextResponse.json(
      {
        error: 'Amount mismatch',
        expected: quote.amount.toString(),
        actual: onChainAmount.toString(),
      },
      { status: 400 },
    );
  }

  // 11. Write PaymentLedger row and update quote to CONFIRMED (in a Prisma transaction)
  await prisma.$transaction([
    prisma.paymentLedger.create({
      data: {
        ledgerSource: 'SEND_CONFIRM',
        txDigest,
        sourceIndex: 0,
        senderAddress: quote.senderAddress,
        xUserId: quote.xUserId,
        vaultAddress: quote.vaultAddress,
        coinType: quote.coinType,
        amount: onChainAmount,
      },
    }),
    prisma.paymentQuote.update({
      where: { id: quote.id },
      data: { status: 'CONFIRMED' },
    }),
  ]);

  // 12. Return confirmed result
  return NextResponse.json({
    status: 'confirmed',
    amount: onChainAmount.toString(),
    vaultAddress: quote.vaultAddress,
    txDigest,
  });
}
