import { normalizeSuiAddress } from '@mysten/sui/utils';
import type { PrivyClient } from '@privy-io/node';
import { decodeStoredSuiPublicKey, listSuiWalletsForPrivyUser } from '@/lib/privy-wallet';
import { prisma } from '@/lib/prisma';
import { isTrustedProfilePictureUrl } from '@/lib/transaction-history';

export interface RecipientWalletInput {
  xUserId: string;
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
}

export interface RecipientWalletBinding extends RecipientWalletInput {
  privyUserId: string;
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
}

export class RecipientWalletConflictError extends Error {
  constructor(message = 'Recipient wallet binding is incomplete or ambiguous.') {
    super(message);
    this.name = 'RecipientWalletConflictError';
  }
}

export function isRecipientWalletConflictError(
  error: unknown,
): error is RecipientWalletConflictError {
  return error instanceof RecipientWalletConflictError ||
    (typeof error === 'object' &&
      error !== null &&
      'name' in error &&
      (error as { name?: string }).name === 'RecipientWalletConflictError');
}

type StoredRecipientRow = {
  username: string;
  profilePicture: string | null;
  isBlueVerified: boolean;
  privyUserId: string | null;
  privyWalletId: string | null;
  suiAddress: string | null;
  suiPublicKey: string | null;
};

function sanitizeProfilePicture(profilePicture: string | null): string | null {
  return profilePicture && isTrustedProfilePictureUrl(profilePicture)
    ? profilePicture
    : null;
}

function isCompleteStoredBinding(existing: StoredRecipientRow | null): existing is StoredRecipientRow & {
  privyUserId: string;
  privyWalletId: string;
  suiAddress: string;
  suiPublicKey: string;
} {
  return Boolean(
    existing?.privyUserId &&
      existing.privyWalletId &&
      existing.suiAddress &&
      existing.suiPublicKey,
  );
}

function isPrivyNotFoundError(error: unknown) {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const candidate = error as { status?: number; code?: string; name?: string };
  return candidate.status === 404 ||
    candidate.code === 'not_found' ||
    candidate.name === 'NotFoundError';
}

function assertValidStoredPublicKey(publicKey: string) {
  try {
    decodeStoredSuiPublicKey(publicKey);
  } catch {
    throw new RecipientWalletConflictError('Recipient wallet binding contains an invalid Sui public key.');
  }
}

function pickCanonicalSuiWallet(params: {
  existing: StoredRecipientRow | null;
  wallets: Awaited<ReturnType<typeof listSuiWalletsForPrivyUser>>;
}) {
  const { existing, wallets } = params;

  if (existing?.privyWalletId) {
    const matchedById = wallets.find((wallet) => wallet.privyWalletId === existing.privyWalletId);
    if (matchedById) {
      return matchedById;
    }
  }

  if (existing?.suiAddress) {
    const normalizedStoredAddress = normalizeSuiAddress(existing.suiAddress);
    const matchedByAddress = wallets.find((wallet) => wallet.suiAddress === normalizedStoredAddress);
    if (matchedByAddress) {
      return matchedByAddress;
    }
  }

  if (wallets.length === 1) {
    return wallets[0] ?? null;
  }

  if (wallets.length === 0) {
    return null;
  }

  throw new RecipientWalletConflictError(
    'Recipient has multiple Sui wallets and no canonical binding is stored.',
  );
}

async function upsertRecipientBinding(
  input: RecipientWalletInput,
  binding: {
    privyUserId: string;
    privyWalletId: string;
    suiAddress: string;
    suiPublicKey: string;
  },
) {
  const sanitizedProfilePicture = sanitizeProfilePicture(input.profilePicture);

  await prisma.xUser.upsert({
    where: { xUserId: input.xUserId },
    update: {
      username: input.username,
      profilePicture: sanitizedProfilePicture,
      isBlueVerified: input.isBlueVerified,
      privyUserId: binding.privyUserId,
      privyWalletId: binding.privyWalletId,
      suiAddress: binding.suiAddress,
      suiPublicKey: binding.suiPublicKey,
    },
    create: {
      xUserId: input.xUserId,
      username: input.username,
      profilePicture: sanitizedProfilePicture,
      isBlueVerified: input.isBlueVerified,
      privyUserId: binding.privyUserId,
      privyWalletId: binding.privyWalletId,
      suiAddress: binding.suiAddress,
      suiPublicKey: binding.suiPublicKey,
    },
  });

  return {
    ...input,
    profilePicture: sanitizedProfilePicture,
    ...binding,
  };
}

export async function ensureRecipientWallet(
  privy: PrivyClient,
  input: RecipientWalletInput,
): Promise<RecipientWalletBinding> {
  const existing = await prisma.xUser.findUnique({
    where: { xUserId: input.xUserId },
    select: {
      username: true,
      profilePicture: true,
      isBlueVerified: true,
      privyUserId: true,
      privyWalletId: true,
      suiAddress: true,
      suiPublicKey: true,
    },
  });

  if (isCompleteStoredBinding(existing)) {
    assertValidStoredPublicKey(existing.suiPublicKey);

    return upsertRecipientBinding(input, {
      privyUserId: existing.privyUserId,
      privyWalletId: existing.privyWalletId,
      suiAddress: normalizeSuiAddress(existing.suiAddress),
      suiPublicKey: existing.suiPublicKey,
    });
  }

  let privyUserId = existing?.privyUserId ?? null;

  if (!privyUserId) {
    try {
      const existingPrivyUser = await privy.users().getByTwitterSubject({
        subject: input.xUserId,
      });
      privyUserId = existingPrivyUser.id;
    } catch (error) {
      if (!isPrivyNotFoundError(error)) {
        throw error;
      }
    }
  }

  if (!privyUserId) {
    const createdUser = await privy.users().create({
      linked_accounts: [
        {
          type: 'twitter_oauth',
          subject: input.xUserId,
          username: input.username,
          name: input.username,
          ...(input.profilePicture ? { profile_picture_url: input.profilePicture } : {}),
        },
      ],
      wallets: [{ chain_type: 'sui' }],
    });

    privyUserId = createdUser.id;
  }

  let selectedWallet = pickCanonicalSuiWallet({
    existing,
    wallets: await listSuiWalletsForPrivyUser(privy, privyUserId),
  });

  if (!selectedWallet) {
    await privy.users().pregenerateWallets(privyUserId, {
      wallets: [{ chain_type: 'sui' }],
    });

    selectedWallet = pickCanonicalSuiWallet({
      existing,
      wallets: await listSuiWalletsForPrivyUser(privy, privyUserId),
    });
  }

  if (!selectedWallet) {
    throw new Error('Recipient Sui wallet was not returned by Privy.');
  }

  if (!selectedWallet.suiPublicKey) {
    throw new RecipientWalletConflictError('Recipient Sui wallet is missing a public key.');
  }

  assertValidStoredPublicKey(selectedWallet.suiPublicKey);

  return upsertRecipientBinding(input, {
    privyUserId,
    privyWalletId: selectedWallet.privyWalletId,
    suiAddress: selectedWallet.suiAddress,
    suiPublicKey: selectedWallet.suiPublicKey,
  });
}
