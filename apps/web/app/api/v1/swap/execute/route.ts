import { NextRequest } from 'next/server';
import { z } from 'zod';
import { TransactionDataBuilder } from '@mysten/sui/transactions';
import {
  getClientIp,
  noStoreJson,
  verifySameOrigin,
} from '@/lib/api';
import { getGasStationKeypair } from '@/lib/gas-station';
import { prisma } from '@/lib/prisma';
import {
  getPrivyClient,
  verifyPrivyXAuth,
} from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import { rateLimit } from '@/lib/rate-limit';
import { getSuiClient } from '@/lib/sui';
import {
  clearSwapAuthorization,
  loadSwapAuthorization,
  loadSwapQuote,
  stageSwapAuthorization,
} from '@/lib/swap/quote-store';
import { buildSevenKSwapTransaction } from '@/lib/swap/seven-k';

const RequestSchema = z.object({
  swapQuoteToken: z.string().min(1),
  authorizationSignature: z.string().min(1).optional(),
});

const SWAP_AUTH_TTL_SEC = 90;

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

  const rl = await rateLimit(`swap:execute:${getClientIp(req)}`, 60, 10);
  if (!rl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }
  const userRl = await rateLimit(`swap:execute:user:${auth.identity.xUserId}`, 60, 5);
  if (!userRl.allowed) {
    return noStoreJson({ error: 'Rate limit exceeded' }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const { authorizationSignature, swapQuoteToken } = parsed.data;
  const storedQuote = await loadSwapQuote(swapQuoteToken);
  if (!storedQuote) {
    return noStoreJson({ error: 'Invalid or expired swap quote' }, { status: 401 });
  }

  const xUser = await prisma.xUser.findUnique({
    where: { xUserId: auth.identity.xUserId },
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
  if (xUser.suiAddress !== storedQuote.senderAddress) {
    return noStoreJson(
      { error: 'Swap quote was created for a different sender address' },
      { status: 400 },
    );
  }

  let gasKeypair: ReturnType<typeof getGasStationKeypair>;
  try {
    gasKeypair = getGasStationKeypair();
  } catch (error) {
    console.error('Failed to initialize gas station keypair for swap', error);
    return noStoreJson({ error: 'Gas sponsorship is misconfigured' }, { status: 500 });
  }
  if (!gasKeypair) {
    return noStoreJson(
      { error: 'Sponsored execution unavailable for this route.' },
      { status: 503 },
    );
  }

  let txBytes: Uint8Array;
  let privyWalletId = xUser.privyWalletId;
  let suiPublicKey = xUser.suiPublicKey;

  if (authorizationSignature) {
    const authorization = await loadSwapAuthorization(swapQuoteToken);
    if (!authorization) {
      return noStoreJson(
        { error: 'Authorization expired. Please request a fresh swap quote.' },
        { status: 409 },
      );
    }

    txBytes = Uint8Array.from(Buffer.from(authorization.txBytesBase64, 'base64'));
    privyWalletId = authorization.walletId;
    suiPublicKey = authorization.storedPublicKey;
  } else {
    try {
      txBytes = await buildSevenKSwapTransaction({
        quote: storedQuote.quote,
        senderAddress: storedQuote.senderAddress,
        coinTypeIn: storedQuote.coinTypeIn,
        coinTypeOut: storedQuote.coinTypeOut,
        amountIn: storedQuote.amountIn,
        slippageBps: storedQuote.slippageBps,
        gasOwner: gasKeypair.toSuiAddress(),
      });
    } catch (error) {
      console.error('Failed to build sponsored 7K swap transaction', error);
      return noStoreJson(
        { error: 'Sponsored execution unavailable for this route.' },
        { status: 503 },
      );
    }

    await stageSwapAuthorization(
      swapQuoteToken,
      txBytes,
      xUser.privyWalletId,
      xUser.suiPublicKey,
      SWAP_AUTH_TTL_SEC,
    );

    try {
      return noStoreJson({
        status: 'authorization_required',
        authorizationRequest: buildPrivyRawSignAuthorizationRequest(
          xUser.privyWalletId,
          txBytes,
        ),
      });
    } catch (error) {
      console.error('Failed to build swap authorization request', error);
      return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
    }
  }

  const signatures: string[] = [];
  try {
    const senderSignature = await signSuiTransaction(
      getPrivyClient(),
      privyWalletId,
      suiPublicKey,
      txBytes,
      { signatures: [authorizationSignature] },
    );
    signatures.push(senderSignature);
  } catch (error) {
    console.error('Failed to sign swap transaction with Privy', error);
    return noStoreJson({ error: 'Failed to sign transaction' }, { status: 500 });
  }

  try {
    const gasSignature = await gasKeypair.signTransaction(txBytes);
    signatures.push(gasSignature.signature);
  } catch (error) {
    console.error('Failed to sign swap transaction with gas station', error);
    return noStoreJson({ error: 'Gas sponsorship failed' }, { status: 503 });
  }

  const stagedDigest = TransactionDataBuilder.getDigestFromBytes(txBytes);
  try {
    const result = await getSuiClient().executeTransactionBlock({
      transactionBlock: txBytes,
      signature: signatures,
      options: {
        showEffects: true,
        showBalanceChanges: true,
        showObjectChanges: true,
      },
    });

    if (result.effects?.status.status !== 'success') {
      return noStoreJson(
        { error: result.effects?.status.error || 'Swap failed on-chain' },
        { status: 409 },
      );
    }

    await clearSwapAuthorization(swapQuoteToken);
    return noStoreJson({
      status: 'confirmed',
      txDigest: result.digest || stagedDigest,
    });
  } catch (error) {
    console.error('Failed to execute swap transaction', error);
    return noStoreJson({ error: 'Swap execution failed' }, { status: 503 });
  }
}
