import type { SuiObjectResponse } from '@mysten/sui/jsonRpc';
import { normalizeSuiAddress } from '@mysten/sui/utils';

export type VaultOwnershipKind =
  | 'UNCLAIMED'
  | 'PREVIOUSLY_CLAIMED'
  | 'OWNED_BY_CANONICAL'
  | 'OWNED_BY_OTHER';

export interface VaultOwnershipState {
  kind: VaultOwnershipKind;
  vaultExists: boolean;
}

interface VaultLookupClient {
  getObject(input: {
    id: string;
    options?: {
      showType?: boolean;
      showContent?: boolean;
    };
  }): Promise<SuiObjectResponse>;
}

function normalizeOptionalSuiAddress(value: unknown): string | null {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }

  try {
    return normalizeSuiAddress(value);
  } catch {
    return null;
  }
}

function getVaultFields(
  objectResponse: Awaited<ReturnType<VaultLookupClient['getObject']>>,
): Record<string, unknown> | null {
  const content = objectResponse.data?.content as { fields?: Record<string, unknown> } | undefined;
  return content?.fields ?? null;
}

export async function getVaultOwnershipState(params: {
  client: VaultLookupClient;
  vaultAddress: string;
  canonicalAddress?: string | null;
}): Promise<VaultOwnershipState> {
  const { client, vaultAddress, canonicalAddress } = params;
  const objectResponse = await client.getObject({
    id: vaultAddress,
    options: { showType: true, showContent: true },
  });

  const vaultExists = objectResponse.data != null;
  const objectErrorCode = objectResponse.error?.code ?? null;

  if (
    !vaultExists &&
    objectErrorCode &&
    objectErrorCode !== 'notExists' &&
    objectErrorCode !== 'deleted'
  ) {
    throw new Error(`Unexpected vault lookup error: ${objectErrorCode}`);
  }

  if (!vaultExists) {
    return {
      kind: objectErrorCode === 'deleted' ? 'PREVIOUSLY_CLAIMED' : 'UNCLAIMED',
      vaultExists: false,
    };
  }

  const fields = getVaultFields(objectResponse);
  const ownerAddress = normalizeOptionalSuiAddress(fields?.owner);
  const normalizedCanonicalAddress = normalizeOptionalSuiAddress(canonicalAddress);

  if (!ownerAddress) {
    throw new Error('Vault object is missing owner metadata');
  }

  if (!normalizedCanonicalAddress || ownerAddress === normalizedCanonicalAddress) {
    return {
      kind: 'OWNED_BY_CANONICAL',
      vaultExists: true,
    };
  }

  return {
    kind: 'OWNED_BY_OTHER',
    vaultExists: true,
  };
}
