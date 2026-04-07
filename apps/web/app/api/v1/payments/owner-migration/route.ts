import { NextRequest } from 'next/server';
import { z } from 'zod';
import { Transaction } from '@mysten/sui/transactions';
import { noStoreJson, verifySameOrigin } from '@/lib/api';
import { getGasStationKeypair } from '@/lib/gas-station';
import { requestOwnerRecoveryAttestation } from '@/lib/nautilus';
import { prisma } from '@/lib/prisma';
import { getPrivyClient, verifyPrivyXAuth } from '@/lib/privy-auth';
import {
  buildPrivyRawSignAuthorizationRequest,
  listSuiWalletsForPrivyUser,
  signSuiTransaction,
} from '@/lib/privy-wallet';
import { getRedis } from '@/lib/rate-limit';
import { acquireRedisLock } from '@/lib/redis-lock';
import { deriveVaultAddress, getSuiClient } from '@/lib/sui';

const PACKAGE_ID = process.env.NEXT_PUBLIC_PACKAGE_ID ?? '';
const VAULT_REGISTRY_ID = process.env.NEXT_PUBLIC_VAULT_REGISTRY_ID ?? '';
const ENCLAVE_REGISTRY_ID = process.env.ENCLAVE_REGISTRY_ID ?? '';
const AUTHORIZATION_BUNDLE_TTL_SEC = 120;
const OWNER_MIGRATION_GAS_BUDGET_MIST = 50_000_000;

const RequestSchema = z.object({
  authorizationSignature: z.string().min(1).optional(),
});

const PendingOwnerMigrationAuthorizationBundleSchema = z.object({
  txBytesBase64: z.string().min(1),
  walletId: z.string().min(1),
  storedPublicKey: z.string().min(1),
  targetWalletId: z.string().min(1),
  targetWalletAddress: z.string().min(1),
  targetWalletPublicKey: z.string().min(1),
  vaultAddress: z.string().min(1),
});

type PendingOwnerMigrationAuthorizationBundle = z.infer<
  typeof PendingOwnerMigrationAuthorizationBundleSchema
>;

function getPendingOwnerMigrationAuthorizationKey(xUserId: string) {
  return `pending-owner-migration-auth:${xUserId}`;
}

async function stagePendingOwnerMigrationAuthorization(
  xUserId: string,
  payload: PendingOwnerMigrationAuthorizationBundle,
) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    throw new Error('Pending owner migration store unavailable');
  }

  await redis.set(
    getPendingOwnerMigrationAuthorizationKey(xUserId),
    JSON.stringify(payload),
    'EX',
    AUTHORIZATION_BUNDLE_TTL_SEC,
  );
}

async function loadPendingOwnerMigrationAuthorization(
  xUserId: string,
): Promise<PendingOwnerMigrationAuthorizationBundle | null> {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return null;
  }

  try {
    const raw = await redis.get(getPendingOwnerMigrationAuthorizationKey(xUserId));
    if (!raw) {
      return null;
    }

    const parsed = PendingOwnerMigrationAuthorizationBundleSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch (error) {
    console.warn('Failed to load pending owner migration authorization bundle', { xUserId, error });
    return null;
  }
}

async function clearPendingOwnerMigrationAuthorization(xUserId: string) {
  const redis = getRedis();
  if (redis.status !== 'ready') {
    return;
  }

  try {
    await redis.del(getPendingOwnerMigrationAuthorizationKey(xUserId));
  } catch (error) {
    console.warn('Failed to clear pending owner migration authorization bundle', { xUserId, error });
  }
}

function getVaultFields(objectResponse: Awaited<ReturnType<ReturnType<typeof getSuiClient>['getObject']>>) {
  const content = objectResponse.data?.content as { fields?: Record<string, unknown> } | undefined;
  return content?.fields ?? null;
}

