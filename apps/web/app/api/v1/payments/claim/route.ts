import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Transaction } from '@mysten/sui/transactions';
import { getClientIp, noStoreJson, verifySameOrigin } from '@/lib/api';
import { getGasStationKeypair } from '@/lib/gas-station';
import { requestAttestation } from '@/lib/nautilus';
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
import { acquireRedisLock } from '@/lib/redis-lock';
import { deriveVaultAddress, getSuiClient } from '@/lib/sui';
import { parseXUserId } from '@/lib/twitter';

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? '';
const VAULT_REGISTRY_ID = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID ?? '';
const ENCLAVE_REGISTRY_ID = process.env.ENCLAVE_REGISTRY_ID ?? '';
const MAX_CLAIM_COIN_OBJECTS = 200;
const MAX_CLAIM_COIN_PAGES = 20;
const AUTHORIZATION_BUNDLE_TTL_SEC = 120;

const RequestSchema = z.object({
  authorizationSignature: z.string().min(1).optional(),
});

const PendingClaimAuthorizationBundleSchema = z.object({
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
});

type PendingClaimAuthorizationBundle = z.infer<typeof PendingClaimAuthorizationBundleSchema>;

class VaultCoinLimitError extends Error {}
class VaultCoinPageLimitError extends Error {}

function getPendingClaimAuthorizationKey(xUserId: string) {
  return `pending-claim-auth:${xUserId}`;
}

async function stagePendingClaimAuthorization(
  xUserId: string,
  txBytes: Uint8Array,
  walletId: string,
  storedPublicKey: string,
) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Pending claim store unavailable');
  }

  const payload: PendingClaimAuthorizationBundle = {
    txBytesBase64: Buffer.from(txBytes).toString('base64'),
    walletId,
    storedPublicKey,
  };

  await redis.set(
    getPendingClaimAuthorizationKey(xUserId),
    JSON.stringify(payload),
    'EX',
    AUTHORIZATION_BUNDLE_TTL_SEC,
  );
}

async function loadPendingClaimAuthorization(
  xUserId: string,
): Promise<PendingClaimAuthorizationBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingClaimAuthorizationKey(xUserId));
    if (!raw) {
      return null;
    }

    const parsed = PendingClaimAuthorizationBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending claim authorization bundle', { xUserId, error });
    return null;
  }
}

async function clearPendingClaimAuthorization(xUserId: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingClaimAuthorizationKey(xUserId));
  } catch (error) {
    console.warn('Failed to clear pending claim authorization bundle', { xUserId, error });
  }
}

