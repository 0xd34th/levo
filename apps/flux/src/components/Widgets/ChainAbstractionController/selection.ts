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

export interface DestinationRouteCandidate {
  toToken: {
    chainId: number;
  };
  netUSD?: number;
}

export interface DestinationChainOption {
  chainId: number;
  netUSD?: number;
  isBest: boolean;
}

interface DestinationChainConstraints {
  asset?: AssetGroup;
  allowedToChainIds?: Set<number>;
}

interface DestinationChainSelection extends DestinationChainConstraints {
  toChainOverride?: number;
  autoToChainId?: number;
}

export const getAllowedDestinationInstances = ({
  asset,
  allowedToChainIds,
}: DestinationChainConstraints) => {
  if (!asset) {
    return [];
  }
  if (!allowedToChainIds) {
    return asset.instances;
  }
  return asset.instances.filter((token) =>
    allowedToChainIds.has(token.chainId),
  );
};

export const sanitizeDestinationChainOverride = ({
  asset,
  allowedToChainIds,
  toChainOverride,
}: DestinationChainSelection): number | undefined => {
  if (typeof toChainOverride !== 'number') {
    return undefined;
  }
  return getAllowedDestinationInstances({ asset, allowedToChainIds }).some(
    (token) => token.chainId === toChainOverride,
  )
    ? toChainOverride
    : undefined;
};

export const resolveEffectiveDestinationChainId = ({
  asset,
  allowedToChainIds,
  toChainOverride,
  autoToChainId,
}: DestinationChainSelection): number | undefined => {
  const instances = getAllowedDestinationInstances({ asset, allowedToChainIds });
  if (!instances.length) {
    return undefined;
  }
  const hasChain = (chainId: number | undefined) =>
    typeof chainId === 'number' &&
    instances.some((token) => token.chainId === chainId);

  if (hasChain(toChainOverride)) {
    return toChainOverride;
  }
  if (hasChain(autoToChainId)) {
    return autoToChainId;
  }
  return instances[0]?.chainId;
};

export const buildDestinationChainOptions = ({
  asset,
  allowedToChainIds,
  candidates = [],
}: DestinationChainConstraints & {
  candidates?: DestinationRouteCandidate[];
}): DestinationChainOption[] => {
  const instances = getAllowedDestinationInstances({ asset, allowedToChainIds });
  const instanceChainIds = new Set(instances.map((token) => token.chainId));
  const bestCandidateByChainId = new Map<number, DestinationRouteCandidate>();

  for (const candidate of candidates) {
    const chainId = candidate.toToken.chainId;
    if (!instanceChainIds.has(chainId)) {
      continue;
    }
    const existing = bestCandidateByChainId.get(chainId);
    if (
      !existing ||
      (candidate.netUSD ?? -Infinity) > (existing.netUSD ?? -Infinity)
    ) {
      bestCandidateByChainId.set(chainId, candidate);
    }
  }

  let bestChainId: number | undefined;
  let bestNetUSD = -Infinity;
  for (const [chainId, candidate] of bestCandidateByChainId.entries()) {
    const netUSD = candidate.netUSD ?? -Infinity;
    if (netUSD > bestNetUSD) {
      bestNetUSD = netUSD;
      bestChainId = chainId;
    }
  }

  return instances.map((token) => {
    const candidate = bestCandidateByChainId.get(token.chainId);
    return {
      chainId: token.chainId,
      netUSD: candidate?.netUSD,
      isBest: bestChainId === token.chainId,
    };
  });
};
