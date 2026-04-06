import { messageWithIntent, toSerializedSignature } from '@mysten/sui/cryptography';
import { fromBase58, fromHex, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { publicKeyFromRawBytes, publicKeyFromSuiBytes } from '@mysten/sui/verify';
import type { PrivyClient, Wallet } from '@privy-io/node';
import type { PrivyAuthorizationRequest } from '@/lib/privy-authorization';
import { prisma } from '@/lib/prisma';

export function decodeStoredSuiPublicKey(publicKey: string, address?: string) {
  const normalizedHex = publicKey.startsWith('0x') ? publicKey.slice(2) : publicKey;

  if (normalizedHex.length > 0 && /^[0-9a-fA-F]+$/.test(normalizedHex)) {
    const bytes = fromHex(normalizedHex);

    if (bytes.length === 33) {
      return publicKeyFromSuiBytes(bytes, address ? { address } : {});
    }

    if (bytes.length === 32) {
      return publicKeyFromRawBytes('ED25519', bytes, address ? { address } : {});
    }
  }

  const rawBytes = fromBase58(publicKey);
  return publicKeyFromRawBytes('ED25519', rawBytes, address ? { address } : {});
}

interface PrivyRawSignParams {
  bytes: string;
  encoding: 'hex';
  hash_function: 'blake2b256';
}

interface PrivySigningAuthorization {
  signatures?: string | string[];
  userJwts?: string | string[];
}

export interface PrivySuiWallet {
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string | null;
}

export class WalletBindingConflictError extends Error {
  constructor(message = 'Stored wallet binding conflicts with Privy wallet data.') {
    super(message);
    this.name = 'WalletBindingConflictError';
  }
}

export function isWalletBindingConflictError(
  error: unknown,
): error is WalletBindingConflictError {
  return error instanceof WalletBindingConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'WalletBindingConflictError');
}

function buildRawSignParams(txBytes: Uint8Array): PrivyRawSignParams {
  const intentMessage = messageWithIntent('TransactionData', txBytes);

  return {
    bytes: Buffer.from(intentMessage).toString('hex'),
    encoding: 'hex',
    hash_function: 'blake2b256',
  };
}

function normalizeAuthorizationValues(values?: string | string[]): string[] {
  if (!values) {
    return [];
  }

  const candidates = Array.isArray(values) ? values : [values];
  return [...new Set(candidates.filter((value) => value.length > 0))];
}

function getPrivyRawSignUrl(walletId: string): string {
  const baseUrl = process.env.PRIVY_API_BASE_URL ?? 'https://api.privy.io';
  return new URL(`/v1/wallets/${walletId}/raw_sign`, baseUrl).toString();
}

function normalizeWalletAddress(address: string): string {
  try {
    return normalizeSuiAddress(address);
  } catch {
    throw new Error('Privy wallet created with an invalid Sui address');
  }
}

function assertValidWalletAddress(address: string) {
  if (!isValidSuiAddress(address)) {
    throw new Error('Privy wallet created with an invalid Sui address');
  }
}

function assertWalletMatchesStoredBinding(params: {
  existingWalletId: string | null;
  existingSuiAddress: string | null;
  existingSuiPublicKey: string | null;
  createdWalletId: string;
  createdSuiAddress: string;
  createdSuiPublicKey: string;
}) {
  const {
    existingWalletId,
    existingSuiAddress,
    existingSuiPublicKey,
    createdWalletId,
    createdSuiAddress,
    createdSuiPublicKey,
  } = params;

  if (existingWalletId && existingWalletId !== createdWalletId) {
    throw new WalletBindingConflictError();
  }

  if (existingSuiAddress) {
    const normalizedStoredAddress = normalizeWalletAddress(existingSuiAddress);
    if (normalizedStoredAddress !== createdSuiAddress) {
      throw new WalletBindingConflictError();
    }
  }

  if (existingSuiPublicKey && existingSuiPublicKey !== createdSuiPublicKey) {
    throw new WalletBindingConflictError();
  }
}

function isCompleteStoredWalletBinding(existing: {
  privyWalletId: string | null;
  suiAddress: string | null;
  suiPublicKey: string | null;
} | null | undefined): existing is {
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
} {
  return Boolean(
    existing?.privyWalletId &&
      existing.suiAddress &&
      existing.suiPublicKey,
  );
}

function selectReconciledWallet(params: {
  existingWalletId: string | null;
  existingSuiAddress: string | null;
  wallets: PrivySuiWallet[];
}): PrivySuiWallet | null {
  const { existingWalletId, existingSuiAddress, wallets } = params;

  if (existingWalletId) {
    const byWalletId = wallets.find((wallet) => wallet.privyWalletId === existingWalletId);
    if (byWalletId) {
      return byWalletId;
    }
  }

  if (existingSuiAddress) {
    const normalizedStoredAddress = normalizeWalletAddress(existingSuiAddress);
    const byAddress = wallets.find((wallet) => wallet.suiAddress === normalizedStoredAddress);
    if (byAddress) {
      return byAddress;
    }
  }

  if (wallets.length === 1) {
    return wallets[0] ?? null;
  }

  return null;
}