async function getAllVaultCoins(vaultAddress: string) {
  const client = getSuiClient();
  const coins = [];
  let cursor: string | null | undefined = null;
  let pageCount = 0;

  do {
    pageCount += 1;
    if (pageCount > MAX_CLAIM_COIN_PAGES) {
      throw new VaultCoinPageLimitError(
        'Vault contains too many assets to scan in one claim right now.',
      );
    }

    const page = await client.getOwnedObjects({
      owner: vaultAddress,
      cursor,
      options: { showType: true },
    });

    coins.push(
      ...page.data.filter((obj) => {
        const objectType = obj.data?.type;
        return (
          Boolean(obj.data?.objectId) &&
          typeof objectType === 'string' &&
          objectType.startsWith('0x2::coin::Coin<') &&
          objectType.endsWith('>')
        );
      }),
    );
    if (coins.length > MAX_CLAIM_COIN_OBJECTS) {
      throw new VaultCoinLimitError(
        'Vault contains too many deposits to claim in one transaction right now.',
      );
    }
    cursor = page.nextCursor;

    if (!page.hasNextPage) {
      break;
    }
  } while (cursor);

  return coins;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return noStoreJson({ error: 'Invalid input' }, { status: 400 });
  }

  const { authorizationSignature } = parsed.data;

  // 1. Rate limit
  const ip = getClientIp(req);
  const rl = await rateLimit(`claim:${ip}`, 60, 5);
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

  // 3. Check config
  if (!PACKAGE_ID || !VAULT_REGISTRY_ID || !ENCLAVE_REGISTRY_ID) {
    return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
  }

  const claimLock = await acquireRedisLock(`claim:${xUserId}`, 60);
  if (claimLock.status !== 'acquired') {
    if (claimLock.status === 'busy') {
      return noStoreJson(
        { error: 'Claim already in progress. Check your wallet in a moment.' },
        { status: 409 },
      );
    }

    return noStoreJson(
      { error: 'Claims are temporarily unavailable. Please retry shortly.' },
      { status: 503 },
    );
  }

  try {
    // 4. Get user's embedded wallet
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

    // 5. Request Nautilus attestation
    let attestation;
    try {
      attestation = await requestAttestation({
        xUserId,
        suiAddress: xUser.suiAddress,
      });
    } catch (error) {
      console.error('Attestation request failed', error);
      return noStoreJson(
        { error: 'Failed to obtain attestation. Please try again.' },
        { status: 502 },
      );
    }

    // 6. Fetch coin objects at the vault's derived address
    const client = getSuiClient();
    const vaultAddress = deriveVaultAddress(VAULT_REGISTRY_ID, BigInt(xUserId));

    let coins;
    try {
      coins = await getAllVaultCoins(vaultAddress);
    } catch (error) {
      if (error instanceof VaultCoinLimitError) {
        return noStoreJson({ error: error.message }, { status: 409 });
      }
      if (error instanceof VaultCoinPageLimitError) {
        return noStoreJson({ error: error.message }, { status: 409 });
      }
      console.error('Failed to fetch vault coins', error);
      return noStoreJson({ error: 'Failed to query vault status' }, { status: 500 });
    }

    if (coins.length === 0) {
      return noStoreJson({ error: 'No funds to claim in the vault' }, { status: 400 });
    }

    // 7. Build claim PTB or load the staged authorization bundle
    let gasKeypair: ReturnType<typeof getGasStationKeypair>;
    try {
      gasKeypair = getGasStationKeypair();
    } catch (error) {
      console.error('Failed to initialize gas station keypair', error);
      return noStoreJson({ error: 'Gas sponsorship is misconfigured' }, { status: 500 });
    }
    let txBytes: Uint8Array;
    let walletId = xUser.privyWalletId;
    let storedPublicKey = xUser.suiPublicKey;

    if (authorizationSignature) {
      const authorizationBundle = await loadPendingClaimAuthorization(auth.identity.xUserId);
      if (!authorizationBundle) {
        return noStoreJson(
          { error: 'Authorization expired. Please start the claim again.' },
          { status: 409 },
        );
      }

      await clearPendingClaimAuthorization(auth.identity.xUserId);

      txBytes = Uint8Array.from(Buffer.from(authorizationBundle.txBytesBase64, 'base64'));
      walletId = authorizationBundle.walletId;
      storedPublicKey = authorizationBundle.storedPublicKey;
    } else {
      const tx = new Transaction();
      tx.setSender(xUser.suiAddress);

      if (gasKeypair) {
        tx.setGasOwner(gasKeypair.toSuiAddress());
      }

      const [vault] = tx.moveCall({
        target: `${PACKAGE_ID}::x_vault::claim_vault`,
        arguments: [
          tx.object(VAULT_REGISTRY_ID),
          tx.object(ENCLAVE_REGISTRY_ID),
          tx.pure.u64(attestation.xUserId),
          tx.pure.address(attestation.suiAddress),
          tx.pure.u64(attestation.nonce),
          tx.pure.u64(attestation.expiresAt),
          tx.pure.vector('u8', Array.from(attestation.signature)),
          tx.object('0x6'),
        ],
      });

      const claimableCoins = [];
      const coinTypes = new Set<string>();
      for (const coinObj of coins) {
        const objectId = coinObj.data?.objectId;
        const version = coinObj.data?.version;
        const digest = coinObj.data?.digest;
        const objectType = coinObj.data?.type;
        if (!objectId || !version || !digest || !objectType) continue;

        const coinTypeMatch = objectType.match(/^0x2::coin::Coin<(.+)>$/);
        if (!coinTypeMatch) continue;
        const innerCoinType = coinTypeMatch[1];
        if (!innerCoinType) continue;

        claimableCoins.push({
          objectId,
          version: typeof version === 'string' ? version : String(version),
          digest,
          coinType: innerCoinType,
        });
        coinTypes.add(innerCoinType);
      }

      if (claimableCoins.length === 0) {
        return noStoreJson({ error: 'No claimable funds found in the vault' }, { status: 400 });
      }

      for (const claimableCoin of claimableCoins) {
        tx.moveCall({
          target: `${PACKAGE_ID}::x_vault::sweep_coin_to_vault`,
          typeArguments: [claimableCoin.coinType],
          arguments: [
            tx.object(VAULT_REGISTRY_ID),
            vault,
            tx.receivingRef({
              objectId: claimableCoin.objectId,
              version: claimableCoin.version,
              digest: claimableCoin.digest,
            }),
          ],
        });
      }

      for (const innerCoinType of coinTypes) {
        const [withdrawn] = tx.moveCall({
          target: `${PACKAGE_ID}::x_vault::withdraw_all`,
          typeArguments: [innerCoinType],
          arguments: [
            tx.object(VAULT_REGISTRY_ID),
            vault,
          ],
        });
        tx.transferObjects([withdrawn], xUser.suiAddress);
      }

      tx.moveCall({
        target: `${PACKAGE_ID}::x_vault::transfer_vault`,
        arguments: [vault],
      });

      try {
        txBytes = await tx.build({ client });
      } catch (error) {
        console.error('Failed to build claim transaction', error);
        return noStoreJson(
          { error: 'Failed to build claim transaction' },
          { status: 400 },
        );
      }

      try {
        await stagePendingClaimAuthorization(
          auth.identity.xUserId,
          txBytes,
          xUser.privyWalletId,
          xUser.suiPublicKey,
        );
      } catch (error) {
        console.error('Failed to stage claim authorization request', error);
        return noStoreJson(
          { error: 'Claims are temporarily unavailable. Please retry shortly.' },
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
        console.error('Failed to build Privy claim authorization request', error);
        return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
      }
    }

    let senderSignature: string;
    try {
      const privy = getPrivyClient();
      senderSignature = await signSuiTransaction(
        privy,
        walletId,
        storedPublicKey,
        txBytes,
        { signatures: [authorizationSignature] },
      );
    } catch (error) {
      console.error('Failed to sign claim transaction', error);
      return noStoreJson({ error: 'Failed to sign transaction' }, { status: 500 });
    }

    const signatures: string[] = [senderSignature];
    if (gasKeypair) {
      try {
        const gasSignatureResult = await gasKeypair.signTransaction(txBytes);
        signatures.push(gasSignatureResult.signature);
      } catch (error) {
        console.error('Failed to sign gas-sponsored claim transaction', error);
        return noStoreJson({ error: 'Gas sponsorship failed' }, { status: 503 });
      }
    }

    // 9. Execute
    let txDigest: string;
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: signatures,
        options: { showEffects: true },
      });

      if (result.effects?.status.status !== 'success') {
        return noStoreJson(
          { error: 'Claim transaction failed on-chain. Please try again.' },
          { status: 409 },
        );
      }

      txDigest = result.digest;
    } catch (error) {
      console.error('Failed to execute claim transaction', error);
      return noStoreJson(
        { error: 'Claim execution did not complete. Please try again.' },
        { status: 500 },
      );
    }

    return noStoreJson({
      status: 'claimed',
      txDigest,
      vaultAddress,
      owner: xUser.suiAddress,
    });
  } finally {
    await claimLock.release();
  }
}
