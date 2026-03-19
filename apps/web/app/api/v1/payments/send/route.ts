import { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  Transaction,
  TransactionDataBuilder,
  coinWithBalance,
} from '@mysten/sui/transactions';
import { POST as confirmPayment } from '@/app/api/v1/payments/confirm/route';
import {
  getClientIp,
  hasValidHmacSecret,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { getGasStationKeypair } from '@/lib/gas-station';
import { verifyQuoteToken } from '@/lib/hmac';
import { prisma } from '@/lib/prisma';
import {
  getPrivyClient,
  verifyPrivyXAuth,
} from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import { getRedis, rateLimit } from '@/lib/rate-limit';
import { getSuiClient } from '@/lib/sui';
import { parseXUserId } from '@/lib/twitter';

const RequestSchema = z.object({
  quoteToken: z.string().min(1),
  authorizationSignature: z.string().min(1).optional(),
});

const SEND_USER_RATE_LIMIT_PER_MINUTE = 5;
const STRANDED_PENDING_SEND_TIMEOUT_MS = 30_000;

const FORWARDED_IP_HEADERS = [
  'x-real-ip',
  'cf-connecting-ip',
  'x-vercel-forwarded-for',
  'fly-client-ip',
  'x-forwarded-for',
] as const;

const PendingSendBundleSchema = z.object({
  txDigest: z.string().min(1),
  txBytesBase64: z.string().min(1),
  signatures: z.array(z.string().min(1)).min(1),
});

const PendingSendAuthorizationBundleSchema = z.object({
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
});

type PendingSendBundle = z.infer<typeof PendingSendBundleSchema>;
type PendingSendAuthorizationBundle = z.infer<typeof PendingSendAuthorizationBundleSchema>;

function getPendingSendKey(txDigest: string) {
  return `pending-send:${txDigest}`;
}

function getPendingSendAuthorizationKey(quoteToken: string) {
  return `pending-send-auth:${quoteToken}`;
}

function buildConfirmRequest(req: NextRequest, quoteToken: string, txDigest: string) {
  const headers = new Headers({
    'content-type': 'application/json',
  });
  const origin = req.headers.get('origin');
  if (origin) {
    headers.set('origin', origin);
  }

  for (const headerName of FORWARDED_IP_HEADERS) {
    const headerValue = req.headers.get(headerName);
    if (headerValue) {
      headers.set(headerName, headerValue);
    }
  }

  return new NextRequest(new URL('/api/v1/payments/confirm', req.nextUrl), {
    method: 'POST',
    headers,
    body: JSON.stringify({ quoteToken, txDigest }),
  });
}

function pendingSendResponse(
  amount: string,
  vaultAddress: string,
  txDigest: string,
) {
  return noStoreJson({
    status: 'pending',
    amount,
    vaultAddress,
    txDigest,
  });
}

async function confirmBroadcastedQuote(
  req: NextRequest,
  quoteToken: string,
  txDigest: string,
) {
  return confirmPayment(buildConfirmRequest(req, quoteToken, txDigest));
}

async function stagePendingSend(
  txDigest: string,
  txBytes: Uint8Array,
  signatures: string[],
  ttlSec: number,
) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Pending send store unavailable');
  }

  const payload: PendingSendBundle = {
    txDigest,
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    signatures,
  };

  await redis.set(
    getPendingSendKey(txDigest),
    JSON.stringify(payload),
    'EX',
    ttlSec,
  );
}

async function stagePendingSendAuthorization(
  quoteToken: string,
  txBytes: Uint8Array,
  walletId: string,
  storedPublicKey: string,
  ttlSec: number,
) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Pending send store unavailable');
  }

  const payload: PendingSendAuthorizationBundle = {
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    walletId,
    storedPublicKey,
  };

  await redis.set(
    getPendingSendAuthorizationKey(quoteToken),
    JSON.stringify(payload),
    'EX',
    ttlSec,
  );
}

async function loadPendingSend(txDigest: string): Promise<PendingSendBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingSendKey(txDigest));
    if (!raw) {
      return null;
    }

    const parsed = PendingSendBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending send bundle', { txDigest, error });
    return null;
  }
}

async function loadPendingSendAuthorization(
  quoteToken: string,
): Promise<PendingSendAuthorizationBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingSendAuthorizationKey(quoteToken));
    if (!raw) {
      return null;
    }

    const parsed = PendingSendAuthorizationBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending send authorization bundle', { quoteToken, error });
    return null;
  }
}

async function clearPendingSend(txDigest: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingSendKey(txDigest));
  } catch (error) {
    console.warn('Failed to clear pending send bundle', { txDigest, error });
  }
}