function assertWalletHasPublicKey(wallet: PrivySuiWallet): asserts wallet is PrivySuiWallet & {
  suiPublicKey: string;
} {
  if (!wallet.suiPublicKey) {
    throw new Error('Privy wallet created without public key');
  }
}

export function buildPrivyRawSignAuthorizationRequest(
  walletId: string,
  txBytes: Uint8Array,
): PrivyAuthorizationRequest {
  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    throw new Error('Missing Privy configuration');
  }

  return {
    version: 1,
    method: 'POST',
    url: getPrivyRawSignUrl(walletId),
    body: {
      params: buildRawSignParams(txBytes),
    } as unknown as PrivyAuthorizationRequest['body'],
    headers: {
      'privy-app-id': appId,
    },
  };
}

export async function listSuiWalletsForPrivyUser(
  privy: PrivyClient,
  privyUserId: string,
): Promise<PrivySuiWallet[]> {
  const wallets: PrivySuiWallet[] = [];

  for await (const wallet of privy.wallets().list({
    user_id: privyUserId,
    chain_type: 'sui',
  })) {
    const normalizedAddress = normalizeSuiAddress(wallet.address);
    wallets.push({
      privyWalletId: wallet.id,
      suiAddress: normalizedAddress,
      suiPublicKey: wallet.public_key ?? null,
    });
  }

  return wallets;
}

export async function findSuiWalletForPrivyUserByAddress(
  privy: PrivyClient,
  privyUserId: string,
  suiAddress: string,
): Promise<PrivySuiWallet | null> {
  const normalizedAddress = normalizeSuiAddress(suiAddress);
  const wallets = await listSuiWalletsForPrivyUser(privy, privyUserId);

  return wallets.find((wallet) => wallet.suiAddress === normalizedAddress) ?? null;
}

/**
 * Get or create a Sui embedded wallet for the given X user.
 * On first call it creates the wallet via Privy, stores the details in the DB,
 * and returns the wallet info. On subsequent calls it returns the cached data.
 *
 * Callers are expected to serialize concurrent setup attempts per X user
 * (for example with the Redis lock in `wallet/setup/route.ts`). Safety across
 * retries relies on Privy's `idempotency_key` guarantee plus the final
 * Prisma upsert.
 */
export async function getOrCreateSuiWallet(
  privy: PrivyClient,
  privyUserId: string,
  xUserId: string,
): Promise<{
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
}> {
  // 1. Check if the user already has a wallet in the DB
  const existing = await prisma.xUser.findUnique({
    where: { xUserId },
    select: { privyWalletId: true, suiAddress: true, suiPublicKey: true },
  });

  if (isCompleteStoredWalletBinding(existing)) {
    return {
      privyWalletId: existing.privyWalletId,
      suiAddress: existing.suiAddress,
      suiPublicKey: existing.suiPublicKey,
    };
  }

  const existingWallets = await listSuiWalletsForPrivyUser(privy, privyUserId);
  const reconciledWallet = selectReconciledWallet({
    existingWalletId: existing?.privyWalletId ?? null,
    existingSuiAddress: existing?.suiAddress ?? null,
    wallets: existingWallets,
  });

  if (reconciledWallet) {
    assertWalletHasPublicKey(reconciledWallet);
    assertWalletMatchesStoredBinding({
      existingWalletId: existing?.privyWalletId ?? null,
      existingSuiAddress: existing?.suiAddress ?? null,
      existingSuiPublicKey: existing?.suiPublicKey ?? null,
      createdWalletId: reconciledWallet.privyWalletId,
      createdSuiAddress: reconciledWallet.suiAddress,
      createdSuiPublicKey: reconciledWallet.suiPublicKey,
    });

    try {
      decodeStoredSuiPublicKey(reconciledWallet.suiPublicKey, reconciledWallet.suiAddress);
    } catch {
      throw new Error('Privy wallet created with an invalid Sui public key');
    }

    await prisma.xUser.upsert({
      where: { xUserId },
      update: {
        privyUserId,
        privyWalletId: reconciledWallet.privyWalletId,
        suiAddress: reconciledWallet.suiAddress,
        suiPublicKey: reconciledWallet.suiPublicKey,
      },
      create: {
        xUserId,
        username: xUserId,
        privyUserId,
        privyWalletId: reconciledWallet.privyWalletId,
        suiAddress: reconciledWallet.suiAddress,
        suiPublicKey: reconciledWallet.suiPublicKey,
      },
    });

    return {
      privyWalletId: reconciledWallet.privyWalletId,
      suiAddress: reconciledWallet.suiAddress,
      suiPublicKey: reconciledWallet.suiPublicKey,
    };
  }

  // 2. Create a new Sui wallet via Privy
  const wallet: Wallet = await privy.wallets().create({
    chain_type: 'sui',
    owner: { user_id: privyUserId },
    idempotency_key: `sui-wallet-${xUserId}`,
  });

  const walletAddress = normalizeWalletAddress(wallet.address);
  assertValidWalletAddress(walletAddress);

  if (!wallet.public_key) {
    throw new Error('Privy wallet created without public key');
  }

  assertWalletMatchesStoredBinding({
    existingWalletId: existing?.privyWalletId ?? null,
    existingSuiAddress: existing?.suiAddress ?? null,
    existingSuiPublicKey: existing?.suiPublicKey ?? null,
    createdWalletId: wallet.id,
    createdSuiAddress: walletAddress,
    createdSuiPublicKey: wallet.public_key,
  });

  try {
    decodeStoredSuiPublicKey(wallet.public_key, walletAddress);
  } catch {
    throw new Error('Privy wallet created with an invalid Sui public key');
  }

  // 3. Persist wallet details to XUser
  await prisma.xUser.upsert({
    where: { xUserId },
    update: {
      privyUserId,
      privyWalletId: wallet.id,
      suiAddress: walletAddress,
      suiPublicKey: wallet.public_key,
    },
    create: {
      xUserId,
      username: xUserId,
      privyUserId,
      privyWalletId: wallet.id,
      suiAddress: walletAddress,
      suiPublicKey: wallet.public_key,
    },
  });

  return {
    privyWalletId: wallet.id,
    suiAddress: walletAddress,
    suiPublicKey: wallet.public_key,
  };
}

