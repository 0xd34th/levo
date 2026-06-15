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
}

interface DestinationChainSelection extends DestinationChainConstraints {
  autoAllowedToChainIds?: Set<number>;
  toChainOverride?: number;
  autoToChainId?: number;
}

export const getDestinationInstances = ({
  asset,
}: DestinationChainConstraints) => {
  if (!asset) {
    return [];
  }
  return asset.instances;
};

export const getAutoDestinationInstances = ({
  asset,
  autoAllowedToChainIds,
}: DestinationChainConstraints & { autoAllowedToChainIds?: Set<number> }) => {
  const instances = getDestinationInstances({ asset });
  if (!autoAllowedToChainIds) {
    return instances;
  }
  return instances.filter((token) =>
    autoAllowedToChainIds.has(token.chainId),
  );
};

export const sanitizeDestinationChainOverride = ({
  asset,
  toChainOverride,
}: DestinationChainSelection): number | undefined => {
  if (typeof toChainOverride !== 'number') {
    return undefined;
  }
  return getDestinationInstances({ asset }).some(
    (token) => token.chainId === toChainOverride,
  )
    ? toChainOverride
    : undefined;
};

export const resolveEffectiveDestinationChainId = ({
  asset,
  autoAllowedToChainIds,
  toChainOverride,
  autoToChainId,
}: DestinationChainSelection): number | undefined => {
  const allInstances = getDestinationInstances({ asset });
  const autoInstances = getAutoDestinationInstances({
    asset,
    autoAllowedToChainIds,
  });
  if (!allInstances.length) {
    return undefined;
  }

  const hasAnyChain = (chainId: number | undefined) =>
    typeof chainId === 'number' &&
    allInstances.some((token) => token.chainId === chainId);
  if (hasAnyChain(toChainOverride)) {
    return toChainOverride;
  }

  if (!autoInstances.length) {
    return undefined;
  }
  const hasAutoChain = (chainId: number | undefined) =>
    typeof chainId === 'number' &&
    autoInstances.some((token) => token.chainId === chainId);

  if (hasAutoChain(autoToChainId)) {
    return autoToChainId;
  }
  return autoInstances[0]?.chainId;
};

export const buildDestinationChainOptions = ({
  asset,
  candidates = [],
}: DestinationChainConstraints & {
  candidates?: DestinationRouteCandidate[];
}): DestinationChainOption[] => {
  const instances = getDestinationInstances({ asset });
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

export const buildQuoteAllowedToChainIds = ({
  receivableToChainIds,
  toChainOverride,
}: {
  receivableToChainIds?: Set<number>;
  toChainOverride?: number;
}): Set<number> | undefined => {
  if (!receivableToChainIds && typeof toChainOverride !== 'number') {
    return undefined;
  }
  const allowed = new Set(receivableToChainIds ?? []);
  if (typeof toChainOverride === 'number') {
    allowed.add(toChainOverride);
  }
  return allowed;
};