async function clearPendingSendAuthorization(quoteToken: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingSendAuthorizationKey(quoteToken));
  } catch (error) {
    console.warn('Failed to clear pending send authorization bundle', { quoteToken, error });
  }
}

async function recoverBroadcastedQuote(
  req: NextRequest,
  quoteToken: string,
  txDigest: string,
  amount: string,
  vaultAddress: string,
) {
  const response = await confirmBroadcastedQuote(req, quoteToken, txDigest);
  if (response.status === 202) {
    return pendingSendResponse(amount, vaultAddress, txDigest);
  }

  await clearPendingSend(txDigest);
  return response;
}

async function recoverOrResumePendingQuote(
  req: NextRequest,
  quoteToken: string,
  txDigest: string,
  amount: string,
  vaultAddress: string,
  quoteCreatedAt?: Date,
) {
  const initialConfirmation = await confirmBroadcastedQuote(req, quoteToken, txDigest);
  if (initialConfirmation.status !== 202) {
    await clearPendingSend(txDigest);
    return initialConfirmation;
  }

  const stagedSend = await loadPendingSend(txDigest);
  if (!stagedSend || stagedSend.txDigest !== txDigest) {
    const isStalePendingSend =
      quoteCreatedAt instanceof Date &&
      Date.now() - quoteCreatedAt.getTime() >= STRANDED_PENDING_SEND_TIMEOUT_MS;

    if (isStalePendingSend) {
      const reset = await prisma.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          confirmedTxDigest: txDigest,
        },
        data: {
          confirmedTxDigest: null,
        },
      });

      if (reset.count === 1) {
        await clearPendingSend(txDigest);
        return noStoreJson(
          { error: 'Previous send attempt did not complete. Please try again.' },
          { status: 409 },
        );
      }
    }

    return pendingSendResponse(amount, vaultAddress, txDigest);
  }

  try {
    const client = getSuiClient();
    await client.executeTransactionBlock({
      transactionBlock: Uint8Array.from(
        Buffer.from(stagedSend.txBytesBase64, 'base64'),
      ),
      signature: stagedSend.signatures,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });
  } catch (error) {
    console.error('Failed to resume staged send transaction', error);
  }

  return recoverBroadcastedQuote(req, quoteToken, txDigest, amount, vaultAddress);
}

