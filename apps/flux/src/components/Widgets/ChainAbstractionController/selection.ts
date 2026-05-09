import type { AssetGroup } from '@/types/assets';

export interface ChainTokenSelectionInput {
  chainId?: number;
  tokenAddress?: string;
}

export interface ResolvedAssetSelection {
  asset: AssetGroup;
  chainId: number;
}

const hasCompleteSelection = (
  selection: ChainTokenSelectionInput | undefined,
): selection is Required<ChainTokenSelectionInput> =>
  typeof selection?.chainId === 'number' && Boolean(selection.tokenAddress);

export const resolveSelectionInput = (
  storeSelection: ChainTokenSelectionInput,
  fallbackSelection: ChainTokenSelectionInput,
): ChainTokenSelectionInput =>
  hasCompleteSelection(storeSelection) ? storeSelection : fallbackSelection;

export const findAssetByChainToken = (
  groups: AssetGroup[],
  selection: ChainTokenSelectionInput,
): ResolvedAssetSelection | undefined => {
  if (!hasCompleteSelection(selection)) {
    return undefined;
  }
  const tokenAddress = selection.tokenAddress.toLowerCase();
  const asset = groups.find((group) =>
    group.instances.some(
      (token) =>
        token.chainId === selection.chainId &&
        token.address.toLowerCase() === tokenAddress,
    ),
  );
  return asset ? { asset, chainId: selection.chainId } : undefined;
};

export const resolveInitialAssetSelection = (
  groups: AssetGroup[],
  storeSelection: ChainTokenSelectionInput,
  fallbackSelection: ChainTokenSelectionInput,
): ResolvedAssetSelection | undefined =>
  findAssetByChainToken(
    groups,
    resolveSelectionInput(storeSelection, fallbackSelection),
  );
