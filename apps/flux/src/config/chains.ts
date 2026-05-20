import { ChainId } from '@lifi/sdk';

export const widgetAllowedChainIds: ChainId[] = [
  ChainId.SOL,
  ChainId.BAS,
  ChainId.MON,
  ChainId.SUI,
  ChainId.ETH,
  ChainId.ARB,
  ChainId.HPL,
  ChainId.HYP,
  ChainId.BSC,
  ChainId.OPT,
  ChainId.POL,
];

const widgetAllowedChainIdSet = new Set<number>(widgetAllowedChainIds);

export function isWidgetAllowedChainId(chainId: number) {
  return widgetAllowedChainIdSet.has(chainId);
}

export function filterAllowedWidgetChainIds(
  chainIds?: readonly number[],
): ChainId[] {
  const source = chainIds?.length ? chainIds : widgetAllowedChainIds;
  return source.filter(isWidgetAllowedChainId) as ChainId[];
}

export function filterAllowedWidgetChains<T extends { id: number }>(
  chains: T[],
): T[] {
  return chains.filter((chain) => isWidgetAllowedChainId(chain.id));
}