export async function POST(req: NextRequest) {
  // 1. Rate limit
  const ip = getClientIp(req);
  const rl = await rateLimit(`send:${ip}`, 60, 10);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  // 2. Verify Privy auth
  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;
  const xUserId = parseXUserId(auth.identity.xUserId);
  if (!xUserId) {
    return noStoreJson(
      { error: 'Invalid X user identifier' },
      { status: 400 },
    );
  }

  const userRl = await rateLimit(
    `send:user:${xUserId}`,
    60,
    SEND_USER_RATE_LIMIT_PER_MINUTE,
  );
  if (!userRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  // 3. Parse input
  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const { authorizationSignature, quoteToken } = parsed.data;

  // 4. Get user's embedded wallet from DB
  const xUser = await prisma.xUser.findUnique({
    where: { xUserId },
    select: {
      privyUserId: true,
      privyWalletId: true,
      suiAddress: true,
      suiPublicKey: true,
    },
  });

  if (!xUser?.privyWalletId || !xUser.suiAddress || !xUser.suiPublicKey) {
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

  const existingQuote = await prisma.paymentQuote.findFirst({
    where: {
      hmacToken: quoteToken,
      senderAddress: xUser.suiAddress,
    },
    select: {
      status: true,
      confirmedTxDigest: true,
      amount: true,
      vaultAddress: true,
      createdAt: true,
    },
  });

  if (existingQuote?.confirmedTxDigest) {
    if (existingQuote.status === 'CONFIRMED') {
      return noStoreJson({
        status: 'confirmed',
        amount: existingQuote.amount.toString(),
        vaultAddress: existingQuote.vaultAddress,
        txDigest: existingQuote.confirmedTxDigest,
      });
    }

    if (existingQuote.status === 'PENDING') {
      return recoverOrResumePendingQuote(
        req,
        quoteToken,
        existingQuote.confirmedTxDigest,
        existingQuote.amount.toString(),
        existingQuote.vaultAddress,
        existingQuote.createdAt,
      );
    }
  }

  // 5. Verify HMAC quote token
  const hmacSecret = process.env.HMAC_SECRET;
  if (!hasValidHmacSecret(hmacSecret)) {
    return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
  }

  const quotePayload = verifyQuoteToken(quoteToken, hmacSecret);
  if (!quotePayload) {
    return noStoreJson({ error: 'Invalid or expired quote token' }, { status: 401 });
  }

  // 6. Verify sender matches quote
  if (quotePayload.senderAddress !== xUser.suiAddress) {
    return noStoreJson(
      { error: 'Quote was created for a different sender address' },
      { status: 400 },
    );
  }

  // 7. Check quote is still pending
  if (existingQuote && existingQuote.status !== 'PENDING') {
    return noStoreJson(
      { error: 'Quote is no longer available' },
      { status: 409 },
    );
  }

  // 8. Build or load the Sui transaction
  const client = getSuiClient();
  const amount = BigInt(quotePayload.amount);

  let gasKeypair: ReturnType<typeof getGasStationKeypair>;
  try {
    gasKeypair = getGasStationKeypair();
  } catch (error) {
    console.error('Failed to initialize gas station keypair', error);
    return noStoreJson({ error: 'Gas sponsorship is misconfigured' }, { status: 500 });
  }

  let txBytes: Uint8Array;
  let privyWalletId = xUser.privyWalletId;
  let suiPublicKey = xUser.suiPublicKey;

  if (authorizationSignature) {
    const authorizationBundle = await loadPendingSendAuthorization(quoteToken);
    if (!authorizationBundle) {
      return noStoreJson(
        { error: 'Authorization expired. Please confirm the payment again.' },
        { status: 409 },
      );
    }

    await clearPendingSendAuthorization(quoteToken);

    txBytes = Uint8Array.from(Buffer.from(authorizationBundle.txBytesBase64, 'base64'));
    privyWalletId = authorizationBundle.walletId;
    suiPublicKey = authorizationBundle.storedPublicKey;
  } else {
    const tx = new Transaction();
    tx.setSender(xUser.suiAddress);

    if (gasKeypair) {
      tx.setGasOwner(gasKeypair.toSuiAddress());
    }

    const coin = tx.add(
      coinWithBalance({
        type: quotePayload.coinType,
        balance: amount,
      }),
    );
    tx.transferObjects([coin], quotePayload.vaultAddress);

    try {
      txBytes = await tx.build({ client });
    } catch (error) {
      console.error('Failed to build transaction', error);
      return noStoreJson(
        { error: 'Insufficient balance or invalid transaction parameters' },
        { status: 400 },
      );
    }

    try {
      await stagePendingSendAuthorization(
        quoteToken,
        txBytes,
        xUser.privyWalletId,
        xUser.suiPublicKey,
        Math.max(
          30,
          Math.min(120, quotePayload.expiresAt - Math.floor(Date.now() / 1000)),
        ),
      );
    } catch (error) {
      console.error('Failed to stage send authorization request', error);
      return noStoreJson(
        { error: 'Payment is temporarily unavailable. Please retry.' },
        { status: 503 },
      );
    }

    try {
      const authorizationRequest = buildPrivyRawSignAuthorizationRequest(
        xUser.privyWalletId,
        txBytes,
      );
      return noStoreJson({
        status: 'authorization_required',
        authorizationRequest,
      });
    } catch (error) {
      console.error('Failed to build Privy authorization request', error);
      return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
    }
  }

  // 9. Sign with Privy embedded wallet
  const signatures: string[] = [];
  try {
    const privy = getPrivyClient();
    const senderSig = await signSuiTransaction(
      privy,
      privyWalletId,
      suiPublicKey,
      txBytes,
      { signatures: [authorizationSignature] },
    );
    signatures.push(senderSig);
  } catch (error) {
    console.error('Failed to sign transaction', error);
    return noStoreJson({ error: 'Failed to sign transaction' }, { status: 500 });
  }

  if (gasKeypair) {
    try {
      const gasSignResult = await gasKeypair.signTransaction(txBytes);
      signatures.push(gasSignResult.signature);
    } catch (error) {
      console.error('Failed to sign gas-sponsored transaction', error);
      return noStoreJson({ error: 'Gas sponsorship failed' }, { status: 503 });
    }
  }

  const stagedTxDigest = TransactionDataBuilder.getDigestFromBytes(txBytes);
  const stageTtlSec = Math.max(
    60,
    quotePayload.expiresAt - Math.floor(Date.now() / 1000) + 300,
  );

  try {
    await stagePendingSend(stagedTxDigest, txBytes, signatures, stageTtlSec);
  } catch (error) {
    console.error('Failed to stage signed send transaction', error);
    return noStoreJson(
      { error: 'Payment is temporarily unavailable. Please retry.' },
      { status: 503 },
    );
  }

  const marker = await prisma.paymentQuote.updateMany({
    where: {
      hmacToken: quoteToken,
      status: 'PENDING',
      confirmedTxDigest: null,
      senderAddress: quotePayload.senderAddress,
      xUserId: quotePayload.xUserId,
      vaultAddress: quotePayload.vaultAddress,
      coinType: quotePayload.coinType,
      amount,
    },
    data: {
      confirmedTxDigest: stagedTxDigest,
    },
  });

  if (marker.count !== 1) {
    const currentQuote = await prisma.paymentQuote.findFirst({
      where: { hmacToken: quoteToken },
      select: {
        status: true,
        confirmedTxDigest: true,
        amount: true,
        vaultAddress: true,
        createdAt: true,
      },
    });

    if (currentQuote?.confirmedTxDigest !== stagedTxDigest) {
      await clearPendingSend(stagedTxDigest);
    }

    if (currentQuote?.confirmedTxDigest) {
      return recoverOrResumePendingQuote(
        req,
        quoteToken,
        currentQuote.confirmedTxDigest,
        currentQuote.amount.toString(),
        currentQuote.vaultAddress,
        currentQuote.createdAt,
      );
    }

    return noStoreJson(
      { error: 'Quote is no longer pending' },
      { status: 409 },
    );
  }

  // 10. Execute transaction on Sui
  try {
    const result = await client.executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signatures,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status !== 'success') {
      await prisma.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          confirmedTxDigest: stagedTxDigest,
        },
        data: { status: 'FAILED' },
      });
      await clearPendingSend(stagedTxDigest);
      return noStoreJson(
        { error: 'Transaction failed on-chain' },
        { status: 409 },
      );
    }

    const confirmedTxDigest = result.digest || stagedTxDigest;

    if (confirmedTxDigest !== stagedTxDigest) {
      console.error('Executed send digest did not match staged digest', {
        expected: stagedTxDigest,
        actual: confirmedTxDigest,
      });
    }

    // 11. Verify and confirm in DB (atomic)
    const balanceChanges = result.balanceChanges ?? [];
    const vaultBalanceChange = balanceChanges.find((bc) => {
      const owner = bc.owner;
      if (typeof owner !== 'object' || owner === null) return false;
      if (!('AddressOwner' in owner)) return false;
      return (
        owner.AddressOwner === quotePayload.vaultAddress &&
        bc.coinType === quotePayload.coinType
      );
    });

    if (!vaultBalanceChange) {
      console.error('Executed send transaction is missing the expected vault balance change', {
        txDigest: stagedTxDigest,
        vaultAddress: quotePayload.vaultAddress,
        coinType: quotePayload.coinType,
      });
      return recoverBroadcastedQuote(
        req,
        quoteToken,
        confirmedTxDigest,
        quotePayload.amount,
        quotePayload.vaultAddress,
      );
    }

    const onChainAmount = BigInt(vaultBalanceChange.amount);
    if (onChainAmount !== amount) {
      console.error('Executed send amount did not match quoted amount', {
        txDigest: confirmedTxDigest,
        quotedAmount: amount.toString(),
        onChainAmount: onChainAmount.toString(),
      });

      await prisma.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          confirmedTxDigest: stagedTxDigest,
          senderAddress: quotePayload.senderAddress,
          xUserId: quotePayload.xUserId,
          vaultAddress: quotePayload.vaultAddress,
          coinType: quotePayload.coinType,
          amount,
        },
        data: {
          status: 'FAILED',
          confirmedTxDigest,
        },
      });

      await clearPendingSend(stagedTxDigest);
      return noStoreJson(
        { error: 'Executed payment amount did not match the quoted amount' },
        { status: 409 },
      );
    }

    await prisma.$transaction(async (txClient) => {
      const claim = await txClient.paymentQuote.updateMany({
        where: {
          hmacToken: quoteToken,
          status: 'PENDING',
          confirmedTxDigest: stagedTxDigest,
          senderAddress: quotePayload.senderAddress,
          xUserId: quotePayload.xUserId,
          vaultAddress: quotePayload.vaultAddress,
          coinType: quotePayload.coinType,
          amount,
        },
        data: {
          status: 'CONFIRMED',
          confirmedTxDigest,
        },
      });

      if (claim.count !== 1) {
        throw new Error('Quote is no longer claimable');
      }

      await txClient.paymentLedger.create({
        data: {
          ledgerSource: 'SEND_CONFIRM',
          txDigest: confirmedTxDigest,
          sourceIndex: 0,
          senderAddress: quotePayload.senderAddress,
          xUserId: quotePayload.xUserId,
          vaultAddress: quotePayload.vaultAddress,
          coinType: quotePayload.coinType,
          amount: onChainAmount,
        },
      });
    });

    await clearPendingSend(stagedTxDigest);
    return noStoreJson({
      status: 'confirmed',
      amount: quotePayload.amount,
      vaultAddress: quotePayload.vaultAddress,
      txDigest: confirmedTxDigest,
    });
  } catch (error) {
    console.error('Failed to execute transaction', error);
    return recoverOrResumePendingQuote(
      req,
      quoteToken,
      stagedTxDigest,
      quotePayload.amount,
      quotePayload.vaultAddress,
    );
  }
}
