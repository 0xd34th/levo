import { messageWithIntent, toSerializedSignature } from '@mysten/sui/cryptography';
import { fromBase58, isValidSuiAddress, normalizeSuiAddress } from '@mysten/sui/utils';
import { publicKeyFromRawBytes } from '@mysten/sui/verify';
import type { PrivyClient, Wallet } from '@privy-io/node';
import { prisma } from '@/lib/prisma';

/**
 * Get or create a Sui embedded wallet for the given X user.
 * On first call it creates the wallet via Privy, stores the details in the DB,
 * and returns the wallet info. On subsequent calls it returns the cached data.
 *
 * Callers are expected to serialize concurrent setup attempts per X user
 * (for example with the Redis lock in `wallet/setup/route.ts`). Safety across
 * retries relies on Privy's `idempotency_key` guarantee plus the final Prisma
 * upsert.
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

  if (existing?.privyWalletId && existing.suiAddress && existing.suiPublicKey) {
    return {
      privyWalletId: existing.privyWalletId,
      suiAddress: existing.suiAddress,
      suiPublicKey: existing.suiPublicKey,
    };
  }

  // 2. Create a new Sui wallet via Privy
  const wallet: Wallet = await privy.wallets().create({
    chain_type: 'sui',
    owner: { user_id: privyUserId },
    idempotency_key: `sui-wallet-${xUserId}`,
  });

  if (!wallet.public_key) {
    throw new Error('Privy wallet created without public key');
  }

  let walletAddress: string;
  try {
    walletAddress = normalizeSuiAddress(wallet.address);
  } catch {
    throw new Error('Privy wallet created with an invalid Sui address');
  }

  if (!isValidSuiAddress(walletAddress)) {
    throw new Error('Privy wallet created with an invalid Sui address');
  }

  const publicKeyBytes = fromBase58(wallet.public_key);
  if (publicKeyBytes.length !== 32) {
    throw new Error('Privy wallet created with an invalid Sui public key');
  }

  const derivedPublicKey = publicKeyFromRawBytes('ED25519', publicKeyBytes);
  if (normalizeSuiAddress(derivedPublicKey.toSuiAddress()) !== walletAddress) {
    throw new Error('Privy wallet public key does not match wallet address');
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
 * @param publicKeyBase58 - Base58-encoded public key
 * @param txBytes - Raw transaction bytes from Transaction.build()
 * @returns Serialized signature string ready for executeTransactionBlock
 */
export async function signSuiTransaction(
  privy: PrivyClient,
  walletId: string,
  publicKeyBase58: string,
  txBytes: Uint8Array,
): Promise<string> {
  // 1. Create intent message (Sui requirement)
  const intentMessage = messageWithIntent('TransactionData', txBytes);

  // 2. Convert to hex for Privy rawSign
  const hexBytes = Buffer.from(intentMessage).toString('hex');

  // 3. Sign via Privy (blake2b256 hash + Ed25519 sign)
  const signResult = await privy.wallets().rawSign(walletId, {
    params: {
      bytes: hexBytes,
      encoding: 'hex',
      hash_function: 'blake2b256',
    },
  });

  // 4. Convert hex signature to Uint8Array
  const sigHex = signResult.signature.startsWith('0x')
    ? signResult.signature.slice(2)
    : signResult.signature;
  const rawSignature = new Uint8Array(Buffer.from(sigHex, 'hex'));

  // 5. Reconstruct public key object
  const publicKey = publicKeyFromRawBytes('ED25519', fromBase58(publicKeyBase58));

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