export async function POST(req: NextRequest) {
  const sameOrigin = verifySameOrigin(req);
  if (!sameOrigin.ok) return sameOrigin.response;

  const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return noStoreJson({ error: 'Invalid request' }, { status: 400 });
  }

  const auth = await verifyPrivyXAuth(req);
  if (!auth.ok) return auth.response;

  const xUserId = auth.identity.xUserId;
  if (!xUserId) {
    return noStoreJson({ error: 'Invalid X user identifier' }, { status: 400 });
  }

  if (!PACKAGE_ID || !VAULT_REGISTRY_ID || !ENCLAVE_REGISTRY_ID) {
    return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
  }

  const migrationLock = await acquireRedisLock(`owner-migration:${xUserId}`, 60);
  if (migrationLock.status !== 'acquired') {
    if (migrationLock.status === 'busy') {
      return noStoreJson(
        { error: 'Owner migration already in progress. Check your wallet in a moment.' },
        { status: 409 },
      );
    }

    return noStoreJson(
      { error: 'Owner migration is temporarily unavailable. Please retry shortly.' },
      { status: 503 },
    );
  }

  try {
    const xUser = await prisma.xUser.findUnique({
      where: { xUserId },
      select: {
        xUserId: true,
        username: true,
        privyUserId: true,
        privyWalletId: true,
        suiAddress: true,
        suiPublicKey: true,
      },
    });

    if (
      !xUser?.privyUserId ||
      !xUser.privyWalletId ||
      !xUser.suiAddress ||
      !xUser.suiPublicKey
    ) {
      return noStoreJson(
        { error: 'No embedded wallet found. Please set up your wallet first.' },
        { status: 400 },
      );
    }

    if (xUser.privyUserId !== auth.identity.privyUserId) {
      return noStoreJson(
        { error: 'Wallet ownership could not be verified. Please set up your wallet first.' },
        { status: 403 },
      );
    }

    const privy = getPrivyClient();
    const client = getSuiClient();
    const vaultAddress = deriveVaultAddress(VAULT_REGISTRY_ID, BigInt(xUserId));

    const vaultObject = await client.getObject({
      id: vaultAddress,
      options: { showContent: true },
    });
    const vaultFields = getVaultFields(vaultObject);
    const currentOwnerAddress =
      vaultFields && typeof vaultFields.owner === 'string'
        ? vaultFields.owner
        : null;
    const recoveryCounter =
      vaultFields && vaultFields.recovery_counter != null
        ? String(vaultFields.recovery_counter)
        : '0';

    if (!currentOwnerAddress) {
      return noStoreJson({ error: 'Vault owner metadata is unavailable.' }, { status: 409 });
    }

    const wallets = await listSuiWalletsForPrivyUser(privy, xUser.privyUserId);
    const currentOwnerWallet =
      wallets.find((wallet) => wallet.suiAddress.toLowerCase() === currentOwnerAddress.toLowerCase()) ?? null;
    const candidateTargetWallets = wallets.filter(
      (wallet) => wallet.suiAddress.toLowerCase() !== currentOwnerAddress.toLowerCase() && wallet.suiPublicKey,
    );

    if (!currentOwnerWallet || candidateTargetWallets.length !== 1) {
      return noStoreJson(
        { error: 'Vault owner migration is unavailable for this account right now.' },
        { status: 409 },
      );
    }

    const targetWallet = candidateTargetWallets[0]!;

    const gasKeypair = getGasStationKeypair();
    if (!gasKeypair) {
      return noStoreJson({ error: 'Gas sponsorship is misconfigured' }, { status: 500 });
    }

    let txBytes: Uint8Array;
    let currentWalletId = currentOwnerWallet.privyWalletId;
    let currentWalletPublicKey = currentOwnerWallet.suiPublicKey ?? xUser.suiPublicKey;
    let targetWalletId = targetWallet.privyWalletId;
    let targetWalletAddress = targetWallet.suiAddress;
    let targetWalletPublicKey = targetWallet.suiPublicKey!;

    if (parsed.data.authorizationSignature) {
      const authorizationBundle = await loadPendingOwnerMigrationAuthorization(xUserId);
      if (!authorizationBundle) {
        return noStoreJson(
          { error: 'Authorization expired. Start the owner migration again.' },
          { status: 409 },
        );
      }

      await clearPendingOwnerMigrationAuthorization(xUserId);

      txBytes = Uint8Array.from(Buffer.from(authorizationBundle.txBytesBase64, 'base64'));
      currentWalletId = authorizationBundle.walletId;
      currentWalletPublicKey = authorizationBundle.storedPublicKey;
      targetWalletId = authorizationBundle.targetWalletId;
      targetWalletAddress = authorizationBundle.targetWalletAddress;
      targetWalletPublicKey = authorizationBundle.targetWalletPublicKey;
    } else {
      const ownerRecoveryAttestation = await requestOwnerRecoveryAttestation({
        xUserId,
        vaultId: vaultAddress,
        currentOwner: currentOwnerWallet.suiAddress,
        newOwner: targetWallet.suiAddress,
        recoveryCounter,
      });

      const tx = new Transaction();
      tx.setSender(currentOwnerWallet.suiAddress);
      tx.setGasOwner(gasKeypair.toSuiAddress());
      tx.setGasBudget(OWNER_MIGRATION_GAS_BUDGET_MIST);
      tx.moveCall({
        target: `${PACKAGE_ID}::x_vault::update_owner`,
        arguments: [
          tx.object(VAULT_REGISTRY_ID),
          tx.object(ENCLAVE_REGISTRY_ID),
          tx.object(vaultAddress),
          tx.pure.address(targetWallet.suiAddress),
          tx.pure.u64(ownerRecoveryAttestation.expiresAt),
          tx.pure.vector('u8', Array.from(ownerRecoveryAttestation.signature)),
          tx.object('0x6'),
        ],
      });

      try {
        txBytes = await tx.build({ client });
      } catch (error) {
        console.error('Failed to build owner migration transaction', error);
        return noStoreJson(
          { error: 'Failed to build owner migration transaction' },
          { status: 400 },
        );
      }

      try {
        const preflight = await client.dryRunTransactionBlock({
          transactionBlock: txBytes,
        });

        if (preflight.effects?.status.status !== 'success') {
          console.error('Owner migration preflight dry-run failed', {
            xUserId,
            vaultAddress,
            status: preflight.effects?.status,
          });
          return noStoreJson(
            { error: 'Owner migration is temporarily unavailable. Please retry shortly.' },
            { status: 503 },
          );
        }
      } catch (error) {
        console.error('Failed to preflight owner migration transaction', error);
        return noStoreJson(
          { error: 'Owner migration is temporarily unavailable. Please retry shortly.' },
          { status: 503 },
        );
      }

      try {
        await stagePendingOwnerMigrationAuthorization(xUserId, {
          txBytesBase64: Buffer.from(txBytes).toString('base64'),
          walletId: currentOwnerWallet.privyWalletId,
          storedPublicKey: currentOwnerWallet.suiPublicKey ?? xUser.suiPublicKey,
          targetWalletId: targetWallet.privyWalletId,
          targetWalletAddress: targetWallet.suiAddress,
          targetWalletPublicKey: targetWallet.suiPublicKey!,
          vaultAddress,
        });
      } catch (error) {
        console.error('Failed to stage owner migration authorization request', error);
        return noStoreJson(
          { error: 'Owner migration is temporarily unavailable. Please retry shortly.' },
          { status: 503 },
        );
      }

      try {
        const authorizationRequest = buildPrivyRawSignAuthorizationRequest(
          currentOwnerWallet.privyWalletId,
          txBytes,
        );
        return noStoreJson({
          status: 'authorization_required',
          authorizationRequest,
        });
      } catch (error) {
        console.error('Failed to build Privy owner migration authorization request', error);
        return noStoreJson({ error: 'Server configuration error' }, { status: 500 });
      }
    }

    let senderSignature: string;
    try {
      senderSignature = await signSuiTransaction(
        privy,
        currentWalletId,
        currentWalletPublicKey,
        txBytes,
        { signatures: [parsed.data.authorizationSignature!] },
      );
    } catch (error) {
      console.error('Failed to sign owner migration transaction', error);
      return noStoreJson({ error: 'Failed to sign transaction' }, { status: 500 });
    }

    const gasSignatureResult = await gasKeypair.signTransaction(txBytes);

    let txDigest: string;
    try {
      const result = await client.executeTransactionBlock({
        transactionBlock: txBytes,
        signature: [senderSignature, gasSignatureResult.signature],
        options: { showEffects: true },
      });

      if (result.effects?.status.status !== 'success') {
        console.error('Owner migration transaction failed on-chain', {
          xUserId,
          vaultAddress,
          txDigest: result.digest,
          status: result.effects?.status,
        });
        return noStoreJson(
          { error: 'Owner migration failed on-chain. Please try again.' },
          { status: 409 },
        );
      }

      txDigest = result.digest;
    } catch (error) {
      console.error('Failed to execute owner migration transaction', error);
      return noStoreJson(
        { error: 'Owner migration execution did not complete. Please try again.' },
        { status: 500 },
      );
    }

    try {
      await prisma.xUser.update({
        where: { xUserId },
        data: {
          privyWalletId: targetWalletId,
          suiAddress: targetWalletAddress,
          suiPublicKey: targetWalletPublicKey,
        },
      });
    } catch (error) {
      console.error('Owner migration succeeded on-chain but failed to update wallet binding', {
        xUserId,
        vaultAddress,
        txDigest,
        targetWalletAddress,
        error,
      });
      return noStoreJson(
        { error: 'Vault owner updated on-chain, but wallet binding refresh failed. Contact support.' },
        { status: 500 },
      );
    }

    const updatedVaultObject = await client.getObject({
      id: vaultAddress,
      options: { showContent: true },
    });
    const updatedFields = getVaultFields(updatedVaultObject);
    const updatedOwnerAddress =
      updatedFields && typeof updatedFields.owner === 'string'
        ? updatedFields.owner
        : targetWalletAddress;

    return noStoreJson({
      status: 'migrated',
      txDigest,
      vaultAddress,
      ownerAddress: updatedOwnerAddress,
    });
  } finally {
    try {
      await migrationLock.release();
    } catch {
      // Ignore lock release failures for this one-off route.
    }
  }
}
