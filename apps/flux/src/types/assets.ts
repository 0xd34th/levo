import type { BaseToken } from '@/types/tokens';

/**
 * A logical asset (e.g. "USDC") that exists across one or more chains.
 * Built by useAssetGroups by grouping token instances on a stable
 * cross-chain key (coinKey first, symbol fallback).
 */
export interface AssetGroup {
  id: string;
  symbol: string;
  name: string;
  logoURI?: string;
  instances: BaseToken[];
}

export interface AssetSelection {
  group: AssetGroup;
  selectedChainId: number;
}

export const findInstance = (
  group: AssetGroup,
  chainId: number,
): BaseToken | undefined =>
  group.instances.find((t) => t.chainId === chainId);

export const isMultiChainAsset = (group: AssetGroup): boolean =>
  group.instances.length > 1;