/**
 * Sign a Sui transaction using a Privy embedded wallet.
 *
 * @param privy - Privy client instance
 * @param walletId - Privy wallet ID
 * @param storedPublicKey - Stored Sui public key from Privy
 * @param txBytes - Raw transaction bytes from Transaction.build()
 * @returns Serialized signature string ready for executeTransactionBlock
 */
export async function signSuiTransaction(
  privy: PrivyClient,
  walletId: string,
  storedPublicKey: string,
  txBytes: Uint8Array,
  authorization?: PrivySigningAuthorization,
): Promise<string> {
  const rawSignParams = buildRawSignParams(txBytes);
  const authorizationJwts = normalizeAuthorizationValues(authorization?.userJwts);
  const authorizationSignatures = normalizeAuthorizationValues(authorization?.signatures);

  let signResult: Awaited<ReturnType<ReturnType<PrivyClient['wallets']>['rawSign']>> | null = null;
  let lastError: unknown = null;

  const buildAuthorizationContext = (userJwt?: string) => {
    if (!userJwt && authorizationSignatures.length === 0) {
      return undefined;
    }

    return {
      ...(userJwt ? { user_jwts: [userJwt] } : {}),
      ...(authorizationSignatures.length > 0 ? { signatures: authorizationSignatures } : {}),
    };
  };

  if (authorizationJwts.length === 0) {
    const authorizationContext = buildAuthorizationContext();
    signResult = await privy.wallets().rawSign(walletId, {
      params: rawSignParams,
      ...(authorizationContext ? { authorization_context: authorizationContext } : {}),
    });
  } else {
    for (const jwt of authorizationJwts) {
      try {
        const authorizationContext = buildAuthorizationContext(jwt);
        signResult = await privy.wallets().rawSign(walletId, {
          params: rawSignParams,
          ...(authorizationContext ? { authorization_context: authorizationContext } : {}),
        });
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
      }
    }

    if (!signResult) {
      throw lastError instanceof Error ? lastError : new Error('Privy transaction signing failed');
    }
  }

  // 4. Convert hex signature to Uint8Array
  const sigHex = signResult.signature.startsWith('0x')
    ? signResult.signature.slice(2)
    : signResult.signature;
  const rawSignature = new Uint8Array(Buffer.from(sigHex, 'hex'));

  // 5. Reconstruct public key object
  const publicKey = decodeStoredSuiPublicKey(storedPublicKey);

  // 6. Create serialized signature (scheme flag + signature + public key)
  const serializedSignature = toSerializedSignature({
    signature: rawSignature,
    signatureScheme: 'ED25519',
    publicKey,
  });

  if (!(await publicKey.verifyTransaction(txBytes, serializedSignature))) {
    throw new Error('Privy signature verification failed locally');
  }

  return serializedSignature;
}
